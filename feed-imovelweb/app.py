#!/usr/bin/env python3
"""
Serviço do feed unificado ImovelWeb — Aliança Multi Offices
(RE/MAX Ville, Homemark, Alcance)

Roda no Render. O n8n só agenda e confere; o trabalho pesado mora aqui,
porque montar 52 MB de XML dentro de um Code node derruba a instância do
n8n Cloud (ver incidente_oom_agendamentos_23ago.md).

Endpoints
    GET  /saude              — vivo?
    POST /gerar              — começa a geração (assíncrona). Devolve job_id.
    GET  /status             — estado do último job
    GET  /status/{job_id}    — estado de um job específico

Autenticação: header  x-feed-token  igual à variável de ambiente FEED_TOKEN.
(GET /saude é aberto, para o health check do Render.)

Variáveis de ambiente
    FEED_TOKEN            obrigatório — segredo do endpoint
    SUPABASE_URL          ex.: https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY  service role (grava no Storage)
    SUPABASE_BUCKET       padrão: criativos-imoveis
    FEED_PREFIXO          padrão: feeds       (pasta dentro do bucket)
    DIR_SAIDA             padrão: /tmp/feeds
    GZIP                  "1" para subir também o .xml.gz
"""

import gzip
import os
import shutil
import threading
import traceback
import uuid
from datetime import datetime, timezone

import requests
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

import unificar_feeds as uf

FEED_TOKEN = os.environ.get("FEED_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BUCKET = os.environ.get("SUPABASE_BUCKET", "criativos-imoveis")
PREFIXO = os.environ.get("FEED_PREFIXO", "feeds").strip("/")
USAR_GZIP = os.environ.get("GZIP", "") == "1"

uf.DIR_SAIDA = os.environ.get("DIR_SAIDA", "/tmp/feeds")

app = FastAPI(title="Feed unificado ImovelWeb")

# job store em memória: o serviço roda uma instância e um job por vez
JOBS = {}
LOCK = threading.Lock()


def agora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def confere_token(token):
    if not FEED_TOKEN:
        raise HTTPException(500, "FEED_TOKEN não configurado no serviço.")
    if token != FEED_TOKEN:
        raise HTTPException(401, "token inválido")


def url_publica(nome_arquivo):
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{PREFIXO}/{nome_arquivo}"


def subir(caminho, nome_arquivo, content_type):
    """Envia o arquivo ao Storage do Supabase, em streaming (não carrega em RAM)."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL/SUPABASE_SERVICE_KEY não configurados.")
    destino = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{PREFIXO}/{nome_arquivo}"
    tamanho = os.path.getsize(caminho)
    with open(caminho, "rb") as f:
        r = requests.post(
            destino,
            headers={
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "apikey": SUPABASE_KEY,
                "Content-Type": content_type,
                "Content-Length": str(tamanho),
                "x-upsert": "true",
            },
            data=f,
            timeout=600,
        )
    if r.status_code >= 400:
        # o limite de tamanho do bucket aparece aqui, como 413
        raise RuntimeError(
            f"Storage recusou {nome_arquivo}: HTTP {r.status_code} {r.text[:300]}"
        )
    return tamanho


def comprimir(caminho):
    destino = caminho + ".gz"
    with open(caminho, "rb") as e, gzip.open(destino, "wb", compresslevel=6) as s:
        shutil.copyfileobj(e, s, length=1 << 20)
    return destino


def rodar(job_id, alvos):
    job = JOBS[job_id]
    job["estado"] = "rodando"
    try:
        os.makedirs(uf.DIR_SAIDA, exist_ok=True)
        for nome in alvos:
            cfg = uf.SUCURSAIS[nome]
            item = {"sucursal": nome, "estado": "rodando"}
            job["sucursais"].append(item)
            try:
                rel = uf.processar(nome, cfg)
                caminho = os.path.join(uf.DIR_SAIDA, cfg["saida"])
                bytes_xml = subir(caminho, cfg["saida"], "application/xml")

                item.update(
                    estado="ok",
                    total=rel["total"],
                    vagas=rel["vagas"],
                    livres=rel["vagas"] - rel["total"],
                    descartados=rel["descartados"],
                    marcados=rel["marcados"],
                    tipos=rel["tipos"],
                    mb=round(bytes_xml / 1024 / 1024, 1),
                    url=url_publica(cfg["saida"]),
                )

                if USAR_GZIP:
                    gz = comprimir(caminho)
                    bytes_gz = subir(gz, cfg["saida"] + ".gz", "application/gzip")
                    item["url_gz"] = url_publica(cfg["saida"] + ".gz")
                    item["mb_gz"] = round(bytes_gz / 1024 / 1024, 1)
                    os.remove(gz)

                os.remove(caminho)  # disco do Render é efêmero e pequeno
            except Exception as e:
                item.update(estado="erro", erro=f"{type(e).__name__}: {e}")
                job["erros"] += 1
                traceback.print_exc()

        job["estado"] = "concluido" if job["erros"] == 0 else "concluido_com_erro"
    except Exception as e:  # falha fora do laço
        job["estado"] = "erro"
        job["erro"] = f"{type(e).__name__}: {e}"
        job["erros"] += 1
        traceback.print_exc()
    finally:
        job["fim"] = agora()
        # limpa os downloads temporários do urlretrieve
        for f in os.listdir("/tmp"):
            if f.startswith("feed_") and f.endswith(".xml"):
                try:
                    os.remove(os.path.join("/tmp", f))
                except OSError:
                    pass


@app.get("/saude")
def saude():
    return {
        "ok": True,
        "sucursais": list(uf.SUCURSAIS),
        "bucket": BUCKET,
        "prefixo": PREFIXO,
        "gzip": USAR_GZIP,
        "agora": agora(),
    }


@app.post("/gerar")
def gerar(
    tarefas: BackgroundTasks,
    sucursal: str = "",
    x_feed_token: str = Header(default=""),
):
    confere_token(x_feed_token)

    alvos = [sucursal] if sucursal else list(uf.SUCURSAIS)
    desconhecidas = [a for a in alvos if a not in uf.SUCURSAIS]
    if desconhecidas:
        raise HTTPException(400, f"sucursal desconhecida: {', '.join(desconhecidas)}")

    with LOCK:
        rodando = [j for j in JOBS.values() if j["estado"] == "rodando"]
        if rodando:
            return JSONResponse(
                status_code=409,
                content={
                    "erro": "já existe uma geração em andamento",
                    "job_id": rodando[0]["job_id"],
                },
            )
        job_id = uuid.uuid4().hex[:12]
        JOBS[job_id] = {
            "job_id": job_id,
            "estado": "na fila",
            "inicio": agora(),
            "fim": None,
            "alvos": alvos,
            "sucursais": [],
            "erros": 0,
        }
        JOBS["ultimo"] = JOBS[job_id]

    tarefas.add_task(rodar, job_id, alvos)
    return JSONResponse(status_code=202, content={"job_id": job_id, "estado": "na fila"})


@app.get("/status")
def status_ultimo(x_feed_token: str = Header(default="")):
    confere_token(x_feed_token)
    ultimo = JOBS.get("ultimo")
    if not ultimo:
        return {"estado": "nenhuma geração ainda"}
    return ultimo


@app.get("/status/{job_id}")
def status(job_id: str, x_feed_token: str = Header(default="")):
    confere_token(x_feed_token)
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "job não encontrado")
    return job

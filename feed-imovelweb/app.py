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
    GET  /testar             — confere se as 6 URLs de origem respondem
    GET  /destaques/{sucursal}      — tela de escolha dos destaques
    GET  /api/destaques/{sucursal}  — catalogo + escolha atual (JSON)
    POST /api/destaques/{sucursal}  — grava a escolha

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
    SUPABASE_ANON_KEY     chave publicavel (a mesma do painel) — o login usa ela
    ACESSOS               acesso de emergencia a tela, fora do banco:
                          fulano@x.com:ville,homemark;beltrano@x.com:*

Quem entra na tela sai da tabela public.feed_acessos (ver sql_feed_acessos.sql).
Estar nela nao da acesso nenhum ao painel — sao listas separadas de proposito.
"""

import gzip
import json
import os
import shutil
import threading
import time
import traceback
import uuid
from datetime import datetime, timezone

import requests
from fastapi import BackgroundTasks, Body, FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

import unificar_feeds as uf

FEED_TOKEN = os.environ.get("FEED_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BUCKET = os.environ.get("SUPABASE_BUCKET", "criativos-imoveis")
PREFIXO = os.environ.get("FEED_PREFIXO", "feeds").strip("/")
USAR_GZIP = os.environ.get("GZIP", "") == "1"
SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", "")


def _ler_acessos(texto):
    """fulano@x.com:ville,homemark;beltrano@x.com:*  ->  {email: {sucursais}}"""
    mapa = {}
    for parte in (texto or "").replace("\n", ";").split(";"):
        parte = parte.strip()
        if not parte or ":" not in parte:
            continue
        email, alvos = parte.split(":", 1)
        email = email.strip().lower()
        if not email:
            continue
        mapa.setdefault(email, set()).update(
            a.strip().lower() for a in alvos.split(",") if a.strip()
        )
    return mapa


ACESSOS = _ler_acessos(os.environ.get("ACESSOS", ""))

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
                # o padrao do Storage e 1 hora; com 5 min o portal nunca
                # pega uma copia velha logo depois de uma regeracao
                "cache-control": "max-age=300",
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


# Login da tela: o mesmo do painel — conta Google via Supabase Auth.
# O navegador faz o login e manda o token; aqui so perguntamos ao Supabase
# de quem e esse token. Guardamos a resposta por 5 minutos para nao
# consultar a cada clique.
_SESSOES = {}
_VALIDADE = 300


def email_do_pedido(authorization):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "faça login para continuar")
    token = authorization[7:].strip()

    agora_s = time.time()
    guardado = _SESSOES.get(token)
    if guardado and guardado[1] > agora_s:
        return guardado[0]

    if not SUPABASE_ANON:
        raise HTTPException(500, "SUPABASE_ANON_KEY não configurada no serviço.")
    try:
        r = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_ANON},
            timeout=20,
        )
    except Exception:
        traceback.print_exc()
        raise HTTPException(503, "não consegui validar o login agora")
    if r.status_code != 200:
        raise HTTPException(401, "sessão expirada — entre de novo")

    email = (r.json().get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "conta sem e-mail")

    if len(_SESSOES) > 500:
        _SESSOES.clear()
    _SESSOES[token] = (email, agora_s + _VALIDADE)
    return email


_PERFIS = {}


def _acesso_no_banco(email):
    """Le public.feed_acessos — a lista de quem pode mexer nos destaques.

    E uma tabela so desta tela: estar nela nao da acesso nenhum ao painel.
    Devolve o conjunto de sucursais, ou None quando nao deu para consultar.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/feed_acessos",
            headers={**_cabecalhos(), "Accept": "application/json"},
            params={"select": "email,ativo,sucursais", "email": f"eq.{email}",
                    "limit": "1"},
            timeout=20,
        )
    except Exception:
        traceback.print_exc()
        return None
    if r.status_code >= 400:
        print(f"[acessos] feed_acessos respondeu HTTP {r.status_code}: {r.text[:200]}")
        return None

    linhas = r.json()
    if not linhas:
        return set()
    linha = linhas[0]
    if not linha.get("ativo", True):
        return set()
    alvos = {str(a).strip().lower() for a in (linha.get("sucursais") or [])}
    if "*" in alvos:
        return set(uf.SUCURSAIS)
    return {a for a in alvos if a in uf.SUCURSAIS}


def _marcar_acesso(email):
    """Carimba o ultimo acesso. Falhar aqui nao pode atrapalhar ninguem."""
    try:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/feed_acessos",
            headers={**_cabecalhos(), "Content-Type": "application/json",
                     "Prefer": "return=minimal"},
            params={"email": f"eq.{email}"},
            data=json.dumps({"ultimo_acesso": agora()}),
            timeout=10,
        )
    except Exception:
        pass


def sucursais_de(email):
    """Quem pode o que. A tabela manda; a variavel ACESSOS soma a ela.

    A variavel existe como porta de emergencia: se o banco estiver fora do ar,
    voce ainda entra.
    """
    agora_s = time.time()
    guardado = _PERFIS.get(email)
    if guardado and guardado[1] > agora_s:
        alvos = set(guardado[0])
    else:
        alvos = _acesso_no_banco(email)
        if alvos is not None:
            if len(_PERFIS) > 500:
                _PERFIS.clear()
            _PERFIS[email] = (set(alvos), agora_s + _VALIDADE)
            if alvos:
                _marcar_acesso(email)
        else:
            alvos = set()

    do_ambiente = ACESSOS.get(email, set())
    if "*" in do_ambiente:
        return set(uf.SUCURSAIS)
    return alvos | {a for a in do_ambiente if a in uf.SUCURSAIS}


def exige_acesso(authorization, sucursal):
    """Devolve o e-mail de quem pediu, ou barra."""
    email = email_do_pedido(authorization)
    if sucursal not in sucursais_de(email):
        raise HTTPException(403, f"{email} não tem acesso a esta sucursal")
    return email


def _url_config(nome_arquivo):
    return f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{PREFIXO}/config/{nome_arquivo}"


def _cabecalhos():
    return {"Authorization": f"Bearer {SUPABASE_KEY}", "apikey": SUPABASE_KEY}


def ler_config(nome_arquivo, padrao):
    """Le um JSON de configuracao do Storage. Ausente = valor padrao."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return padrao
    try:
        r = requests.get(_url_config(nome_arquivo), headers=_cabecalhos(), timeout=60)
        if r.status_code >= 400:
            return padrao
        return r.json()
    except Exception:
        traceback.print_exc()
        return padrao


def gravar_config(nome_arquivo, dados):
    corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
    r = requests.post(
        _url_config(nome_arquivo),
        headers={
            **_cabecalhos(),
            "Content-Type": "application/json; charset=utf-8",
            "x-upsert": "true",
            "cache-control": "max-age=60",
        },
        data=corpo,
        timeout=120,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Storage recusou {nome_arquivo}: "
                           f"HTTP {r.status_code} {r.text[:300]}")
    return len(corpo)


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
        # Zera os caches da rodada e levanta, uma unica vez, quais imoveis
        # aparecem em mais de uma sucursal — so esses recebem o recorte de fotos.
        uf.nova_execucao()
        compartilhados = uf.levantar_compartilhados()
        for nome in alvos:
            cfg = uf.SUCURSAIS[nome]
            item = {"sucursal": nome, "estado": "rodando"}
            job["sucursais"].append(item)
            try:
                escolhas = ler_config(f"destaques_{nome}.json",
                                      {"HOME": [], "DESTACADO": [], "SIMPLE": []})
                rel = uf.processar(nome, cfg, escolhas=escolhas,
                                   compartilhados=compartilhados)
                caminho = os.path.join(uf.DIR_SAIDA, cfg["saida"])
                bytes_xml = subir(caminho, cfg["saida"], "application/xml; charset=utf-8")

                # o catalogo alimenta a tela de destaques
                gravar_config(f"catalogo_{nome}.json", {
                    "sucursal": nome,
                    "gerado_em": agora(),
                    "cota_home": rel["cota_home"],
                    "cota_destacado": rel["cota_destacado"],
                    "itens": rel["catalogo"],
                })

                item.update(
                    estado="ok",
                    home=rel["home"],
                    titulos_proprios=rel.get("titulos_proprios"),
                    anuncios_recortados=rel.get("anuncios_recortados"),
                    fotos_removidas=rel.get("fotos_removidas"),
                    home_manual=rel["home_manual"],
                    destacado=rel["destacado"],
                    destacado_manual=rel["destacado_manual"],
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


@app.get("/gerar")
def gerar_pelo_navegador(
    tarefas: BackgroundTasks,
    token: str = "",
    sucursal: str = "",
):
    """Mesma coisa que o POST, mas dá para colar no navegador.

    Existe para o disparo manual: POST com header não se faz pela barra de
    endereço. O n8n continua usando o POST com o header.
    """
    confere_token(token)
    return gerar(tarefas, sucursal=sucursal, x_feed_token=token)


@app.get("/testar")
def testar(token: str = "", x_feed_token: str = Header(default="")):
    """Diagnostico: bate nas 6 URLs de origem e devolve o codigo HTTP de cada uma.

    Serve para separar "o site bloqueou o servidor" de "a URL mudou".
    """
    confere_token(x_feed_token or token)
    testes = []
    for nome, cfg in uf.SUCURSAIS.items():
        for origem in ("ilist", "nonstop"):
            url = cfg[origem]
            item = {"sucursal": nome, "origem": origem, "url": url}
            try:
                r = requests.get(
                    url,
                    headers=uf.CABECALHOS_HTTP,
                    stream=True,
                    timeout=60,
                    allow_redirects=True,
                )
                item["http"] = r.status_code
                item["tipo"] = r.headers.get("Content-Type", "")
                item["tamanho"] = r.headers.get("Content-Length", "")
                if r.url != url:
                    item["redirecionou_para"] = r.url
                trecho = next(r.iter_content(300), b"")
                item["inicio"] = trecho.decode("utf-8", "replace")
                r.close()
            except Exception as e:
                item["erro"] = f"{type(e).__name__}: {e}"
            testes.append(item)
    return {"testes": testes}


@app.get("/api/config")
def config_da_tela():
    """Dados publicos que a tela precisa para fazer o login com o Google."""
    return {"supabase_url": SUPABASE_URL, "supabase_anon_key": SUPABASE_ANON}


@app.get("/destaques/{sucursal}", response_class=HTMLResponse)
def tela_destaques(sucursal: str):
    """A pagina em si e publica; ela nao mostra nada sem login.

    Quem guarda os dados sao as rotas /api/destaques, e essas exigem uma
    conta Google autorizada.
    """
    if sucursal not in uf.SUCURSAIS:
        raise HTTPException(404, "sucursal desconhecida")
    caminho = os.path.join(os.path.dirname(os.path.abspath(__file__)), "destaques.html")
    with open(caminho, encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/api/destaques/{sucursal}")
def api_destaques(sucursal: str, authorization: str = Header(default="")):
    if sucursal not in uf.SUCURSAIS:
        raise HTTPException(404, "sucursal desconhecida")
    email = exige_acesso(authorization, sucursal)
    cfg = uf.SUCURSAIS[sucursal]
    catalogo = ler_config(f"catalogo_{sucursal}.json", None)
    escolha = ler_config(f"destaques_{sucursal}.json",
                         {"HOME": [], "DESTACADO": [], "SIMPLE": [],
                          "atualizado_em": None})
    return {
        "sucursal": sucursal,
        "email": email,
        "minhas_sucursais": sorted(sucursais_de(email)),
        "cota_home": cfg.get("cota_home", 0),
        "cota_destacado": cfg.get("cota_destacado", 0),
        "catalogo": catalogo,
        "escolha": escolha,
    }


@app.post("/api/destaques/{sucursal}")
def salvar_destaques(
    sucursal: str,
    corpo: dict = Body(...),
    authorization: str = Header(default=""),
):
    if sucursal not in uf.SUCURSAIS:
        raise HTTPException(404, "sucursal desconhecida")
    email = exige_acesso(authorization, sucursal)
    cfg = uf.SUCURSAIS[sucursal]

    def lista(chave):
        valores = corpo.get(chave) or []
        if not isinstance(valores, list):
            raise HTTPException(400, f"{chave} deve ser uma lista")
        limpos, vistos = [], set()
        for v in valores:
            v = str(v).strip()
            if v and v not in vistos:
                vistos.add(v)
                limpos.append(v)
        return limpos

    home, destacado = lista("HOME"), lista("DESTACADO")
    # SIMPLE aqui quer dizer "nunca destaque este": fica de fora tambem do
    # preenchimento automatico. Nao tem cota.
    simples = lista("SIMPLE")
    for a, b, rotulo in ((home, destacado, "superdestaque e destaque"),
                         (home, simples, "superdestaque e simples"),
                         (destacado, simples, "destaque e simples")):
        repetidos = set(a) & set(b)
        if repetidos:
            raise HTTPException(400, f"o mesmo imóvel está marcado como {rotulo}: "
                                     + ", ".join(sorted(repetidos)[:5]))
    if len(home) > cfg.get("cota_home", 0):
        raise HTTPException(400, f"máximo de {cfg['cota_home']} superdestaques")
    if len(destacado) > cfg.get("cota_destacado", 0):
        raise HTTPException(400, f"máximo de {cfg['cota_destacado']} destaques")

    dados = {"HOME": home, "DESTACADO": destacado, "SIMPLE": simples,
             "por": email, "atualizado_em": agora()}
    gravar_config(f"destaques_{sucursal}.json", dados)
    return {"ok": True, "home": len(home), "destacado": len(destacado),
            "simples": len(simples), "atualizado_em": dados["atualizado_em"]}


@app.get("/status")
def status_ultimo(x_feed_token: str = Header(default=""), token: str = ""):
    confere_token(x_feed_token or token)
    ultimo = JOBS.get("ultimo")
    if not ultimo:
        return {"estado": "nenhuma geração ainda"}
    return ultimo


@app.get("/status/{job_id}")
def status(job_id: str, x_feed_token: str = Header(default=""), token: str = ""):
    confere_token(x_feed_token or token)
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "job não encontrado")
    return job

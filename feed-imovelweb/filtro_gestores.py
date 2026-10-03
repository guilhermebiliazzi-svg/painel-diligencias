"""
Filtro de gestores do Nonstop — quem fica e quem sai do XML da Aliança.

Regra decidida pelo Guilherme (03/10/2026):
  * imóvel do Nonstop cujo gestor é REMAX (e-mail @remax.com.br) -> fica
  * gestor da Animacasa ou da Yuca                                -> fica
  * qualquer outro                                                -> sai
  * coluna manter_manual da tabela sobrepõe a regra (true fica, false sai)

O XML do Nonstop não traz o gestor. Ele está na página pública do imóvel
(https://www.usenonstop.com/imoveis/<agencia>/<codigo>), que não exige login.
O resultado fica em public.nonstop_gestores: só imóveis novos (ou consultados
há mais de DIAS_VALIDADE dias) são consultados de novo a cada geração.

Modo (variável FILTRO_GESTORES):
  "relatorio" (padrão) classifica e conta, mas não tira nada do XML
  "on"                 tira do XML o que a regra manda tirar
  "off"                não consulta nem filtra
Erro de consulta ou página sem gestor NUNCA tira o imóvel: na dúvida, fica.
"""

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import requests

MODO = os.environ.get("FILTRO_GESTORES", "relatorio").strip().lower()
DIAS_VALIDADE = int(os.environ.get("FILTRO_GESTORES_DIAS", "30"))
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
PERMITIDOS = re.compile(r"animacasa|yuca", re.I)
FICAM = {"remax", "parceiro_autorizado", "sem_dados", "pendente_remax"}
REMAX_BUSCA = "https://www.remax.com.br/search/agent-search/docs/search"
REMAX_FILTRO = ("content/TenantId eq 6 and content/MacroRegionId eq 55 and content/Category eq 1 "
                "and content/ExcludeAgentTraining eq false and content/Disabled eq false "
                "and content/IsRegionalOffice eq false and content/AgentName ne null "
                "and content/Hidden eq false and content/IsDisabledOffice eq false")

_TAB = {}          # codigo -> linha da tabela
_RESUMO = {}


def _hdr(extra=None):
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    if extra:
        h.update(extra)
    return h


def _carregar():
    _TAB.clear()
    ini = 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/nonstop_gestores",
            params={"select": "codigo,classificacao,manter_manual,consultado_em"},
            headers=_hdr({"Range-Unit": "items", "Range": f"{ini}-{ini + 999}"}),
            timeout=60)
        r.raise_for_status()
        lote = r.json()
        for l in lote:
            _TAB[l["codigo"]] = l
        if len(lote) < 1000:
            break
        ini += 1000


def _pick(seg, chave):
    m = re.search(r'"' + chave + r'":("([^"]*)"|null)', seg)
    return (m.group(2) if m and m.group(2) is not None else None)


def classificar(x):
    em = f"{x.get('email_corporativo') or ''} {x.get('email') or ''}"
    if re.search(r"@remax\.com\.br", em, re.I):
        return "remax", "e-mail @remax.com.br"
    if PERMITIDOS.search(em) or PERMITIDOS.search(x.get("gestor_nome") or ""):
        return "parceiro_autorizado", "Animacasa/Yuca"
    if not x.get("gestor_nome") and not x.get("email"):
        return "sem_dados", "página sem gestor"
    return "nao_remax", "e-mail fora da REMAX"


def consultar(slug, codigo):
    x = {"codigo": codigo, "sucursal_origem": slug}
    try:
        r = requests.get(f"https://www.usenonstop.com/imoveis/{slug}/{codigo}",
                         headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        h = r.text.replace('\\"', '"')
        i = h.find('"user":{"id"')
        if i >= 0:
            seg = h[i:i + 1500]
            x.update(gestor_nome=_pick(seg, "name"), gestor_tipo=_pick(seg, "type"),
                     email=_pick(seg, "email"), email_corporativo=_pick(seg, "corporateEmail"),
                     whatsapp=_pick(seg, "whatsapp"), gestor_slug=_pick(seg, "slug"))
        c, m = classificar(x)
    except Exception as e:
        c, m = "sem_dados", f"erro: {type(e).__name__}"
    x["classificacao"], x["motivo"] = c, m
    x["consultado_em"] = datetime.now(timezone.utc).isoformat()
    return x


def _tel8(t):
    d = re.sub(r"\D", "", t or "")
    return d[-8:] if len(d) >= 8 else None


def telefones_remax():
    """Telefones (8 últimos dígitos) de todos os corretores do site remax.com.br.
    Devolve None se o site não responder: aí ninguém é tirado por falta de checagem."""
    tels, skip = {}, 0
    try:
        while skip < 30000:
            r = requests.post(REMAX_BUSCA, timeout=60, headers={
                "Content-Type": "application/json", "User-Agent": "Mozilla/5.0",
                "Origin": "https://www.remax.com.br",
                "Referer": "https://www.remax.com.br/ProfileSearch?countryId=55&searchType=agent"},
                data=json.dumps({"count": False, "skip": skip, "top": 1000, "search": "*",
                                 "queryType": "full", "select": "*", "filter": REMAX_FILTRO,
                                 "orderby": "content/LastName asc, content/FirstName asc"}))
            r.raise_for_status()
            lote = r.json().get("value") or []
            for v in lote:
                c = v.get("content") or {}
                for campo in ("AgentPhone", "AgentDirectDialPhone", "WhatsApp"):
                    t = _tel8(c.get(campo))
                    if t:
                        tels[t] = f"{c.get('AgentName')} / {c.get('OfficeName')}"
            if len(lote) < 1000:
                break
            skip += 1000
    except Exception as e:
        print(f"  site REMAX indisponível ({type(e).__name__}): checagem por telefone adiada")
        return None
    return tels if len(tels) > 1000 else None


def _gravar(linhas):
    for k in range(0, len(linhas), 500):
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/nonstop_gestores?on_conflict=codigo",
            headers=_hdr({"Content-Type": "application/json",
                          "Prefer": "resolution=merge-duplicates,return=minimal"}),
            data=json.dumps(linhas[k:k + 500]), timeout=120)
        r.raise_for_status()


def preparar(itens):
    """itens: lista de (slug_agencia, codigo). Consulta os novos/vencidos e grava."""
    _RESUMO.clear()
    if MODO == "off" or not SUPABASE_URL or not SUPABASE_KEY:
        _RESUMO["modo"] = "off"
        return
    _carregar()
    limite = datetime.now(timezone.utc) - timedelta(days=DIAS_VALIDADE)
    faltam, vistos = [], set()
    for slug, cod in itens:
        if cod in vistos:
            continue
        vistos.add(cod)
        l = _TAB.get(cod)
        venc = True
        if l and l.get("consultado_em"):
            try:
                venc = datetime.fromisoformat(l["consultado_em"].replace("Z", "+00:00")) < limite
            except Exception:
                venc = True
        if l is None or venc or l.get("classificacao") == "pendente_remax":
            faltam.append((slug, cod))
    t0 = time.time()
    novos = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for x in ex.map(lambda a: consultar(*a), faltam):
            novos.append(x)
    # e-mail fora da REMAX: confere o telefone no site remax.com.br antes de tirar
    fora = [x for x in novos if x["classificacao"] == "nao_remax"]
    if fora:
        tels = telefones_remax()
        for x in fora:
            if tels is None:
                x["classificacao"], x["motivo"] = "pendente_remax", "site REMAX não respondeu; confere na próxima"
            elif _tel8(x.get("whatsapp")) in tels:
                x["classificacao"] = "remax"
                x["motivo"] = "site REMAX (telefone): " + tels[_tel8(x.get("whatsapp"))]
    if novos:
        _gravar(novos)
        for x in novos:
            ant = _TAB.get(x["codigo"], {})
            x["manter_manual"] = ant.get("manter_manual")
            _TAB[x["codigo"]] = x
    _RESUMO.update(modo=MODO, consultados=len(novos), segundos=round(time.time() - t0),
                   tirados=0, mantidos=0)
    print(f"  filtro de gestores ({MODO}): {len(novos)} consultados em "
          f"{_RESUMO['segundos']}s; tabela com {len(_TAB)} imoveis")


def manter(codigo):
    """True se o imóvel do Nonstop deve continuar no XML."""
    if MODO == "off" or not _TAB:
        return True
    l = _TAB.get(codigo)
    if not l:
        return True
    if l.get("manter_manual") is not None:
        fica = bool(l["manter_manual"])
    else:
        fica = l.get("classificacao") in FICAM
    if fica:
        _RESUMO["mantidos"] = _RESUMO.get("mantidos", 0) + 1
        return True
    _RESUMO["tirados"] = _RESUMO.get("tirados", 0) + 1
    return MODO != "on"     # em modo relatório, conta mas não tira


def resumo():
    return dict(_RESUMO)

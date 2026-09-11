#!/usr/bin/env python3
"""
Unificacao de feeds para o ImovelWeb — Aliança Multi Offices
Para cada sucursal: iList + Nonstop -> 1 XML de saida.

Deduplicacao dentro da sucursal: o mesmo imovel que vem pelo iList e pelo
Nonstop entra uma vez so (fica a versao do iList).

Diferenciacao entre sucursais: imovel anunciado por mais de uma sucursal sai
com um subconjunto proprio de fotos e um titulo proprio, para nao cair no
criterio de duplicidade da ImovelWeb. Nenhum fato do imovel e alterado.

Uso:
    python3 unificar_feeds.py                # processa todas as sucursais
    python3 unificar_feeds.py ville          # processa uma
"""

import hashlib
import re
import unicodedata
import shutil
import sys
import os
import time
import urllib.error
import urllib.request
from datetime import datetime

# ---------------------------------------------------------------- config

SUCURSAIS = {
    "ville": {
        "ilist":   "https://feeds.goiconnect.com/RemaxBrazil_Imovelweb/94EEE515-2BC3-459C-A1A3-5F717DFF984B/Remax_60124.xml",
        "nonstop": "https://www.usenonstop.com/integracoes/imovelweb/remaxville",
        "saida":   "remax_ville.xml",
        "vagas":   2742, "cota_home": 67, "cota_destacado": 175,
    },
    "homemark": {
        "ilist":   "https://feeds.goiconnect.com/RemaxBrazil_Imovelweb/1C94D1D6-CA17-45CE-AEB0-BBAC413D5683/Remax_60227.xml",
        "nonstop": "https://www.usenonstop.com/integracoes/imovelweb/homemark",
        "saida":   "remax_homemark.xml",
        "vagas":   2742, "cota_home": 67, "cota_destacado": 175,
    },
    "alcance": {
        "ilist":   "https://feeds.goiconnect.com/RemaxBrazil_Imovelweb/6EA466C8-B177-4712-9626-DC8315C4EE5B/Remax_60226.xml",
        "nonstop": "https://www.usenonstop.com/integracoes/imovelweb/remaxalcance",
        "saida":   "remax_alcance.xml",
        "vagas":   2742, "cota_home": 66, "cota_destacado": 175,
    },
}

DIR_SAIDA = os.environ.get("DIR_SAIDA", "./saida")

# Padrao do codigo RE/MAX inserido na descricao do Nonstop.
# Aceita "Codigo"/"Código", com ou sem dois-pontos, no fim ou no meio do texto.
PADRAO_CODIGO = re.compile(r"C[óo]digo\s*:?\s*(\d{6,}-\d{1,3})")

# Codigo de anuncio do iList (sempre vem em CDATA)
RE_COD_ILIST = re.compile(r"<codigoAnuncio><!\[CDATA\[(.*?)\]\]></codigoAnuncio>")

# Codigo de anuncio generico (com ou sem CDATA)
RE_COD = re.compile(r"<codigoAnuncio>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</codigoAnuncio>")
RE_DESC = re.compile(r"<descricao>(.*?)</descricao>", re.S)
RE_TIPO_PUB = re.compile(r"<tipoPublicacao>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</tipoPublicacao>", re.S)

# Bloco de fotos do anuncio. Fica dentro de <multimidia>, ao lado de <plantas>
# e <videos> — por isso a busca e no bloco <imagens>, e nao no <urlImagem> solto:
# a primeira planta tambem tem urlImagem e nao serve de capa.
RE_IMAGENS = re.compile(r"<imagens>(.*?)</imagens>", re.S)
RE_URL_IMG = re.compile(r"<urlImagem>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</urlImagem>", re.S)


# ---------------------------------------------------------------- io

# Alguns provedores (goiconnect/Akamai) recusam o User-Agent padrao do Python
# com 403 ou 404. Pedimos como um navegador normal.
CABECALHOS_HTTP = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/xml,text/xml,application/rss+xml,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Connection": "close",
}


def baixar(origem, destino, tentativas=3):
    """Baixa a URL para destino, em streaming. Erro traz a URL e o codigo HTTP."""
    ultimo = "sem detalhe"
    for n in range(1, tentativas + 1):
        pedido = urllib.request.Request(origem, headers=CABECALHOS_HTTP)
        try:
            with urllib.request.urlopen(pedido, timeout=300) as r:
                with open(destino, "wb") as f:
                    shutil.copyfileobj(r, f, 1 << 20)
            return destino
        except urllib.error.HTTPError as e:
            ultimo = f"HTTP {e.code} {e.reason}"
            if e.code in (401, 403, 404, 410):
                break  # repetir nao resolve
        except Exception as e:
            ultimo = f"{type(e).__name__}: {e}"
        if n < tentativas:
            time.sleep(3 * n)
    raise RuntimeError(f"nao consegui baixar {origem} -> {ultimo}")


def sem_cache(url):
    """Acrescenta um selo unico a URL.

    As origens ficam atras de CDN. Cada ponto da rede guarda a sua copia, e
    ja pegamos uma de 11 dias atras (07/09): o XML sairia perfeito, so com
    estoque velho — falha silenciosa, sem erro e sem alarme. Um parametro
    novo a cada execucao vira uma chave de cache inedita e obriga a CDN a
    buscar na origem.
    """
    return url + ("&" if "?" in url else "?") + "_=" + str(int(time.time()))


# Arquivos ja baixados NESTA execucao. Evita baixar o mesmo feed duas vezes
# quando o levantamento de compartilhados e a geracao passam pelo mesmo XML.
# E limpo por nova_execucao() no inicio de cada rodada — nunca entre rodadas,
# senao voltariamos a publicar estoque velho (o problema de CDN de 07/09).
_ARQUIVOS = {}


def nova_execucao():
    """Zera os caches de uma rodada. Chamar ANTES de gerar."""
    _ARQUIVOS.clear()
    _COMPARTILHADOS.clear()
    _COMPARTILHADOS_PRONTO.clear()


def obter(origem):
    """Le de arquivo local ou baixa de URL. Retorna caminho local."""
    if not origem.startswith("http"):
        return origem
    if origem in _ARQUIVOS:
        return _ARQUIVOS[origem]
    destino = f"/tmp/feed_{abs(hash(origem))}.xml"
    caminho = baixar(sem_cache(origem), destino)
    _ARQUIVOS[origem] = caminho
    return caminho


def blocos_imovel(caminho, tam=1 << 20):
    """Gera cada <Imovel>...</Imovel> lendo em blocos, sem depender de quebras de linha."""
    resto = ""
    with open(caminho, encoding="utf-8-sig", errors="replace") as f:
        while True:
            pedaco = f.read(tam)
            if not pedaco:
                break
            resto += pedaco
            while True:
                i = resto.find("<Imovel>")
                if i == -1:
                    resto = resto[-16:] if len(resto) > 16 else resto
                    break
                j = resto.find("</Imovel>", i)
                if j == -1:
                    resto = resto[i:]
                    break
                yield resto[i:j + 9]
                resto = resto[j + 9:]


# ---------------------------------------------------------------- core

def foto_de(bloco):
    """URL da primeira foto util do anuncio. O iList costuma abrir a lista com
    um <urlImagem /> vazio, entao nao basta pegar a primeira."""
    m = RE_IMAGENS.search(bloco)
    if not m:
        return ""
    for url in RE_URL_IMG.findall(m.group(1)):
        url = url.strip()
        if url.startswith("http"):
            return url
    return ""


def operacao_de(bloco):
    """Normaliza a operacao. As origens escrevem em espanhol e em caixas
    diferentes: Venta, VENTA, Alquiler."""
    o = campo("operacao", bloco).strip().upper()
    if o.startswith("VEN"):
        return "VENDA"
    if o.startswith("ALQ") or o.startswith("ALUG") or o.startswith("LOC"):
        return "ALUGUEL"
    return o[:20]


def preco_de(bloco):
    """Primeiro valor de <precos><preco><quantidade>. 0 quando nao ha."""
    try:
        return float(campo("quantidade", bloco) or 0)
    except ValueError:
        return 0.0


# ------------------------------------------------- diferenciacao por sucursal
#
# O mesmo imovel pode ser anunciado por mais de uma sucursal — cada uma tem a
# sua conta e o seu direito de anunciar. So que os anuncios saiam IDENTICOS
# (mesmas fotos, mesmo titulo) e o portal marcava como duplicata.
#
# Criterio da ImovelWeb (Playbook SAC RE - ImovelWeb - BR):
#   - Fotos: 80% de similaridade nas imagens — A ORDEM NAO IMPORTA.
#   - Caracteristicas: mesma operacao, tipo, bairro, preco, quartos,
#     banheiros e metragem.
#   - Categorias: mesmo modelo de anuncio.
#
# Por isso a v1 (girar a ordem das fotos) nao servia para nada: mexia
# exatamente no unico aspecto que o criterio declara ignorar. O que separa de
# verdade e cada sucursal publicar um SUBCONJUNTO diferente das fotos.
#
# Nada aqui altera um fato do imovel: endereco, valor, area, comodos, IPTU e
# condominio saem intactos. Muda so QUANTAS e QUAIS fotos vao ao ar e como o
# titulo e redigido.

RE_BLOCO_IMAGENS = re.compile(r"(<imagens>)(.*?)(</imagens>)", re.S)
RE_UMA_IMAGEM = re.compile(r"<imagem>.*?</imagem>", re.S)
RE_CARACTERISTICA = re.compile(
    r"<caracteristica>\s*(?:<id>.*?</id>\s*)?<nome>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</nome>"
    r"\s*<valor>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</valor>", re.S)

POSICAO_SUCURSAL = {"ville": 0, "homemark": 1, "alcance": 2}

# Quantas fotos cada sucursal descarta: 1 a cada PASSO_RECORTE.
#   3 -> descarta 33%, sobreposicao entre duas sucursais ~50%  (margem larga)
#   4 -> descarta 25%, sobreposicao ~67%                       (margem de 13 pontos)
#   5 -> descarta 20%, sobreposicao ~75%                       (perto demais dos 80%)
# Medido nos XMLs de 10/09 sobre os 1.501 imoveis compartilhados.
PASSO_RECORTE = int(os.environ.get("PASSO_RECORTE", "3"))

# Abaixo disso o anuncio sai inteiro: cortar foto de anuncio pobre custa mais
# do que a duplicidade. Sao 9 imoveis dos 1.501.
MIN_FOTOS_RECORTE = 9

# Piso de seguranca: nunca deixar um anuncio com menos que isto depois do corte.
MIN_FOTOS_PUBLICADAS = 6


def chave_compartilhada(codigo):
    """O que identifica o IMOVEL entre sucursais: o sufixo depois do '#'.

    remaxville#1A57L, homemark#1A57L e alcance#1A57L sao o mesmo imovel.
    """
    return (codigo.split("#", 1)[1] if "#" in codigo else codigo).strip().upper()


def _semente(codigo):
    chave = chave_compartilhada(codigo)
    return int(hashlib.md5(chave.encode("utf-8")).hexdigest()[:8], 16)


# ------------------------------------------------- quem e compartilhado

_COMPARTILHADOS = set()
_COMPARTILHADOS_PRONTO = []


def _chaves_da_sucursal(cfg):
    chaves = set()
    for url in (cfg["ilist"], cfg["nonstop"]):
        for bloco in blocos_imovel(obter(url)):
            m = RE_COD.search(bloco)
            if m:
                chaves.add(chave_compartilhada(m.group(1).strip()))
    return chaves


def levantar_compartilhados():
    """Chaves de imovel que aparecem em duas ou mais sucursais.

    So esses recebem o recorte de fotos. Cortar foto de imovel exclusivo seria
    perda pura: nao existe duplicata para desfazer.

    Varre SEMPRE as tres sucursais, mesmo quando so uma vai ser gerada — nao da
    para saber se um imovel e compartilhado olhando so para o feed de uma. Como
    obter() guarda o que ja baixou nesta execucao, numa rodada completa isso nao
    custa download nenhum a mais.
    """
    if _COMPARTILHADOS_PRONTO:
        return _COMPARTILHADOS
    vistos = {}
    for nome, cfg in SUCURSAIS.items():
        for chave in _chaves_da_sucursal(cfg):
            vistos[chave] = vistos.get(chave, 0) + 1
    _COMPARTILHADOS.update(c for c, n in vistos.items() if n >= 2)
    _COMPARTILHADOS_PRONTO.append(True)
    print(f"  compartilhados . {len(_COMPARTILHADOS)} imoveis em 2+ sucursais")
    return _COMPARTILHADOS


# ------------------------------------------------- recorte das fotos

def _url_da_imagem(item):
    achados = RE_URL_IMG.findall(item)
    url = achados[0].strip() if achados else ""
    return url if url.startswith("http") else ""


def recortar_fotos(bloco, sucursal):
    """Publica um subconjunto proprio da sucursal, preservando a ordem.

    Como funciona: as fotos sao ordenadas por hash da URL — uma ordem estavel,
    identica nas tres sucursais porque a lista de URLs e a mesma. Cada sucursal
    descarta uma posicao diferente dessa ordem (1 a cada PASSO_RECORTE). Duas
    sucursais quaisquer ficam entao com (PASSO-2)/(PASSO-1) de fotos em comum,
    abaixo dos 80% do criterio.

    O descarte e sobre o hash, nao sobre a posicao no anuncio: as fotos que
    ficam mantem a sequencia original (fachada, sala, cozinha, quartos) e o que
    sai fica espalhado — some um angulo redundante aqui e outro ali, nunca um
    comodo inteiro de uma vez.

    Devolve (bloco, quantas_sairam).
    """
    m = RE_BLOCO_IMAGENS.search(bloco)
    if not m:
        return bloco, 0
    itens = RE_UMA_IMAGEM.findall(m.group(2))
    if not itens:
        return bloco, 0

    urls = [_url_da_imagem(it) for it in itens]
    validas = [u for u in urls if u]
    if len(validas) < MIN_FOTOS_RECORTE:
        return bloco, 0

    pos = POSICAO_SUCURSAL.get(sucursal, 0) % PASSO_RECORTE
    ordem = sorted(set(validas), key=lambda u: hashlib.md5(u.encode("utf-8")).hexdigest())
    fora = {u for i, u in enumerate(ordem) if i % PASSO_RECORTE == pos}

    mantidos = [it for it, u in zip(itens, urls) if not (u and u in fora)]
    if sum(1 for it in mantidos if _url_da_imagem(it)) < MIN_FOTOS_PUBLICADAS:
        return bloco, 0

    # Capa propria da sucursal: promove a n-esima foto valida que sobrou, onde n
    # e a posicao da sucursal. O resto da sequencia fica como estava. Custa uma
    # foto de deslocamento e faz os tres anuncios pararem de abrir com a mesma
    # imagem, o que ajuda quem olha (o criterio de fotos ja foi resolvido acima).
    indices_validos = [i for i, it in enumerate(mantidos) if _url_da_imagem(it)]
    alvo = POSICAO_SUCURSAL.get(sucursal, 0)
    if alvo and len(indices_validos) > alvo:
        i = indices_validos[alvo]
        mantidos = [mantidos[i]] + mantidos[:i] + mantidos[i + 1:]

    novo = bloco[:m.start(2)] + "\n" + "\n".join(mantidos) + "\n" + bloco[m.end(2):]
    return novo, len(itens) - len(mantidos)


def _atributos(bloco):
    """Le os campos estruturados do anuncio. Nada e inventado nem estimado."""
    c = {k.strip().upper(): v.strip() for k, v in RE_CARACTERISTICA.findall(bloco)}
    def inteiro(chave):
        v = re.sub(r"[^\d]", "", c.get(chave, ""))
        return int(v) if v else None
    bairro = campo("localidade", bloco).split(",")[0].strip()
    tipo = campo("tipo", bloco).strip()
    sub = campo("subTipo", bloco).strip()
    if sub and sub.lower() not in ("padrão", "padrao", "", tipo.lower()):
        tipo = f"{tipo} {sub.lower()}"
    return {
        "tipo": tipo,
        "bairro": bairro,
        "quartos": inteiro("PRINCIPALES|QUARTO"),
        "suites": inteiro("PRINCIPALES|SUITE"),
        "vagas": inteiro("PRINCIPALES|VAGA"),
        "area": inteiro("MEDIDAS|AREA_UTIL") or inteiro("MEDIDAS|AREA_TOTAL"),
        "operacao": "locação" if operacao_de(bloco) == "ALUGUEL" else "venda",
    }


def montar_titulo(bloco, sucursal):
    """Monta um titulo proprio da sucursal a partir dos atributos reais.

    Sao tres construcoes diferentes para os MESMOS fatos. Se faltar dado para
    montar um titulo decente, devolve None e o titulo original e mantido —
    melhor repetir do que publicar titulo pela metade.
    """
    a = _atributos(bloco)
    if not a["tipo"] or not a["bairro"] or not a["area"]:
        return None

    quartos = a["quartos"]
    partes_extra = []
    if a["suites"]:
        partes_extra.append(f"{a['suites']} suíte" + ("s" if a["suites"] > 1 else ""))
    if a["vagas"]:
        partes_extra.append(f"{a['vagas']} vaga" + ("s" if a["vagas"] > 1 else ""))

    pos = POSICAO_SUCURSAL.get(sucursal, 0)
    if pos == 0:
        t = f"{a['tipo']} para {a['operacao']} em {a['bairro']}"
        if quartos:
            t += f" com {quartos} quarto" + ("s" if quartos > 1 else "")
        if partes_extra:
            t += ", sendo " + " e ".join(partes_extra)
        t += f", {a['area']}m²"
    elif pos == 1:
        t = f"{a['tipo']} de {a['area']}m² à {a['operacao']} no {a['bairro']}"
        detalhe = []
        if quartos:
            detalhe.append(f"{quartos} quarto" + ("s" if quartos > 1 else ""))
        detalhe += partes_extra
        if detalhe:
            t += " - " + ", ".join(detalhe)
    else:
        t = f"{a['bairro']}: {a['tipo']}"
        if quartos:
            t += f" de {quartos} quarto" + ("s" if quartos > 1 else "")
        t += f" e {a['area']}m² para {a['operacao']}"
        if partes_extra:
            t += " (" + ", ".join(partes_extra) + ")"

    t = re.sub(r"\s+", " ", t).strip()
    return t[:120] if len(t) > 12 else None


RE_TITULO = re.compile(r"(<titulo>)(.*?)(</titulo>)", re.S)


def aplicar_titulo(bloco, novo_titulo):
    if not novo_titulo:
        return bloco
    m = RE_TITULO.search(bloco)
    if not m:
        return bloco
    corpo = m.group(2)
    # preserva o CDATA quando a origem usa CDATA
    corpo_novo = f"<![CDATA[{novo_titulo}]]>" if "CDATA" in corpo else novo_titulo
    return bloco[:m.start(2)] + corpo_novo + bloco[m.end(2):]


def decidir_marcacao(itens, escolhas, cota_home, cota_destacado):
    """Monta o mapa codigo -> tipoPublicacao.

    Primeiro entram as escolhas feitas na tela, na ordem em que foram salvas.
    Depois, se sobrar cota, ela e completada pelos imoveis de maior valor —
    assim nenhuma vaga de destaque fica ociosa se ninguem mexer na tela.
    """
    escolhas = escolhas or {}
    presentes = {c for c, _ in itens}
    home, destacado, vistos = [], [], set()

    # Marcados como SIMPLE de proposito: ficam fora do preenchimento automatico.
    travados = {str(c).strip() for c in (escolhas.get("SIMPLE") or [])}

    for codigo in (escolhas.get("HOME") or []):
        if codigo in presentes and codigo not in vistos and len(home) < cota_home:
            home.append(codigo)
            vistos.add(codigo)
    for codigo in (escolhas.get("DESTACADO") or []):
        if codigo in presentes and codigo not in vistos and len(destacado) < cota_destacado:
            destacado.append(codigo)
            vistos.add(codigo)

    manuais = len(home), len(destacado)

    if len(home) < cota_home or len(destacado) < cota_destacado:
        for codigo, _ in sorted(itens, key=lambda x: -x[1]):
            if codigo in vistos or codigo in travados:
                continue
            if len(home) < cota_home:
                home.append(codigo)
            elif len(destacado) < cota_destacado:
                destacado.append(codigo)
            else:
                break
            vistos.add(codigo)

    mapa = {c: "HOME" for c in home}
    mapa.update({c: "DESTACADO" for c in destacado})
    return mapa, manuais


def processar(nome, cfg, escolhas=None, compartilhados=None):
    if compartilhados is None:
        compartilhados = levantar_compartilhados()
    print(f"\n{'='*58}\n{nome.upper()}\n{'='*58}")

    # 1. codigos de referencia do iList
    #
    # Duas familias de codigo convivem no feed do iList:
    #   601241001-24            formato antigo (vem em CDATA)
    #   lucasaukar#NZ35X        formato novo, por corretor (vem sem CDATA)
    # O que identifica o imovel no formato novo e o sufixo depois do "#":
    # o mesmo anuncio aparece no Nonstop como remaxville#NZ35X.
    p_ilist = obter(cfg["ilist"])
    codigos_ilist, sufixos_ilist = set(), set()
    for bloco in blocos_imovel(p_ilist):
        m = RE_COD.search(bloco)
        if not m:
            continue
        codigo = m.group(1).strip()
        codigos_ilist.add(codigo)
        if "#" in codigo:
            sufixos_ilist.add(codigo.split("#", 1)[1].strip().upper())
    print(f"  iList ......... {len(codigos_ilist)} imoveis "
          f"({len(sufixos_ilist)} no formato corretor#CODIGO)")

    # 2. varre o Nonstop, descartando o que ja existe no iList
    #
    # A varredura so CONTA e decide; a escrita faz outra passada pelo arquivo
    # local. Guardar os blocos numa lista significaria o XML inteiro (52 MB na
    # Ville) na memoria — foi assim que a v1 estourou.
    p_nonstop = obter(cfg["nonstop"])

    def descartar(bloco):
        """True se este bloco do Nonstop duplica um imovel do iList.

        Regra 1 (atual): o codigo do Nonstop e remaxville#NZ35X e o mesmo
        sufixo NZ35X aparece no iList como lucasaukar#NZ35X.

        Regra 2 (legado): a descricao do Nonstop trazia "Codigo 601241001-24".
        O Nonstop parou de publicar isso, mas a regra fica: nao custa nada e
        volta a funcionar sozinha se o texto reaparecer.
        """
        m = RE_COD.search(bloco)
        if m and "#" in m.group(1):
            sufixo = m.group(1).split("#", 1)[1].strip().upper()
            if sufixo in sufixos_ilist:
                return True, m.group(1).strip()

        m_desc = RE_DESC.search(bloco)
        if not m_desc:
            return False, None
        m = PADRAO_CODIGO.search(m_desc.group(1))
        if not m:
            return False, None
        codigo = m.group(1)
        return (codigo in codigos_ilist), codigo

    descartados, marcados, mantidos_n = [], 0, 0
    for bloco in blocos_imovel(p_nonstop):
        fora, codigo = descartar(bloco)
        if codigo:
            marcados += 1  # blocos em que deu para identificar um codigo
        if fora:
            cod_ns = RE_COD.search(bloco)
            descartados.append((cod_ns.group(1) if cod_ns else "?", codigo))
        else:
            mantidos_n += 1

    total_ns = mantidos_n + len(descartados)
    print(f"  Nonstop ....... {total_ns} imoveis ({marcados} com codigo reconhecido)")
    print(f"  descartados ... {len(descartados)} (duplicados do iList)")

    # 3. levanta codigo e preco de tudo que vai entrar, para decidir os destaques
    itens = []
    for bloco in blocos_imovel(p_ilist):
        m = RE_COD.search(bloco)
        if m:
            itens.append((m.group(1).strip(), preco_de(bloco)))
    for bloco in blocos_imovel(p_nonstop):
        fora, _ = descartar(bloco)
        if fora:
            continue
        m = RE_COD.search(bloco)
        if m:
            itens.append((m.group(1).strip(), preco_de(bloco)))

    cota_h = cfg.get("cota_home", 0)
    cota_d = cfg.get("cota_destacado", 0)
    marcacao, (manual_h, manual_d) = decidir_marcacao(itens, escolhas, cota_h, cota_d)

    # 4. monta o XML de saida, ja com o tipoPublicacao decidido
    os.makedirs(DIR_SAIDA, exist_ok=True)
    destino = os.path.join(DIR_SAIDA, cfg["saida"])
    tipos = {}
    total = 0
    catalogo = []
    trocados = [0]      # quantos titulos foram reescritos
    recortados = [0]    # quantos anuncios tiveram fotos recortadas
    fotos_fora = [0]    # quantas fotos sairam no total

    def escrever(out, bloco, fonte):
        nonlocal total
        codigo = ""
        m = RE_COD.search(bloco)
        if m:
            codigo = m.group(1).strip()
        # O tipoPublicacao passa a ser SEMPRE nosso: o que nao foi escolhido
        # vira SIMPLE. Sem isso, um HOME que ja viesse da origem se somaria
        # aos nossos e a cota estouraria por um ou dois.
        tipo = marcacao.get(codigo, "SIMPLE")
        bloco, trocas = RE_BLOCO_PUB.subn(
            f"<tipoPublicacao>{tipo}</tipoPublicacao>", bloco, count=1)
        if not trocas:
            tipo = "sem tipoPublicacao"
        # Diferenciacao entre sucursais. O recorte de fotos so vale a pena onde
        # existe duplicata: em imovel exclusivo seria perder foto de graca.
        if codigo and chave_compartilhada(codigo) in compartilhados:
            bloco, saiu = recortar_fotos(bloco, nome)
            if saiu:
                recortados[0] += 1
                fotos_fora[0] += saiu
        titulo_novo = montar_titulo(bloco, nome)
        if titulo_novo:
            bloco = aplicar_titulo(bloco, titulo_novo)
            trocados[0] += 1

        out.write(bloco.rstrip() + "\n")
        total += 1
        tipos[tipo] = tipos.get(tipo, 0) + 1
        catalogo.append({
            "c": codigo,
            "t": campo("titulo", bloco)[:110],   # ja com o titulo da sucursal
            "e": campo("endereco", bloco).strip()[:70],
            "p": preco_de(bloco),
            "o": operacao_de(bloco),
            "u": foto_de(bloco),
            "f": fonte,
        })

    with open(destino, "w", encoding="utf-8") as out:
        out.write('<?xml version="1.0" encoding="UTF-8"?>\n<OpenNavent>\n<Imoveis>\n')

        for bloco in blocos_imovel(p_ilist):          # iList integral
            escrever(out, bloco, "i")

        for bloco in blocos_imovel(p_nonstop):        # Nonstop filtrado
            fora, _ = descartar(bloco)
            if fora:
                continue
            escrever(out, bloco, "n")

        out.write("</Imoveis>\n</OpenNavent>\n")

    # 5. relatorio
    mb = os.path.getsize(destino) / 1024 / 1024
    print(f"\n  SAIDA: {destino}  ({total} imoveis, {mb:.1f} MB)")
    print(f"  tipoPublicacao: " + " | ".join(f"{k}={v}" for k, v in sorted(tipos.items())))
    print(f"  titulos proprios da sucursal: {trocados[0]} de {total}")
    if recortados[0]:
        media = fotos_fora[0] / recortados[0]
        print(f"  fotos recortadas: {recortados[0]} anuncios compartilhados "
              f"(-{fotos_fora[0]} fotos, media {media:.1f} por anuncio, "
              f"passo {PASSO_RECORTE})")
    else:
        print(f"  fotos recortadas: nenhum anuncio (passo {PASSO_RECORTE})")
    print(f"  destaques: {tipos.get('HOME', 0)}/{cota_h} super "
          f"({manual_h} escolhidos na tela), "
          f"{tipos.get('DESTACADO', 0)}/{cota_d} destaque "
          f"({manual_d} escolhidos na tela)")

    livres = cfg["vagas"] - total
    if livres >= 0:
        print(f"  vagas: {total}/{cfg['vagas']}  ->  {livres} livres")
    else:
        print(f"  ATENCAO: excede a cota em {-livres} anuncios")

    if descartados:
        print(f"\n  removidos:")
        for cod_ns, cod_il in descartados[:10]:
            print(f"    {cod_ns}  ->  {cod_il}")
        if len(descartados) > 10:
            print(f"    (+{len(descartados)-10})")

    return {"unidade": nome, "total": total, "descartados": len(descartados),
            "marcados": marcados, "vagas": cfg["vagas"], "tipos": tipos,
            "catalogo": catalogo,
            "home": tipos.get("HOME", 0), "destacado": tipos.get("DESTACADO", 0),
            "home_manual": manual_h, "destacado_manual": manual_d,
            "cota_home": cota_h, "cota_destacado": cota_d,
            "titulos_proprios": trocados[0],
            "anuncios_recortados": recortados[0],
            "fotos_removidas": fotos_fora[0],
            "passo_recorte": PASSO_RECORTE}


# ================================================================ XML UNIFICADO
#
# Fase 2 (11/09/2026): pacote renegociado para 6.000 anuncios e UM arquivo so,
# com os leads dos imoveis sem dono distribuidos pela roleta.
#
# Regras, na ordem (definidas pelo Guilherme):
#   1. O iList das tres sucursais e a CARTEIRA PROPRIA. Tem prioridade.
#   2. O mesmo imovel vindo do Nonstop de qualquer sucursal e derrubado.
#   3. O que sobra do Nonstop entra uma vez so e vai para a ROLETA.
#
# Sem duplicata entre sucursais, some a razao de existir do recorte de fotos e
# do titulo por sucursal: aqui o anuncio sai inteiro, com todas as fotos.

DONO_ROLETA = "ROLETA"
PREFIXO = {"ville": "VIL", "homemark": "HMK", "alcance": "ALC", DONO_ROLETA: "PAR"}

SAIDA_UNIFICADA = os.environ.get("SAIDA_UNIFICADA", "remax_aliança.xml".replace("ç", "c"))
VAGAS_UNIFICADAS = int(os.environ.get("VAGAS_UNIFICADAS", "6000"))
COTA_HOME_UNIFICADA = int(os.environ.get("COTA_HOME_UNIFICADA", "200"))
COTA_DESTACADO_UNIFICADA = int(os.environ.get("COTA_DESTACADO_UNIFICADA", "525"))


def _so_digitos(texto):
    d = re.sub(r"[^\d]", "", texto or "")
    return d or ""


def _normalizar(texto):
    """Minuscula, sem acento, so letras e numeros separados por espaco."""
    t = unicodedata.normalize("NFD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def chave_de_fato(bloco):
    """Identidade do IMOVEL por fatos, para cruzar iList com Nonstop.

    Por que existe: os codigos do iList estao todos no formato antigo
    (601241038-128) e nunca trazem o sufixo depois do '#'. O Nonstop so usa
    'corretor#CODIGO'. As duas familias nao tem nenhum caractere em comum — a
    chave por codigo e CEGA entre os dois sistemas, e a regra "o iList derruba
    o Nonstop" acharia zero casos por motivo errado. Medido em 11/09: existem
    127 imoveis do iList publicados tambem pelo Nonstop.

    A chave usa endereco + area + quartos + banheiros + preco. Endereco sozinho
    nao serve: nao traz numero de apartamento, e dois apartamentos iguais no
    mesmo predio casariam por engano. Com area, comodos e preco juntos, isso
    fica improvavel.

    Devolve None quando falta dado — sem chave completa, nao se derruba nada.
    """
    endereco = _normalizar(campo("endereco", bloco))
    if not endereco:
        return None
    c = {k.strip().upper(): v.strip() for k, v in RE_CARACTERISTICA.findall(bloco)}
    area = _so_digitos(c.get("MEDIDAS|AREA_UTIL")) or _so_digitos(c.get("MEDIDAS|AREA_TOTAL"))
    if not area:
        return None
    quartos = _so_digitos(c.get("PRINCIPALES|QUARTO"))
    banheiros = _so_digitos(c.get("PRINCIPALES|BANHEIRO"))
    preco = int(preco_de(bloco) or 0)
    return (endereco, area, quartos, banheiros, preco)


RE_BLOCO_REF = re.compile(r"(<codigoReferencia>)(.*?)(</codigoReferencia>)", re.S)


def marcar_dono(bloco, dono):
    """Escreve o prefixo do dono no codigoReferencia: VIL-, HMK-, ALC- ou PAR-.

    O codigoReferencia hoje e copia do codigoAnuncio e nao e chave de nada no
    portal — o portal se guia pelo codigoAnuncio, que fica intacto. E por isso
    que da para usar este campo para carregar o dono ate o motor de leads, que
    e o que o modelo do projeto (secao 3, Componente B) pede.
    """
    prefixo = PREFIXO.get(dono, "PAR")
    m = RE_BLOCO_REF.search(bloco)
    if not m:
        return bloco
    corpo = m.group(2)
    atual = re.sub(r"^\s*(?:<!\[CDATA\[)?|(?:\]\]>)?\s*$", "", corpo)
    if atual.startswith(prefixo + "-"):
        return bloco
    novo = f"{prefixo}-{atual}"
    corpo_novo = f"<![CDATA[{novo}]]>" if "CDATA" in corpo else novo
    return bloco[:m.start(2)] + corpo_novo + bloco[m.end(2):]


def unir_escolhas(por_sucursal, traducao):
    """Junta as escolhas das tres telas num mapa unico para a conta unificada.

    Duas coisas precisam acontecer aqui, e nenhuma e obvia:

    1. TRADUZIR O CODIGO. A Homemark marcou 'homemark#40450'; no arquivo unico
       sobrou 'remaxville#40450'. E um imovel do iList pode ter engolido o
       anuncio do Nonstop sobre o qual a escolha foi feita. Sem a traducao, a
       escolha nao casa com nada e some sem aviso — que e exatamente o ponto
       cego ja registrado no handoff dos destaques.

    2. RESOLVER O CONFLITO. Duas sucursais podem ter marcado o mesmo imovel em
       niveis diferentes. Vale o maior: HOME > DESTACADO > SIMPLE.

    Quando as escolhas somadas passam da cota, a perda e distribuida em rodizio
    (Ville, Homemark, Alcance, Ville...) em vez de truncar a lista de uma so.
    """
    ordem = [n for n in SUCURSAIS if n in (por_sucursal or {})]
    nivel = {}       # codigo final -> nivel escolhido
    de_quem = {}     # codigo final -> sucursal que escolheu primeiro
    perdidas, conflitos = 0, 0
    forca = {"HOME": 3, "DESTACADO": 2, "SIMPLE": 1}

    fila = {n: {"HOME": [], "DESTACADO": [], "SIMPLE": []} for n in ordem}
    for nome in ordem:
        escolhas = por_sucursal.get(nome) or {}
        for rotulo in ("HOME", "DESTACADO", "SIMPLE"):
            for codigo in (escolhas.get(rotulo) or []):
                final = traducao.get(chave_compartilhada(str(codigo).strip()))
                if not final:
                    perdidas += 1          # imovel saiu do feed
                    continue
                atual = nivel.get(final)
                if atual and atual != rotulo:
                    conflitos += 1
                    if forca[rotulo] <= forca[atual]:
                        continue
                    fila[de_quem[final]][atual].remove(final)
                elif atual:
                    continue
                nivel[final] = rotulo
                de_quem[final] = nome
                fila[nome][rotulo].append(final)

    juntas = {"HOME": [], "DESTACADO": [], "SIMPLE": []}
    for rotulo in juntas:
        i, restam = 0, True
        while restam:
            restam = False
            for nome in ordem:
                lista = fila[nome][rotulo]
                if i < len(lista):
                    juntas[rotulo].append(lista[i])
                    restam = True
            i += 1

    return juntas, {"perdidas": perdidas, "conflitos": conflitos,
                    "por_sucursal": {n: {r: len(fila[n][r]) for r in fila[n]}
                                     for n in ordem}}


def processar_unificado(escolhas=None, escolhas_por_sucursal=None):
    """Gera UM XML com os imoveis das tres sucursais, sem repetir imovel."""
    print(f"\n{'='*58}\nXML UNIFICADO — ALIANCA\n{'='*58}")
    nova_execucao()

    # ---- 1. carteira propria: tudo que vem do iList das tres
    carteira = {}          # chave de codigo -> (sucursal, bloco)
    fatos_carteira = {}    # chave de fato   -> (sucursal, codigo)
    traducao = {}          # chave de codigo de QUALQUER copia -> codigo final
    sem_chave_fato = 0
    for nome, cfg in SUCURSAIS.items():
        n = 0
        for bloco in blocos_imovel(obter(cfg["ilist"])):
            m = RE_COD.search(bloco)
            if not m:
                continue
            codigo = m.group(1).strip()
            chave = chave_compartilhada(codigo)
            if chave in carteira:
                print(f"  AVISO: {codigo} ja estava na carteira de "
                      f"{carteira[chave][0]}; mantida a primeira.")
                continue
            carteira[chave] = (nome, bloco)
            traducao[chave] = codigo
            cf = chave_de_fato(bloco)
            if cf:
                fatos_carteira.setdefault(cf, (nome, codigo))
            else:
                sem_chave_fato += 1
            n += 1
        print(f"  iList {nome:<9} {n} imoveis")
    print(f"  carteira propria ... {len(carteira)} imoveis "
          f"({sem_chave_fato} sem dado suficiente para cruzar com o Nonstop)")

    # ---- 2. Nonstop: derruba o que ja esta na carteira, e nao repete imovel
    roleta = {}
    derrubados_codigo = 0
    derrubados_fato = 0
    repetidos = 0
    for nome, cfg in SUCURSAIS.items():
        for bloco in blocos_imovel(obter(cfg["nonstop"])):
            m = RE_COD.search(bloco)
            if not m:
                continue
            codigo = m.group(1).strip()
            chave = chave_compartilhada(codigo)
            if chave in carteira:
                derrubados_codigo += 1
                continue
            cf = chave_de_fato(bloco)
            if cf and cf in fatos_carteira:
                # o anuncio some, mas a escolha de destaque feita sobre ele nao
                # pode sumir junto: aponta para o codigo do iList que ficou.
                traducao[chave] = fatos_carteira[cf][1]
                derrubados_fato += 1
                continue
            if chave in roleta:
                repetidos += 1     # mesmo imovel no Nonstop de outra sucursal
                continue
            roleta[chave] = (DONO_ROLETA, bloco)
            traducao[chave] = codigo
    print(f"  Nonstop derrubado pelo codigo ... {derrubados_codigo}")
    print(f"  Nonstop derrubado pelo endereco . {derrubados_fato}")
    print(f"  Nonstop repetido entre sucursais  {repetidos}")
    print(f"  roleta ............ {len(roleta)} imoveis")

    # ---- 3. destaques, agora sobre a conta unica
    tudo = list(carteira.items()) + list(roleta.items())
    itens = []
    for _, (_, bloco) in tudo:
        m = RE_COD.search(bloco)
        if m:
            itens.append((m.group(1).strip(), preco_de(bloco)))
    if escolhas_por_sucursal:
        escolhas, diag = unir_escolhas(escolhas_por_sucursal, traducao)
        print(f"  escolhas das telas: HOME={len(escolhas['HOME'])} "
              f"DESTACADO={len(escolhas['DESTACADO'])} SIMPLE={len(escolhas['SIMPLE'])}"
              f" | conflitos={diag['conflitos']} | orfas={diag['perdidas']}")
        for n, c in diag["por_sucursal"].items():
            print(f"     {n:<9} HOME={c['HOME']:<4} DESTACADO={c['DESTACADO']}")
    else:
        diag = {}
    marcacao, (manual_h, manual_d) = decidir_marcacao(
        itens, escolhas, COTA_HOME_UNIFICADA, COTA_DESTACADO_UNIFICADA)

    # ---- 4. escreve
    os.makedirs(DIR_SAIDA, exist_ok=True)
    destino = os.path.join(DIR_SAIDA, SAIDA_UNIFICADA)
    tipos, por_dono, catalogo, total = {}, {}, [], 0
    with open(destino, "w", encoding="utf-8") as out:
        out.write('<?xml version="1.0" encoding="UTF-8"?>\n<OpenNavent>\n<Imoveis>\n')
        for _, (dono, bloco) in tudo:
            m = RE_COD.search(bloco)
            codigo = m.group(1).strip() if m else ""
            tipo = marcacao.get(codigo, "SIMPLE")
            bloco, trocas = RE_BLOCO_PUB.subn(
                f"<tipoPublicacao>{tipo}</tipoPublicacao>", bloco, count=1)
            if not trocas:
                tipo = "sem tipoPublicacao"
            bloco = marcar_dono(bloco, dono)
            out.write(bloco.rstrip() + "\n")
            total += 1
            tipos[tipo] = tipos.get(tipo, 0) + 1
            por_dono[dono] = por_dono.get(dono, 0) + 1
            catalogo.append({
                "c": codigo,
                "d": dono,
                "t": campo("titulo", bloco)[:110],
                "e": campo("endereco", bloco).strip()[:70],
                "p": preco_de(bloco),
                "o": operacao_de(bloco),
                "u": foto_de(bloco),
                "f": "i" if dono != DONO_ROLETA else "n",
            })
        out.write("</Imoveis>\n</OpenNavent>\n")

    mb = os.path.getsize(destino) / 1024 / 1024
    print(f"\n  SAIDA: {destino}  ({total} imoveis, {mb:.1f} MB)")
    print("  por dono: " + " | ".join(f"{k}={v}" for k, v in sorted(por_dono.items())))
    print("  tipoPublicacao: " + " | ".join(f"{k}={v}" for k, v in sorted(tipos.items())))
    print(f"  destaques: {tipos.get('HOME',0)}/{COTA_HOME_UNIFICADA} super "
          f"({manual_h} na tela), {tipos.get('DESTACADO',0)}/{COTA_DESTACADO_UNIFICADA} "
          f"destaque ({manual_d} na tela)")
    livres = VAGAS_UNIFICADAS - total
    if livres >= 0:
        print(f"  vagas: {total}/{VAGAS_UNIFICADAS}  ->  {livres} livres")
    else:
        print(f"  ATENCAO: excede a cota em {-livres} anuncios")

    return {"unidade": "alianca", "total": total, "arquivo": SAIDA_UNIFICADA,
            "vagas": VAGAS_UNIFICADAS, "tipos": tipos, "catalogo": catalogo,
            "por_dono": por_dono, "carteira": len(carteira), "roleta": len(roleta),
            "derrubados_codigo": derrubados_codigo, "derrubados_fato": derrubados_fato,
            "repetidos": repetidos,
            "home": tipos.get("HOME", 0), "destacado": tipos.get("DESTACADO", 0),
            "home_manual": manual_h, "destacado_manual": manual_d,
            "escolhas": diag,
            "cota_home": COTA_HOME_UNIFICADA, "cota_destacado": COTA_DESTACADO_UNIFICADA}


def main():
    alvos = sys.argv[1:] or list(SUCURSAIS)
    print(f"Unificacao de feeds — {datetime.now():%d/%m/%Y %H:%M}")
    if alvos and alvos[0] == "unificado":
        processar_unificado()
        return
    nova_execucao()
    compart = levantar_compartilhados()
    rel = [processar(n, SUCURSAIS[n], compartilhados=compart)
           for n in alvos if n in SUCURSAIS]

    print(f"\n{'='*58}\nRESUMO\n{'='*58}")
    print(f"{'unidade':<12}{'imoveis':>9}{'vagas':>8}{'livres':>9}{'dedup':>8}")
    for r in rel:
        print(f"{r['unidade']:<12}{r['total']:>9}{r['vagas']:>8}"
              f"{r['vagas']-r['total']:>9}{r['descartados']:>8}")




# ---------------------------------------------------------------- auxiliares
#
# A escolha dos destaques mora na tela servida pelo app.py; aqui ficam so as
# pecas que a unificacao usa para aplicar essa escolha ao XML.

RE_BLOCO_PUB = re.compile(r"<tipoPublicacao>.*?</tipoPublicacao>", re.S)


def campo(tag, bloco):
    m = re.search(r"<%s>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</%s>" % (tag, tag), bloco, re.S)
    return m.group(1).strip() if m else ""


if __name__ == "__main__":
    main()

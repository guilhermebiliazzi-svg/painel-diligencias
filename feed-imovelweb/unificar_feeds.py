#!/usr/bin/env python3
"""
Unificacao de feeds para o ImovelWeb — Aliança Multi Offices
Para cada sucursal: iList + Nonstop -> 1 XML de saida.

Regra: se um imovel do Nonstop traz na descricao "Código NNNNNN-NN" e
esse codigo existe no feed do iList, ele e descartado (fica a versao iList).

Uso:
    python3 unificar_feeds.py                # processa todas as sucursais
    python3 unificar_feeds.py ville          # processa uma
"""

import re
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
        "vagas":   2741, "cota_home": 66, "cota_destacado": 175,
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


def obter(origem):
    """Le de arquivo local ou baixa de URL. Retorna caminho local."""
    if origem.startswith("http"):
        destino = f"/tmp/feed_{abs(hash(origem))}.xml"
        return baixar(origem, destino)
    return origem


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


def processar(nome, cfg, escolhas=None):
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
        out.write(bloco.rstrip() + "\n")
        total += 1
        tipos[tipo] = tipos.get(tipo, 0) + 1
        catalogo.append({
            "c": codigo,
            "t": campo("titulo", bloco)[:110],
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
            "cota_home": cota_h, "cota_destacado": cota_d}


def main():
    alvos = sys.argv[1:] or list(SUCURSAIS)
    print(f"Unificacao de feeds — {datetime.now():%d/%m/%Y %H:%M}")
    rel = [processar(n, SUCURSAIS[n]) for n in alvos if n in SUCURSAIS]

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

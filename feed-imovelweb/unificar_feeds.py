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
import sys
import os
from collections import Counter
from datetime import datetime

# ---------------------------------------------------------------- config

SUCURSAIS = {
    "ville": {
        "ilist":   "https://feeds.goiconnect.com/RemaxBrazil_Imovelweb/94EEE515-2BC3-459C-A1A3-5F717DFF984B/Remax_60124.xml",
        "nonstop": "https://www.usenonstop.com/xml/imovelweb/remaxville",
        "saida":   "remax_ville.xml",
        "vagas":   2742, "cota_home": 67, "cota_destacado": 175,
    },
    "homemark": {
        "ilist":   "https://feeds.goiconnect.com/RemaxBrazil_Imovelweb/94EEE515-2BC3-459C-A1A3-5F717DFF984B/Remax_60227.xml",
        "nonstop": "https://www.usenonstop.com/xml/imovelweb/homemark",
        "saida":   "remax_homemark.xml",
        "vagas":   2742, "cota_home": 67, "cota_destacado": 175,
    },
    "alcance": {
        "ilist":   "https://feeds.goiconnect.com/RemaxBrazil_Imovelweb/94EEE515-2BC3-459C-A1A3-5F717DFF984B/Remax_60226.xml",
        "nonstop": "https://www.usenonstop.com/xml/imovelweb/remaxalcance",
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


# ---------------------------------------------------------------- io

def obter(origem):
    """Le de arquivo local ou baixa de URL. Retorna caminho local."""
    if origem.startswith("http"):
        import urllib.request
        destino = f"/tmp/feed_{abs(hash(origem))}.xml"
        urllib.request.urlretrieve(origem, destino)
        return destino
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

def processar(nome, cfg):
    print(f"\n{'='*58}\n{nome.upper()}\n{'='*58}")

    # 1. codigos de referencia do iList
    p_ilist = obter(cfg["ilist"])
    with open(p_ilist, encoding="utf-8-sig", errors="replace") as f:
        codigos_ilist = set(RE_COD_ILIST.findall(f.read()))
    print(f"  iList ......... {len(codigos_ilist)} imoveis")

    # 2. varre o Nonstop, descartando o que ja existe no iList
    #
    # v2: antes os blocos mantidos ficavam todos numa lista ate a hora de
    # escrever — ou seja, o XML inteiro (52 MB na Ville) na memoria. Aqui a
    # varredura so CONTA e decide; a escrita faz uma segunda passada pelo
    # arquivo local. O criterio de descarte e identico ao da v1.
    p_nonstop = obter(cfg["nonstop"])

    def descartar(bloco):
        """True se este bloco do Nonstop duplica um imovel do iList."""
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
            marcados += 1
        if fora:
            cod_ns = RE_COD.search(bloco)
            descartados.append((cod_ns.group(1) if cod_ns else "?", codigo))
        else:
            mantidos_n += 1

    total_ns = mantidos_n + len(descartados)
    print(f"  Nonstop ....... {total_ns} imoveis ({marcados} com codigo na descricao)")
    print(f"  descartados ... {len(descartados)} (duplicados do iList)")

    # 3. monta o XML de saida
    os.makedirs(DIR_SAIDA, exist_ok=True)
    destino = os.path.join(DIR_SAIDA, cfg["saida"])
    tipos = {}
    total = 0

    with open(destino, "w", encoding="utf-8") as out:
        out.write('<?xml version="1.0" encoding="UTF-8"?>\n<OpenNavent>\n<Imoveis>\n')

        for bloco in blocos_imovel(p_ilist):          # iList integral
            out.write(bloco.rstrip() + "\n")
            total += 1
            t = RE_TIPO_PUB.search(bloco)
            tipos[t.group(1) if t else "?"] = tipos.get(t.group(1) if t else "?", 0) + 1

        for bloco in blocos_imovel(p_nonstop):        # Nonstop filtrado (2a passada)
            fora, _ = descartar(bloco)
            if fora:
                continue
            out.write(bloco.rstrip() + "\n")
            total += 1
            t = RE_TIPO_PUB.search(bloco)
            tipos[t.group(1) if t else "?"] = tipos.get(t.group(1) if t else "?", 0) + 1

        out.write("</Imoveis>\n</OpenNavent>\n")

    # 4. relatorio
    mb = os.path.getsize(destino) / 1024 / 1024
    print(f"\n  SAIDA: {destino}  ({total} imoveis, {mb:.1f} MB)")
    print(f"  tipoPublicacao: " + " | ".join(f"{k}={v}" for k, v in sorted(tipos.items())))

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
            "marcados": marcados, "vagas": cfg["vagas"], "tipos": tipos}


def main():
    args = sys.argv[1:]
    if "--catalogo" in args:
        print("Gerando catalogo para a tela de destaques")
        gerar_catalogo()
        return
    if "--marcacao" in args:
        i = args.index("--marcacao")
        print("Aplicando marcacao aos XMLs de saida")
        aplicar_marcacao(args[i + 1])
        return
    alvos = args or list(SUCURSAIS)
    print(f"Unificacao de feeds — {datetime.now():%d/%m/%Y %H:%M}")
    rel = [processar(n, SUCURSAIS[n]) for n in alvos if n in SUCURSAIS]

    print(f"\n{'='*58}\nRESUMO\n{'='*58}")
    print(f"{'unidade':<12}{'imoveis':>9}{'vagas':>8}{'livres':>9}{'dedup':>8}")
    for r in rel:
        print(f"{r['unidade']:<12}{r['total']:>9}{r['vagas']:>8}"
              f"{r['vagas']-r['total']:>9}{r['descartados']:>8}")




# ---------------------------------------------------------------- extras
#
# Alem da unificacao, este arquivo gera o catalogo usado pela tela de
# destaques e aplica de volta a marcacao feita nela.
#
#   python3 unificar_feeds.py --catalogo        -> gera catalogo.json
#   python3 unificar_feeds.py --marcacao destaques.json
#                                               -> gera os XMLs ja marcados
#
# A marcacao substitui o <tipoPublicacao> do imovel pelo tipo escolhido.

RE_BLOCO_PUB = re.compile(r"<tipoPublicacao>.*?</tipoPublicacao>", re.S)


def campo(tag, bloco):
    m = re.search(r"<%s>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</%s>" % (tag, tag), bloco, re.S)
    return m.group(1).strip() if m else ""


def gerar_catalogo(destino=None):
    import json
    destino = destino or os.path.join(DIR_SAIDA, "catalogo.json")
    os.makedirs(DIR_SAIDA, exist_ok=True)
    cat = {}
    for nome, cfg in SUCURSAIS.items():
        itens = []
        for marca, chave in (("i", "ilist"), ("n", "nonstop")):
            for b in blocos_imovel(obter(cfg[chave])):
                try:
                    preco = float(campo("quantidade", b) or 0)
                except ValueError:
                    preco = 0.0
                itens.append({
                    "c": campo("codigoAnuncio", b),
                    "t": campo("titulo", b)[:90],
                    "p": preco,
                    "o": campo("operacao", b)[:1],
                    "e": campo("endereco", b).strip()[:60],
                    "f": marca,
                })
        cat[nome] = itens
        print(f"  {nome}: {len(itens)} imoveis")
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(cat, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nCatalogo: {destino} ({os.path.getsize(destino)//1024} KB)")


def aplicar_marcacao(caminho_marcacao):
    """Regera os XMLs aplicando o tipoPublicacao escolhido na tela."""
    import json
    with open(caminho_marcacao, encoding="utf-8") as f:
        marcas = json.load(f)

    for nome, cfg in SUCURSAIS.items():
        m = marcas.get(nome, {})
        destino = os.path.join(DIR_SAIDA, cfg["saida"])
        if not os.path.exists(destino):
            print(f"  {nome}: rode a unificacao primeiro")
            continue

        aplicados = Counter()
        partes = []
        for b in blocos_imovel(destino):
            tipo = m.get(campo("codigoAnuncio", b))
            if tipo:
                b = RE_BLOCO_PUB.sub(f"<tipoPublicacao>{tipo}</tipoPublicacao>", b, count=1)
                aplicados[tipo] += 1
            partes.append(b)

        with open(destino, "w", encoding="utf-8") as out:
            out.write('<?xml version="1.0" encoding="UTF-8"?>\n<OpenNavent>\n<Imoveis>\n')
            for b in partes:
                out.write(b.rstrip() + "\n")
            out.write("</Imoveis>\n</OpenNavent>\n")

        cota_h, cota_d = cfg.get("cota_home", 67), cfg.get("cota_destacado", 175)
        h, d = aplicados.get("HOME", 0), aplicados.get("DESTACADO", 0)
        aviso = ""
        if h > cota_h or d > cota_d:
            aviso = "   <- ACIMA DA COTA"
        print(f"  {nome}: {h}/{cota_h} super, {d}/{cota_d} destaque{aviso}")



if __name__ == "__main__":
    main()

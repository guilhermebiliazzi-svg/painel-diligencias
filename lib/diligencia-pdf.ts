// lib/diligencia-pdf.ts
// Junta as certidões de uma diligência num PDF só, com uma capa-índice.
//
// A capa lista cada certidão na ordem da tela (Imóvel, depois cada titular por
// categoria), com a situação e a página onde ela começa. Certidões sem arquivo
// aparecem como "pendente"; arquivos que não deu para juntar (formato não
// suportado, PDF corrompido ou grande demais) aparecem como "não incluído".
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { agrupar, categoriasFor, preencherCategorias, rotuloSituacao, type RowOrdem } from './diligencia-ordem';

export type ItemPdf = {
  numero: number;
  certidao: string;
  situacao: string; // já com o rótulo da tela
  emitida: string; // dd/mm/aaaa ou ''
  // conteúdo do arquivo (null = sem arquivo vinculado)
  arquivo: { bytes: Uint8Array; mimeType: string } | null;
  // arquivo existe mas ficou de fora: grande demais para juntar, ou não veio do Drive
  foraMotivo?: { tipo: 'grande'; mb: number } | { tipo: 'falha' } | null;
};

export type SecaoPdf = { titulo: string; subtitulo?: string; categorias: { titulo: string; itens: ItemPdf[] }[] };

export type ResultadoPdf = {
  bytes: Uint8Array;
  incluidas: number;
  pendentes: string[];
  naoIncluidas: string[];
  paginas: number;
};

// A4 em pontos
const W = 595.28;
const H = 841.89;
const M = 48; // margem
const AZUL = rgb(0.0, 0.32, 0.65);
const CINZA = rgb(0.42, 0.45, 0.5);
const ESCURO = rgb(0.1, 0.12, 0.16);
const VERMELHO = rgb(0.75, 0.1, 0.15);
const AMBAR = rgb(0.7, 0.45, 0.0);
const LINHA = rgb(0.86, 0.88, 0.9);

// Helvetica padrão usa WinAnsi: tira o que não dá para escrever (emoji etc.)
export function limparTexto(s: string): string {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, '')
    .trim();
}

function cortar(texto: string, font: PDFFont, size: number, max: number): string {
  let t = limparTexto(texto);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

type Linha =
  | { k: 'secao'; titulo: string; subtitulo?: string }
  | { k: 'categoria'; titulo: string }
  | { k: 'item'; item: ItemPdf };

// Altura de cada tipo de linha na capa
const ALT: Record<Linha['k'], number> = { secao: 34, categoria: 20, item: 17 };
const TOPO_PRIMEIRA = 150; // espaço do cabeçalho na 1ª página
const TOPO_DEMAIS = 40;

function paginarCapa(linhas: Linha[]): Linha[][] {
  const paginas: Linha[][] = [[]];
  let y = H - M - TOPO_PRIMEIRA;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    // não deixa título de seção/categoria órfão no pé da página
    const precisa = ALT[l.k] + (l.k === 'item' ? 0 : ALT.item * 2);
    if (y - precisa < M + 24) {
      paginas.push([]);
      y = H - M - TOPO_DEMAIS;
    }
    paginas[paginas.length - 1].push(l);
    y -= ALT[l.k];
  }
  return paginas;
}

function corSituacao(s: string) {
  if (/ocorr|positiv|não foi possível|falhou/i.test(s)) return VERMELHO;
  if (/pend|revis/i.test(s)) return AMBAR;
  return CINZA;
}

export async function montarPdfCertidoes(opts: {
  endereco: string;
  cliente: string | null;
  geradoEm: string; // "dd/mm/aaaa hh:mm"
  secoes: SecaoPdf[];
}): Promise<ResultadoPdf> {
  const out = await PDFDocument.create();
  out.setTitle(limparTexto(`Certidões — ${opts.endereco}`));
  out.setAuthor('REMAX Ville');
  out.setProducer('Painel REMAX Ville');
  const reg = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  // 1) Carrega cada arquivo e descobre quantas páginas ele ocupa
  type Carregado = {
    item: ItemPdf;
    doc?: PDFDocument;
    imagem?: { bytes: Uint8Array; tipo: 'jpg' | 'png' };
    texto?: string[][]; // páginas de linhas (certidão salva como HTML)
    paginas: number;
    status: 'ok' | 'pendente' | 'falha' | 'grande';
  };
  const carregados: Carregado[] = [];
  const pendentes: string[] = [];
  const naoIncluidas: string[] = [];
  for (const s of opts.secoes) {
    for (const c of s.categorias) {
      for (const item of c.itens) {
        const nome = `${item.certidao}${s.titulo && s.titulo !== 'Imóvel' ? ' — ' + s.titulo : ''}`;
        if (!item.arquivo) {
          const fora = item.foraMotivo;
          if (fora?.tipo === 'grande') {
            naoIncluidas.push(`${nome} (arquivo de ${mbBr(fora.mb)} MB)`);
            carregados.push({ item, paginas: 0, status: 'grande' });
          } else if (fora) {
            naoIncluidas.push(nome);
            carregados.push({ item, paginas: 0, status: 'falha' });
          } else {
            pendentes.push(nome);
            carregados.push({ item, paginas: 0, status: 'pendente' });
          }
          continue;
        }
        const { bytes, mimeType } = item.arquivo;
        // Não confia no mimeType: algumas certidões foram salvas como HTML com nome .pdf
        const tipo = tipoDoArquivo(bytes, mimeType);
        try {
          if (tipo === 'html') {
            const texto = paginarTexto(htmlParaTexto(bytes), reg);
            carregados.push({ item, texto, paginas: texto.length, status: 'ok' });
          } else if (tipo === 'pdf') {
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
            carregados.push({ item, doc, paginas: doc.getPageCount(), status: 'ok' });
          } else if (tipo === 'jpg') {
            carregados.push({ item, imagem: { bytes, tipo: 'jpg' }, paginas: 1, status: 'ok' });
          } else if (tipo === 'png') {
            carregados.push({ item, imagem: { bytes, tipo: 'png' }, paginas: 1, status: 'ok' });
          } else {
            throw new Error('formato não suportado');
          }
        } catch {
          naoIncluidas.push(nome);
          carregados.push({ item, paginas: 0, status: 'falha' });
        }
      }
    }
  }
  const porItem = new Map(carregados.map((c) => [c.item, c]));

  // 2) Monta as linhas da capa e quantas páginas ela terá
  const linhas: Linha[] = [];
  for (const s of opts.secoes) {
    linhas.push({ k: 'secao', titulo: s.titulo, subtitulo: s.subtitulo });
    for (const c of s.categorias) {
      linhas.push({ k: 'categoria', titulo: c.titulo });
      for (const item of c.itens) linhas.push({ k: 'item', item });
    }
  }
  const paginasCapa = paginarCapa(linhas);

  // 3) Página inicial de cada certidão
  const paginaDe = new Map<ItemPdf, number>();
  let prox = paginasCapa.length + 1;
  for (const c of carregados) {
    if (c.status !== 'ok') continue;
    paginaDe.set(c.item, prox);
    prox += c.paginas;
  }

  // 4) Escreve

  const incluidas = carregados.filter((c) => c.status === 'ok').length;
  const totalCapa = paginasCapa.length;

  paginasCapa.forEach((ls, idx) => {
    const p = out.addPage([W, H]);
    let y = H - M;
    if (idx === 0) {
      p.drawText('REMAX Ville  •  Diligência', { x: M, y: y - 10, size: 9, font: bold, color: AZUL });
      p.drawText(cortar('Certidões da diligência', bold, 20, W - 2 * M), { x: M, y: y - 38, size: 20, font: bold, color: ESCURO });
      p.drawText(cortar(opts.endereco, reg, 11, W - 2 * M), { x: M, y: y - 60, size: 11, font: reg, color: ESCURO });
      if (opts.cliente) p.drawText(cortar(`Cliente: ${opts.cliente}`, reg, 10, W - 2 * M), { x: M, y: y - 76, size: 10, font: reg, color: CINZA });
      const resumo = [
        `${incluidas} certid${incluidas === 1 ? 'ão' : 'ões'} neste arquivo`,
        pendentes.length ? `${pendentes.length} pendente${pendentes.length === 1 ? '' : 's'}` : '',
        naoIncluidas.length ? `${naoIncluidas.length} não incluída${naoIncluidas.length === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join('  •  ');
      p.drawText(limparTexto(resumo), { x: M, y: y - 96, size: 10, font: bold, color: pendentes.length || naoIncluidas.length ? AMBAR : ESCURO });
      p.drawText(limparTexto(`Gerado em ${opts.geradoEm}`), { x: M, y: y - 110, size: 8.5, font: reg, color: CINZA });
      p.drawLine({ start: { x: M, y: y - 124 }, end: { x: W - M, y: y - 124 }, thickness: 0.8, color: LINHA });
      y -= TOPO_PRIMEIRA;
    } else {
      p.drawText('Certidões da diligência (continuação)', { x: M, y: y - 12, size: 9, font: bold, color: CINZA });
      y -= TOPO_DEMAIS;
    }

    const xPag = W - M; // coluna da página (alinhada à direita)
    const xSit = W - M - 190;
    for (const l of ls) {
      if (l.k === 'secao') {
        y -= 8;
        p.drawText(cortar(l.titulo, bold, 12.5, W - 2 * M), { x: M, y: y - 12, size: 12.5, font: bold, color: AZUL });
        if (l.subtitulo) {
          const tw = bold.widthOfTextAtSize(cortar(l.titulo, bold, 12.5, W - 2 * M), 12.5);
          p.drawText(cortar(l.subtitulo, reg, 9.5, W - 2 * M - tw - 12), { x: M + tw + 10, y: y - 12, size: 9.5, font: reg, color: CINZA });
        }
        y -= ALT.secao - 8;
      } else if (l.k === 'categoria') {
        p.drawText(cortar(l.titulo.toUpperCase(), bold, 8, W - 2 * M), { x: M + 2, y: y - 12, size: 8, font: bold, color: CINZA });
        y -= ALT.categoria;
      } else {
        const it = l.item;
        const c = porItem.get(it)!;
        const yy = y - 11;
        p.drawText(`${it.numero}.`, { x: M + 2, y: yy, size: 9.5, font: reg, color: CINZA });
        p.drawText(cortar(it.certidao, reg, 9.5, xSit - (M + 22) - 10), { x: M + 22, y: yy, size: 9.5, font: reg, color: ESCURO });
        let sit = it.situacao;
        // sem arquivo: "Não foi possível emitir" e "Empresa extinta" valem como estão
        if (c.status === 'pendente' && !/não foi possível|extinta/i.test(it.situacao)) sit = 'Pendente (sem arquivo)';
        if (c.status === 'falha') sit = 'Não incluído (arquivo ilegível)';
        if (c.status === 'grande' && it.foraMotivo?.tipo === 'grande') sit = `Não incluído (${mbBr(it.foraMotivo.mb)} MB, ver no card)`;
        const sitTxt = cortar(sit + (it.emitida && c.status === 'ok' ? ` · ${it.emitida}` : ''), reg, 8.5, 150);
        p.drawText(sitTxt, { x: xSit, y: yy, size: 8.5, font: reg, color: c.status === 'ok' ? corSituacao(it.situacao) : c.status === 'pendente' ? AMBAR : VERMELHO });
        const pag = paginaDe.get(it);
        const pagTxt = pag ? `p. ${pag}` : '—';
        p.drawText(pagTxt, { x: xPag - bold.widthOfTextAtSize(pagTxt, 9), y: yy, size: 9, font: pag ? bold : reg, color: pag ? ESCURO : CINZA });
        p.drawLine({ start: { x: M, y: y - ALT.item + 2 }, end: { x: W - M, y: y - ALT.item + 2 }, thickness: 0.4, color: LINHA });
        y -= ALT.item;
      }
    }
    rodape(p, reg, `Índice ${idx + 1}/${totalCapa}`);
  });

  for (const c of carregados) {
    if (c.status !== 'ok') continue;
    if (c.doc) {
      const pages = await out.copyPages(c.doc, c.doc.getPageIndices());
      pages.forEach((pg) => out.addPage(pg));
    } else if (c.texto) {
      c.texto.forEach((linhas, i) => {
        const p = out.addPage([W, H]);
        p.drawText(cortar(`${c.item.certidao}`, bold, 10, W - 2 * M), { x: M, y: H - M - 4, size: 10, font: bold, color: ESCURO });
        p.drawText('Cópia em texto do comprovante salvo pelo sistema (o site de origem não gera PDF).', {
          x: M,
          y: H - M - 18,
          size: 7.5,
          font: reg,
          color: CINZA,
        });
        p.drawLine({ start: { x: M, y: H - M - 26 }, end: { x: W - M, y: H - M - 26 }, thickness: 0.6, color: LINHA });
        let y = H - M - 26 - TXT_TOPO;
        for (const l of linhas) {
          if (l) p.drawText(l, { x: M, y, size: TXT_SIZE, font: reg, color: ESCURO });
          y -= TXT_LH;
        }
        if (c.texto!.length > 1) rodape(p, reg, `${i + 1}/${c.texto!.length}`);
      });
    } else if (c.imagem) {
      const img = c.imagem.tipo === 'jpg' ? await out.embedJpg(c.imagem.bytes) : await out.embedPng(c.imagem.bytes);
      const p = out.addPage([W, H]);
      const esc = Math.min((W - 2 * 24) / img.width, (H - 2 * 24) / img.height, 1.5);
      const w = img.width * esc;
      const h = img.height * esc;
      p.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
    }
  }

  const bytes = await out.save();
  return { bytes, incluidas, pendentes, naoIncluidas, paginas: out.getPageCount() };
}

// ---------------------------------------------------------------------------
// Tipo real do arquivo e certidões salvas como HTML

export function tipoDoArquivo(bytes: Uint8Array, mimeType: string): 'pdf' | 'html' | 'jpg' | 'png' | 'outro' {
  const ini = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  if (ini.includes('%PDF-')) return 'pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (/<(!doctype html|html|head|body|base|div|table|p)[\s>]/i.test(ini) || /html/i.test(mimeType)) return 'html';
  return 'outro';
}

const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordf: 'ª', ordm: 'º', deg: '°', sect: '§',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ', acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  agrave: 'à', Agrave: 'À', ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', Uuml: 'Ü', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', bull: '•', middot: '·',
};

export function htmlParaTexto(bytes: Uint8Array): string {
  let html = new TextDecoder('utf-8').decode(bytes);
  // arquivo em Latin-1/Windows-1252: o UTF-8 sai com caracteres de substituição
  if ((html.match(/\uFFFD/g) || []).length > 3) html = new TextDecoder('windows-1252').decode(bytes);
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head|noscript|svg|button|select)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li|table|section|article|header|footer|ul|ol|dt|dd)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|tr|li|table|section|article|header|footer)(\s[^>]*)?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '   ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? m)
    .split('\n')
    .map((l) => l.replace(/[ \t\u00A0]+/g, ' ').trim())
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .trim();
}

const TXT_SIZE = 10;
const TXT_LH = 14;
const TXT_TOPO = 22;

function quebrar(texto: string, font: PDFFont, max: number): string[] {
  const out: string[] = [];
  for (const par of texto.split('\n')) {
    const limpo = limparTexto(par);
    if (!limpo) {
      out.push('');
      continue;
    }
    let linha = '';
    for (const palavra of limpo.split(' ')) {
      let w = palavra;
      // palavra maior que a linha (URL, código): corta em pedaços
      while (font.widthOfTextAtSize(w, TXT_SIZE) > max) {
        let k = w.length;
        while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), TXT_SIZE) > max) k--;
        if (linha) {
          out.push(linha);
          linha = '';
        }
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      const tent = linha ? `${linha} ${w}` : w;
      if (font.widthOfTextAtSize(tent, TXT_SIZE) <= max) linha = tent;
      else {
        out.push(linha);
        linha = w;
      }
    }
    if (linha) out.push(linha);
  }
  return out;
}

function paginarTexto(texto: string, font: PDFFont): string[][] {
  const linhas = quebrar(texto || '(arquivo sem texto)', font, W - 2 * M);
  const porPagina = Math.floor((H - 2 * M - 26 - TXT_TOPO - 20) / TXT_LH);
  const pags: string[][] = [];
  for (let i = 0; i < linhas.length; i += porPagina) pags.push(linhas.slice(i, i + porPagina));
  return pags.length ? pags : [['(arquivo sem texto)']];
}

const mbBr = (n: number) => String(n).replace('.', ',');

function rodape(p: PDFPage, font: PDFFont, txt: string) {
  p.drawText(limparTexto(txt), { x: W - M - font.widthOfTextAtSize(txt, 8), y: 24, size: 8, font, color: CINZA });
}

// ---------------------------------------------------------------------------
// Seções na ordem e numeração da tela /admin/d/[id]

export type RowCertidao = RowOrdem & {
  certidao: string | null;
  situacao: string;
  data_emissao: string | null;
};

export type ArquivoDaCertidao = { arquivo: ItemPdf['arquivo']; fora: ItemPdf['foraMotivo'] };

// A tela mostra a situação como vem do banco (sem acento); no PDF sai acentuada.
const ACENTOS: Record<string, string> = {
  Concluida: 'Concluída',
  'Em revisao': 'Em revisão',
  'Com pendencias': 'Com pendências',
  'Aguardando inicio': 'Aguardando início',
};
function comAcento(s: string): string {
  return ACENTOS[s] ?? s;
}

export function dataBr(v: string | Date | null): string {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function secoesDaDiligencia<T extends RowCertidao>(
  rows: T[],
  endereco: string,
  porCert: Map<string, ArquivoDaCertidao>
): SecaoPdf[] {
  return agrupar(rows, endereco).map((g) => ({
    titulo: g.titulo,
    subtitulo: g.tipo === 'imovel' ? undefined : g.subtitulo,
    categorias: preencherCategorias(g.rows, categoriasFor(g.tipo)).map((cat) => ({
      titulo: cat.titulo,
      itens: cat.rows.map((r, i): ItemPdf => {
        const b = porCert.get(r.certidao_id);
        return {
          numero: i + 1,
          certidao: r.certidao || r.tipo,
          situacao: comAcento(rotuloSituacao(r.situacao)),
          emitida: dataBr(r.data_emissao),
          arquivo: b?.arquivo ?? null,
          foraMotivo: b?.fora ?? null,
        };
      }),
    })),
  }));
}

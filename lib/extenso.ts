// Números, valores e datas por extenso, em português (para contratos).

const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos",
  "setecentos", "oitocentos", "novecentos"];

function ate999(n: number, fem = false): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEN[c]);
  if (r) {
    if (r < 20) partes.push(UN[r]);
    else {
      const d = Math.floor(r / 10), u = r % 10;
      partes.push(u ? `${DEZ[d]} e ${UN[u]}` : DEZ[d]);
    }
  }
  let s = partes.join(" e ");
  if (fem) s = s.replace(/\bum$/, "uma").replace(/\bdois$/, "duas").replace(/entos\b/g, "entas");
  return s;
}

// inteiro por extenso ("1.250" -> "mil duzentos e cinquenta")
export function inteiroPorExtenso(n: number, fem = false): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const grupos: number[] = [];
  let x = n;
  while (x > 0) { grupos.push(x % 1000); x = Math.floor(x / 1000); }
  const nomes = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];
  const pedacos: { txt: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let txt: string;
    if (i === 0) txt = ate999(g, fem);
    else if (i === 1) txt = g === 1 ? "mil" : `${ate999(g, fem)} mil`;
    else txt = `${ate999(g)} ${g === 1 ? nomes[i][0] : nomes[i][1]}`;
    pedacos.push({ txt, valor: g });
  }
  // conector "e": antes do último grupo quando ele é < 100 ou centena redonda
  let s = "";
  pedacos.forEach((p, idx) => {
    if (idx === 0) s = p.txt;
    else {
      const ultimo = idx === pedacos.length - 1;
      const usaE = ultimo && (p.valor < 100 || p.valor % 100 === 0);
      s += (usaE ? " e " : " ") + p.txt;
    }
  });
  return s;
}

// R$ 20.000,00 -> "vinte mil reais"; R$ 1.590,50 -> "mil quinhentos e noventa reais e cinquenta centavos"
export function reaisPorExtenso(valor: number): string {
  const cents = Math.round(Math.abs(valor) * 100);
  const r = Math.floor(cents / 100), c = cents % 100;
  const partes: string[] = [];
  if (r) {
    const t = inteiroPorExtenso(r);
    const de = r >= 1_000_000 && r % 1_000_000 === 0 ? " de" : "";
    partes.push(`${t}${de} ${r === 1 ? "real" : "reais"}`);
  }
  if (c) partes.push(`${inteiroPorExtenso(c)} ${c === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}

export function fmtReais(valor: number): string {
  return (Math.round(valor * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "R$ 20.000,00 (vinte mil reais)"
export function reaisComExtenso(valor: number): string {
  const ext = reaisPorExtenso(valor);
  return `R$ ${fmtReais(valor)} (${ext.charAt(0).toUpperCase() + ext.slice(1)})`;
}

// "30 (trinta)"
export function numComExtenso(n: number, fem = false): string {
  return `${n} (${inteiroPorExtenso(n, fem)})`;
}

// 8 -> "8% (oito por cento)"; 8.5 -> "8,5% (oito vírgula cinco por cento)"
export function percentualComExtenso(p: number): string {
  const inteiro = Math.floor(p);
  const dec = Math.round((p - inteiro) * 100);
  const num = String(Math.round(p * 100) / 100).replace(".", ",");
  let ext = inteiroPorExtenso(inteiro);
  if (dec) {
    const d = dec % 10 === 0 ? dec / 10 : dec;
    ext += ` vírgula ${inteiroPorExtenso(d)}`;
  }
  return `${num}% (${ext} por cento)`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
  "setembro", "outubro", "novembro", "dezembro"];

export function nomeMes(m1a12: number): string {
  return MESES[m1a12 - 1] || "";
}

// datas como "YYYY-MM-DD" (sem fuso)
export function partesData(iso: string): { a: number; m: number; d: number } | null {
  const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return x ? { a: +x[1], m: +x[2], d: +x[3] } : null;
}

export function isoDe(a: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

export function somarMeses(iso: string, meses: number): string {
  const p = partesData(iso);
  if (!p) return iso;
  const alvo = new Date(Date.UTC(p.a, p.m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDe(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, Math.min(p.d, ultimo));
}

export function somarDias(iso: string, dias: number): string {
  const p = partesData(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.a, p.m - 1, p.d + dias));
  return dt.toISOString().slice(0, 10);
}

export function fmtData(iso: string | null | undefined): string {
  const p = partesData(String(iso || ""));
  return p ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.a}` : "__/__/____";
}

// "16 de outubro de 2026"
export function dataPorExtenso(iso: string): string {
  const p = partesData(iso);
  return p ? `${p.d === 1 ? "1º" : p.d} de ${nomeMes(p.m)} de ${p.a}` : "___ de __________ de ____";
}

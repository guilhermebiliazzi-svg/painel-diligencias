/**
 * EVA · Motor do parecer de diligência (tijolo C).
 * Recebe os FATOS (montados pelo n8n em /webhook/gerar-parecer), chama o Claude,
 * faz o passe de validação e devolve a saída estruturada do parecer.
 *
 * Variáveis de ambiente (configurar no Render):
 *   ANTHROPIC_API_KEY  (obrigatória) — chave da API da Anthropic
 *   PARECER_MODEL      (opcional)    — default "claude-opus-4-8"
 *   PROMPT_PARECER     (opcional)    — caminho do prompt; default ./prompt_parecer.md
 */
const fs = require("fs");
const path = require("path");

const MODEL = process.env.PARECER_MODEL || "claude-opus-4-8";
const PROMPT_PATH = process.env.PROMPT_PARECER || path.join(__dirname, "prompt_parecer.md");

function lerPrompt() {
  try { return fs.readFileSync(PROMPT_PATH, "utf8"); }
  catch (e) { throw new Error("prompt do parecer não encontrado em " + PROMPT_PATH); }
}

// O modelo deve devolver só JSON; mesmo assim, blindamos a extração.
function extrairJSON(texto) {
  if (!texto) throw new Error("resposta vazia do modelo");
  let t = String(texto).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i === -1 || j === -1) throw new Error("não encontrei JSON na resposta do modelo");
  return JSON.parse(t.slice(i, j + 1));
}

async function chamarClaude(fatos) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada no Render");

  const system = lerPrompt();
  const userMsg =
    "FATOS da diligência (JSON):\n" + JSON.stringify(fatos, null, 2) +
    "\n\nGere o parecer e responda APENAS com o objeto JSON conforme o schema. " +
    "Sem texto fora do JSON e sem cercas de código.";

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      temperature: 0,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error("Anthropic HTTP " + resp.status + ": " + txt.slice(0, 600));
  }
  const data = await resp.json();
  const texto = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  return extrairJSON(texto);
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/**
 * Passe de validação: a aritmética da solvência é REFEITA em código (não confiamos
 * na conta do modelo) e conferimos que apontamentos e condicionantes citam fonte.
 * Divergências viram alertas — não reprovam, mas chamam atenção na revisão.
 */
function validar(saida) {
  const alertas = [];
  const s = saida && saida.solvencia;

  if (s && s.forma === "dirpf" &&
      typeof s.bens_declarados === "number" && typeof s.dividas_declaradas === "number") {
    const pl = round2(s.bens_declarados - s.dividas_declaradas);
    if (typeof s.patrimonio_liquido === "number" && Math.abs(pl - s.patrimonio_liquido) > 0.5)
      alertas.push("Patrimônio líquido recalculado (" + pl + ") difere do informado (" + s.patrimonio_liquido + ").");
    const solventeCalc = pl > 0;
    if (typeof s.solvente === "boolean" && s.solvente !== solventeCalc)
      alertas.push("Solvência (DIRPF) recalculada como " + solventeCalc + "; o modelo disse " + s.solvente + ".");
  }

  if (s && s.forma === "imoveis_livres") {
    const soma = round2((s.imoveis_livres || [])
      .filter(i => i && i.livre_de_gravame !== false)
      .reduce((a, i) => a + (Number(i.valor_mercado) || 0), 0));
    const passivo = round2(s.passivo_total);
    const solventeCalc = soma > passivo;
    if (typeof s.solvente === "boolean" && s.solvente !== solventeCalc)
      alertas.push("Solvência (imóveis livres) recalculada: soma " + soma + " vs passivo " + passivo +
                   " => " + solventeCalc + "; o modelo disse " + s.solvente + ".");
  }

  const checaFonte = (arr, nome) => {
    if (Array.isArray(arr)) arr.forEach((x, i) => {
      if (!x || !(x.fonte || x.fonte_certidao || x.referencia))
        alertas.push(nome + "[" + i + "] sem fonte citada.");
    });
  };
  checaFonte(saida && saida.apontamentos, "apontamento");
  checaFonte(saida && saida.condicionantes, "condicionante");

  return { ok: alertas.length === 0, alertas };
}

async function gerarParecer(fatos) {
  if (!fatos || typeof fatos !== "object") throw new Error("FATOS ausentes ou inválidos");
  const saida = await chamarClaude(fatos);
  saida._validacao = validar(saida);
  return saida;
}

module.exports = { gerarParecer };

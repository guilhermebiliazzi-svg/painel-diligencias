"use client";

import { useMemo, useState } from "react";

// Painel consolidado (admin): todos os locadores/imóveis de um mês numa tabela,
// com downloads, seleção e envio de e-mail em lote. Cada linha = um repasse.

export type DocLink = { tipo: string; url: string | null };
export type CompBoleto = { subtipo: string; url: string };
export type OverviewRow = {
  locador_id: number;
  locador_nome: string;
  locador_email: string | null;
  contrato_id: number;
  competencia: string; // YYYY-MM
  mes: string;
  endereco: string;
  liquido: number;
  deducao_iptu: number;
  deducao_condominio: number;
  reciboUrl: string | null;
  comprovanteRepasse: string | null;
  comprovantesBoleto: CompBoleto[];
  docs: DocLink[];
};

const brl = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (c: string) => { const [y, m] = c.split("-"); return `${NOMES[Number(m) - 1] || m}/${y}`; };
const DOC_LABEL: Record<string, string> = {
  boleto_iptu: "Boleto IPTU", boleto_condominio: "Boleto cond.",
  comprovante_iptu: "Comp. IPTU", comprovante_condominio: "Comp. cond.",
};
const chaveDe = (r: OverviewRow) => `${r.locador_id}|${r.contrato_id}|${r.competencia}`;

export default function AdminOverview({
  rows,
  competencias,
}: {
  rows: OverviewRow[];
  competencias: string[]; // YYYY-MM desc
}) {
  const [mes, setMes] = useState<string>(competencias[0] || "");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (mes && r.competencia !== mes) return false;
      if (!t) return true;
      return (
        r.locador_nome.toLowerCase().includes(t) ||
        (r.locador_email || "").toLowerCase().includes(t) ||
        r.endereco.toLowerCase().includes(t)
      );
    });
  }, [rows, mes, q]);

  const totalLiquido = useMemo(() => visiveis.reduce((s, r) => s + (Number(r.liquido) || 0), 0), [visiveis]);
  const todasSel = visiveis.length > 0 && visiveis.every((r) => sel.has(chaveDe(r)));

  function toggle(r: OverviewRow) {
    setSel((p) => { const n = new Set(p); const k = chaveDe(r); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function toggleTodas() {
    setSel((p) => { const n = new Set(p); todasSel ? visiveis.forEach((r) => n.delete(chaveDe(r))) : visiveis.forEach((r) => n.add(chaveDe(r))); return n; });
  }

  async function enviar() {
    setErro(null); setMsg(null);
    const escolhidas = visiveis.filter((r) => sel.has(chaveDe(r)));
    if (!escolhidas.length) { setErro("Selecione ao menos uma linha."); return; }
    // agrupa por locador
    const porLocador = new Map<number, { nome: string; email: string | null; itens: { contrato_id: number; competencia: string }[] }>();
    for (const r of escolhidas) {
      const g = porLocador.get(r.locador_id) || { nome: r.locador_nome, email: r.locador_email, itens: [] };
      g.itens.push({ contrato_id: r.contrato_id, competencia: r.competencia });
      porLocador.set(r.locador_id, g);
    }
    const semEmail = [...porLocador.values()].filter((g) => !g.email);
    const comEmail = [...porLocador.entries()].filter(([, g]) => g.email);
    if (!comEmail.length) { setErro("Nenhum dos locadores selecionados tem e-mail cadastrado."); return; }
    const resumo = comEmail.map(([, g]) => `• ${g.nome} (${g.itens.length})`).join("\n");
    const aviso = semEmail.length ? `\n\nSem e-mail (serão ignorados): ${semEmail.map((g) => g.nome).join(", ")}` : "";
    if (!confirm(`Enviar e-mail para ${comEmail.length} locador(es)?\n${resumo}${aviso}`)) return;

    setEnviando(true);
    let ok = 0; const falhas: string[] = [];
    for (const [locador_id, g] of comEmail) {
      try {
        const r = await fetch("/api/adm/locador-email", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locador_id, itens: g.itens }),
        });
        const d = await r.json();
        if (r.ok) ok++; else falhas.push(`${g.nome}: ${d?.error || "falha"}`);
      } catch { falhas.push(`${g.nome}: erro de rede`); }
    }
    setEnviando(false);
    if (ok) setMsg(`E-mail enviado para ${ok} locador(es).${falhas.length ? ` Falharam: ${falhas.length}.` : ""}`);
    if (falhas.length) setErro(falhas.join(" | "));
    if (ok) setSel(new Set());
  }

  const nSel = sel.size;

  return (
    <div style={{ backgroundColor: "#f8fafc" }} className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Ville Jardins · Modo admin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Portal do locador</h1>
          <p className="mt-1 text-sm text-slate-600">Recibos e comprovantes de todos os locadores. Filtre o mês, baixe os documentos ou envie por e-mail.</p>
        </header>

        {/* Barra de controles */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="font-medium">Mês</span>
            <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todos</option>
              {competencias.map((c) => <option key={c} value={c}>{rotuloMes(c)}</option>)}
            </select>
          </label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar locador ou imóvel…" className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none" />
          <div className="ml-auto flex items-center gap-3">
            {nSel > 0 && <span className="text-sm text-slate-500">{nSel} selecionada(s)</span>}
            <button onClick={enviar} disabled={enviando || nSel === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {enviando ? "Enviando…" : "✉ Enviar aos selecionados"}
            </button>
          </div>
        </div>

        {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        {msg && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-4 py-2.5"><input type="checkbox" checked={todasSel} onChange={toggleTodas} className="size-4 rounded border-slate-300" aria-label="Selecionar todas" /></th>
                  <th className="px-4 py-2.5">Locador</th>
                  <th className="px-4 py-2.5">Imóvel</th>
                  <th className="px-4 py-2.5">Mês</th>
                  <th className="px-4 py-2.5 text-right">Líquido</th>
                  <th className="px-4 py-2.5">Documentos</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiveis.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">Nenhum repasse para o filtro.</td></tr>
                ) : visiveis.map((r) => (
                  <tr key={chaveDe(r)} className={`align-top ${sel.has(chaveDe(r)) ? "bg-blue-50/40" : ""}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={sel.has(chaveDe(r))} onChange={() => toggle(r)} className="size-4 rounded border-slate-300" aria-label={`Selecionar ${r.locador_nome} ${r.mes}`} /></td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{r.locador_nome}</p>
                      {!r.locador_email && <p className="text-xs text-amber-600">sem e-mail</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.endereco}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{r.mes}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-slate-900">{brl(r.liquido)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {r.reciboUrl && <a href={r.reciboUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">Recibo</a>}
                        {r.comprovanteRepasse && <a href={r.comprovanteRepasse} target="_blank" rel="noopener noreferrer" className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Comp. repasse</a>}
                        {r.comprovantesBoleto.map((c, i) => <a key={`b${i}`} href={c.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Comp. {c.subtipo === "iptu" ? "IPTU" : "cond."}</a>)}
                        {r.docs.map((d) => d.url ? <a key={d.tipo} href={d.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">{DOC_LABEL[d.tipo] || d.tipo}</a> : null)}
                        {!r.reciboUrl && !r.comprovanteRepasse && r.comprovantesBoleto.length === 0 && r.docs.length === 0 && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <a href={`/locador?locador=${r.locador_id}`} className="text-xs font-medium text-blue-600 hover:underline">Abrir →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
              {visiveis.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 text-sm font-medium text-slate-700">
                    <td colSpan={4} className="px-4 py-2.5">{visiveis.length} repasse(s)</td>
                    <td className="px-4 py-2.5 text-right">{brl(totalLiquido)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <a href="/" className="mt-6 inline-block text-sm font-medium text-slate-500 hover:text-slate-900">← Voltar ao painel</a>
      </main>
    </div>
  );
}

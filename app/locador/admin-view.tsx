"use client";

import { useMemo, useState } from "react";

// Visão admin do portal do locador: filtro por mês, tabela com downloads e
// seleção de competências para enviar por e-mail ao locador.

export type DocLink = { tipo: string; url: string | null };
export type CompBoleto = { subtipo: string; url: string };
export type LinhaRepasse = {
  contrato_id: number;
  competencia: string; // YYYY-MM
  mes: string; // "ago/2026"
  liquido: number;
  deducao_iptu: number;
  deducao_condominio: number;
  reciboUrl: string | null;
  comprovanteRepasse: string | null;
  comprovantesBoleto: CompBoleto[];
  docs: DocLink[];
};
export type GrupoImovel = { contrato_id: number; titulo: string; rows: LinhaRepasse[] };

const brl = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const DOC_LABEL: Record<string, string> = {
  boleto_iptu: "Boleto IPTU",
  boleto_condominio: "Boleto condomínio",
  comprovante_iptu: "Comprovante IPTU",
  comprovante_condominio: "Comprovante condomínio",
};

function chaveDe(r: { contrato_id: number; competencia: string }) {
  return `${r.contrato_id}|${r.competencia}`;
}

export default function LocadorAdminView({
  locadorId,
  locadorNome,
  temEmail,
  grupos,
  competencias,
}: {
  locadorId: number;
  locadorNome: string;
  temEmail: boolean;
  grupos: GrupoImovel[];
  competencias: string[]; // YYYY-MM, desc
}) {
  const [mes, setMes] = useState<string>("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [preview, setPreview] = useState<
    | { to: string; subject: string; html: string; attachments: { filename: string; kb: number }[]; itens: { contrato_id: number; competencia: string }[] }
    | null
  >(null);

  // aplica filtro de mês
  const gruposFiltrados = useMemo(() => {
    return grupos
      .map((g) => ({ ...g, rows: mes ? g.rows.filter((r) => r.competencia === mes) : g.rows }))
      .filter((g) => g.rows.length > 0);
  }, [grupos, mes]);

  const linhasVisiveis = useMemo(
    () => gruposFiltrados.flatMap((g) => g.rows),
    [gruposFiltrados]
  );
  const todasSelecionadas =
    linhasVisiveis.length > 0 && linhasVisiveis.every((r) => sel.has(chaveDe(r)));

  function toggle(r: LinhaRepasse) {
    setSel((prev) => {
      const n = new Set(prev);
      const k = chaveDe(r);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }
  function toggleTodas() {
    setSel((prev) => {
      const n = new Set(prev);
      if (todasSelecionadas) linhasVisiveis.forEach((r) => n.delete(chaveDe(r)));
      else linhasVisiveis.forEach((r) => n.add(chaveDe(r)));
      return n;
    });
  }

  function itensSelecionados() {
    return [...sel].map((k) => {
      const [contrato_id, competencia] = k.split("|");
      return { contrato_id: Number(contrato_id), competencia };
    });
  }

  // 1) gera a pré-visualização (não envia)
  async function abrirPreview() {
    setErro(null);
    setMsg(null);
    const itens = itensSelecionados();
    if (!itens.length) {
      setErro("Selecione ao menos uma competência.");
      return;
    }
    setCarregandoPreview(true);
    try {
      const r = await fetch("/api/adm/locador-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locador_id: locadorId, itens, preview: true }),
      });
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao gerar a pré-visualização.");
      else setPreview({ to: d.to, subject: d.subject, html: d.html, attachments: d.attachments || [], itens });
    } catch {
      setErro("Erro de rede ao gerar a pré-visualização.");
    } finally {
      setCarregandoPreview(false);
    }
  }

  // 2) confirma e envia de verdade
  async function confirmarEnvio() {
    if (!preview) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/adm/locador-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locador_id: locadorId, itens: preview.itens }),
      });
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao enviar.");
      else {
        setMsg(`Enviado para ${d.to} — ${d.anexos} anexo(s), ${d.competencias} competência(s).`);
        setSel(new Set());
        setPreview(null);
      }
    } catch {
      setErro("Erro de rede ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  const nSel = sel.size;

  return (
    <div className="mt-6">
      {/* Barra de ações: filtro + envio */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">Mês</span>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Todos</option>
            {competencias.map((c) => {
              const [y, m] = c.split("-");
              const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
              return (
                <option key={c} value={c}>{`${nomes[Number(m) - 1] || m}/${y}`}</option>
              );
            })}
          </select>
        </label>

        <div className="flex items-center gap-3">
          {nSel > 0 && <span className="text-sm text-slate-500">{nSel} selecionada(s)</span>}
          <button
            onClick={abrirPreview}
            disabled={carregandoPreview || nSel === 0 || !temEmail}
            title={!temEmail ? "Locador sem e-mail cadastrado" : undefined}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {carregandoPreview ? "Gerando prévia…" : "✉ Enviar por e-mail ao locador"}
          </button>
        </div>
      </div>

      {!temEmail && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Este locador não tem e-mail cadastrado — o envio fica desativado.
        </p>
      )}
      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {msg && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

      {gruposFiltrados.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhum repasse para o filtro selecionado.
        </p>
      ) : (
        <div className="space-y-6">
          {gruposFiltrados.map((g) => (
            <section key={g.contrato_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-base font-semibold text-slate-900">
                {g.titulo}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="w-10 px-4 py-2">
                        <input
                          type="checkbox"
                          checked={todasSelecionadas}
                          onChange={toggleTodas}
                          className="size-4 rounded border-slate-300"
                          aria-label="Selecionar todas"
                        />
                      </th>
                      <th className="px-4 py-2">Competência</th>
                      <th className="px-4 py-2 text-right">Líquido</th>
                      <th className="px-4 py-2">Deduções</th>
                      <th className="px-4 py-2">Documentos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.rows.map((r) => (
                      <tr key={chaveDe(r)} className="align-top">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={sel.has(chaveDe(r))}
                            onChange={() => toggle(r)}
                            className="size-4 rounded border-slate-300"
                            aria-label={`Selecionar ${r.mes}`}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.mes}</td>
                        <td className="px-4 py-3 text-right text-slate-900">{brl(r.liquido)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {Number(r.deducao_iptu) ? <>IPTU {brl(r.deducao_iptu)}<br /></> : null}
                          {Number(r.deducao_condominio) ? <>Condomínio {brl(r.deducao_condominio)}</> : null}
                          {!Number(r.deducao_iptu) && !Number(r.deducao_condominio) ? "—" : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {r.reciboUrl && (
                              <a href={r.reciboUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">Recibo</a>
                            )}
                            {r.comprovanteRepasse && (
                              <a href={r.comprovanteRepasse} target="_blank" rel="noopener noreferrer" className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Comprovante repasse</a>
                            )}
                            {r.comprovantesBoleto.map((c, i) => (
                              <a key={`b${i}`} href={c.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Comprovante {c.subtipo === "iptu" ? "IPTU" : "condomínio"}</a>
                            ))}
                            {r.docs.map((d) => d.url ? (
                              <a key={d.tipo} href={d.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">{DOC_LABEL[d.tipo] || d.tipo}</a>
                            ) : null)}
                            {!r.reciboUrl && !r.comprovanteRepasse && r.comprovantesBoleto.length === 0 && r.docs.length === 0 && (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
          onClick={() => !enviando && setPreview(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-900">Pré-visualização do e-mail</h3>
              <button onClick={() => !enviando && setPreview(null)} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">✕</button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <dl className="mb-4 space-y-1 text-sm">
                <div className="flex gap-2"><dt className="w-20 shrink-0 font-medium text-slate-500">Para</dt><dd className="text-slate-900">{preview.to}</dd></div>
                <div className="flex gap-2"><dt className="w-20 shrink-0 font-medium text-slate-500">Assunto</dt><dd className="text-slate-900">{preview.subject}</dd></div>
              </dl>

              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Corpo</p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div dangerouslySetInnerHTML={{ __html: preview.html }} />
              </div>

              <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Anexos ({preview.attachments.length})
              </p>
              {preview.attachments.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum anexo disponível.</p>
              ) : (
                <ul className="space-y-1">
                  {preview.attachments.map((a, i) => (
                    <li key={i} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">
                      <span className="truncate text-slate-700">📎 {a.filename}</span>
                      <span className="ml-2 shrink-0 text-xs text-slate-400">{a.kb} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                onClick={() => setPreview(null)}
                disabled={enviando}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEnvio}
                disabled={enviando}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {enviando ? "Enviando…" : "Confirmar e enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

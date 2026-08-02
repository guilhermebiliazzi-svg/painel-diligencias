"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Linha = {
  repasse_id: number;
  contrato_id: number;
  locador_id: number;
  competencia: string;
  locador: string;
  locador_doc: string | null;
  locador_email: string | null;
  imovel: string | null;
  valor_aluguel: number;
  total_recebido: number;
  taxa_percentual: number | null;
  taxa_adm_valor: number;
  taxa_esperada: number;
  status_nota: "a_emitir" | "emitida" | "cancelada" | "dispensada";
  nota_id: number | null;
  numero_nota: string | null;
  data_emissao: string | null;
  pdf_url: string | null;
  observacao: string | null;
};
type Fat = {
  competencia: string;
  qtd_contratos: number;
  total_aluguel: number;
  total_recebido: number;
  faturamento_adm: number;
  faturamento_com_nota: number;
  faturamento_sem_nota: number;
  notas_emitidas: number;
  notas_pendentes: number;
};

const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlCurto = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const dataBR = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const mesLabel = (c: string) => {
  const [y, m] = c.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] || m}/${y.slice(2)}`;
};

export default function NotasFiscais() {
  const [competencia, setCompetencia] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fat, setFat] = useState<Fat | null>(null);
  const [serie, setSerie] = useState<Fat[]>([]);
  const [acumuladoAno, setAcumuladoAno] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // formulário de registro (aberto para um repasse por vez)
  const [editando, setEditando] = useState<number | null>(null);
  const [fNumero, setFNumero] = useState("");
  const [fData, setFData] = useState("");
  const [fCodigo, setFCodigo] = useState("");
  const [fPdf, setFPdf] = useState("");
  const [fObs, setFObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<string>("todas");
  const [busca, setBusca] = useState("");

  async function carregar(comp: string) {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/adm/notas?competencia=${comp}`);
      const d = await res.json();
      if (!res.ok) {
        setErro(d?.error || "Falha ao carregar.");
        setLinhas([]);
        setFat(null);
        setSerie([]);
      } else {
        setLinhas(d.linhas || []);
        setFat(d.faturamento || null);
        setSerie(d.serie || []);
        setAcumuladoAno(Number(d.acumulado_ano) || 0);
      }
    } catch {
      setErro("Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(competencia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia]);

  function abrir(l: Linha) {
    setEditando(l.repasse_id);
    setFNumero(l.numero_nota || "");
    setFData(l.data_emissao ? String(l.data_emissao).slice(0, 10) : new Date().toISOString().slice(0, 10));
    setFCodigo("");
    setFPdf(l.pdf_url || "");
    setFObs(l.observacao || "");
    setMsg(null);
  }
  function fechar() {
    setEditando(null);
    setMsg(null);
  }

  async function gravar(repasse_id: number, status: string) {
    if (salvando) return;
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/adm/notas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repasse_id,
          status,
          numero_nota: fNumero,
          codigo_verificacao: fCodigo,
          data_emissao: fData,
          pdf_url: fPdf,
          observacao: fObs,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d?.error || "Falha ao gravar.");
      } else {
        setEditando(null);
        await carregar(competencia);
      }
    } catch {
      setMsg("Erro de rede ao gravar.");
    } finally {
      setSalvando(false);
    }
  }

  async function desfazer(repasse_id: number) {
    if (!confirm("Desfazer o registro desta nota? A linha volta para “a emitir”.")) return;
    setSalvando(true);
    try {
      await fetch("/api/adm/notas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repasse_id, status: "a_emitir" }),
      });
      await carregar(competencia);
    } finally {
      setSalvando(false);
    }
  }

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todas: linhas.length, a_emitir: 0, emitida: 0, cancelada: 0, dispensada: 0 };
    for (const l of linhas) c[l.status_nota] = (c[l.status_nota] || 0) + 1;
    return c;
  }, [linhas]);

  const view = useMemo(() => {
    let arr = linhas;
    if (filtro !== "todas") arr = arr.filter((l) => l.status_nota === filtro);
    const q = busca.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (l) =>
          (l.locador || "").toLowerCase().includes(q) ||
          (l.imovel || "").toLowerCase().includes(q) ||
          String(l.contrato_id).includes(q)
      );
    }
    return arr;
  }, [linhas, filtro, busca]);

  const maxSerie = useMemo(
    () => Math.max(1, ...serie.map((s) => s.faturamento_adm)),
    [serie]
  );

  function baixarCsv() {
    const cab = [
      "contrato", "locador", "cpf_cnpj", "email", "imovel",
      "competencia", "aluguel", "taxa_pct", "taxa_valor",
      "situacao", "numero_nota", "data_emissao",
    ];
    const linhasCsv = view.map((l) =>
      [
        l.contrato_id,
        l.locador,
        l.locador_doc || "",
        l.locador_email || "",
        (l.imovel || "").replace(/;/g, ","),
        l.competencia,
        l.valor_aluguel.toFixed(2).replace(".", ","),
        l.taxa_percentual ?? "",
        l.taxa_adm_valor.toFixed(2).replace(".", ","),
        l.status_nota,
        l.numero_nota || "",
        l.data_emissao ? String(l.data_emissao).slice(0, 10) : "",
      ].join(";")
    );
    const csv = "\uFEFF" + [cab.join(";"), ...linhasCsv].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `notas-taxa-adm-${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="vj-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="vj-top">
        <a href="/cobrancas" className="vj-mark vj-marklink">RE/MAX <span>Ville</span></a>
        <div className="vj-crumb">Administração · Notas fiscais</div>
      </header>

      <main className="vj-main">
        <div className="vj-head">
          <div>
            <h1 className="vj-h1">Notas fiscais da taxa de administração</h1>
            <p className="vj-sub">
              Uma nota por contrato, sobre o que foi efetivamente recebido no mês.
              Emita na Prefeitura e registre aqui o número e o link.
            </p>
          </div>
          <label className="vj-field">
            <span>Competência</span>
            <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </label>
        </div>

        {erro && <div className="vj-erro">{erro}</div>}

        {/* FATURAMENTO */}
        {fat && (
          <section className="vj-card">
            <h2 className="vj-h2">Faturamento</h2>
            <div className="vj-nums">
              <div className="vj-num vj-num-t">
                <b>{brl(fat.faturamento_adm)}</b>
                <span>Taxa de administração · {mesLabel(competencia)}</span>
              </div>
              <div className="vj-num">
                <b>{brl(fat.total_aluguel)}</b>
                <span>Aluguéis recebidos (base da taxa)</span>
              </div>
              <div className="vj-num vj-num-w">
                <b>{brl(fat.faturamento_sem_nota)}</b>
                <span>Ainda sem nota</span>
              </div>
              <div className="vj-num vj-num-a">
                <b>{brl(acumuladoAno)}</b>
                <span>Acumulado {competencia.slice(0, 4)}</span>
              </div>
            </div>

            {serie.length > 1 ? (
              <div className="vj-serie">
                {serie.map((s) => (
                  <div
                    key={s.competencia}
                    className={`vj-serie-col${s.competencia === competencia ? " vj-serie-on" : ""}`}
                    title={`${mesLabel(s.competencia)} — ${brl(s.faturamento_adm)}`}
                    onClick={() => setCompetencia(s.competencia)}
                  >
                    <div className="vj-serie-val">{brlCurto(s.faturamento_adm)}</div>
                    <div
                      className="vj-serie-bar"
                      style={{ height: `${Math.max(4, (s.faturamento_adm / maxSerie) * 100)}%` }}
                    />
                    <div className="vj-serie-lbl">{mesLabel(s.competencia)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="vj-note vj-serie-vazia">
                Histórico aparece aqui conforme as competências forem fechando.
              </p>
            )}
          </section>
        )}

        {/* LISTA */}
        <section className="vj-card">
          <div className="vj-ajhead">
            <h2 className="vj-h2">
              Notas <span className="vj-count">{contagem.a_emitir} a emitir</span>
            </h2>
            {linhas.length > 0 && (
              <button className="vj-btn-status" onClick={baixarCsv}>⭳ CSV para a contabilidade</button>
            )}
          </div>

          {linhas.length === 0 ? (
            <p className="vj-empty">
              Nenhum repasse nesta competência — as notas aparecem depois que os repasses são gerados.
            </p>
          ) : (
            <>
              <div className="vj-filtros">
                <label className="vj-filtro">
                  <span>Situação</span>
                  <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                    <option value="todas">Todas ({contagem.todas})</option>
                    <option value="a_emitir">A emitir ({contagem.a_emitir})</option>
                    <option value="emitida">Emitidas ({contagem.emitida})</option>
                    <option value="dispensada">Dispensadas ({contagem.dispensada})</option>
                    <option value="cancelada">Canceladas ({contagem.cancelada})</option>
                  </select>
                </label>
                <label className="vj-filtro vj-filtro-busca">
                  <span>Buscar</span>
                  <input
                    type="text"
                    placeholder="Locador, imóvel ou nº do contrato…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </label>
                <div className="vj-filtro-contagem">{view.length} de {linhas.length}</div>
              </div>

              <table className="vj-tab">
                <thead>
                  <tr>
                    <th>Contrato</th>
                    <th>Locador (tomador)</th>
                    <th className="vj-r vj-comp">Aluguel</th>
                    <th className="vj-r vj-comp">%</th>
                    <th className="vj-r">Taxa</th>
                    <th>Nota</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((l) => (
                    <Fragment key={l.repasse_id}>
                      <tr className="vj-click">
                        <td className="vj-id" data-label="Contrato">#{l.contrato_id}</td>
                        <td>
                          <div className="vj-nome">{l.locador}</div>
                          <div className="vj-end">{l.locador_doc || "sem CPF/CNPJ"} · {l.imovel}</div>
                        </td>
                        <td className="vj-r vj-comp vj-compval" data-label="Aluguel">
                          {brl(l.valor_aluguel)}
                        </td>
                        <td className="vj-r vj-comp vj-compval">
                          {l.taxa_percentual != null ? `${l.taxa_percentual}%` : "—"}
                        </td>
                        <td className="vj-r vj-money" data-label="Taxa">
                          {brl(l.taxa_adm_valor)}
                          {Math.abs(l.taxa_adm_valor - l.taxa_esperada) > 0.02 && (
                            <span
                              className="vj-diverge"
                              title={`Pelo percentual (${l.taxa_percentual}% de ${brl(
                                l.valor_aluguel
                              )}) seria ${brl(l.taxa_esperada)}`}
                            >
                              ≠
                            </span>
                          )}
                        </td>
                        <td data-label="Nota">
                          {l.status_nota === "emitida" ? (
                            <span className="vj-tag vj-tag-pago">
                              ✓ nº {l.numero_nota} · {dataBR(l.data_emissao)}
                            </span>
                          ) : l.status_nota === "dispensada" ? (
                            <span className="vj-tag vj-tag-canc">dispensada</span>
                          ) : l.status_nota === "cancelada" ? (
                            <span className="vj-tag vj-tag-exp">cancelada</span>
                          ) : (
                            <span className="vj-tag vj-tag-wait">a emitir</span>
                          )}
                        </td>
                        <td className="vj-go">
                          {l.pdf_url && (
                            <a
                              className="vj-boleto"
                              href={l.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              ⭳ PDF
                            </a>
                          )}
                          {l.status_nota === "a_emitir" ? (
                            <button className="vj-btn-emitir vj-btn-emitir-sm" onClick={() => abrir(l)}>
                              Registrar nota
                            </button>
                          ) : (
                            <>
                              <button className="vj-linkbtn" onClick={() => abrir(l)}>Editar</button>
                              <button className="vj-linkbtn vj-linkbtn-d" onClick={() => desfazer(l.repasse_id)}>
                                Desfazer
                              </button>
                            </>
                          )}
                        </td>
                      </tr>

                      {editando === l.repasse_id && (
                        <tr className="vj-formrow">
                          <td colSpan={7}>
                            <div className="vj-form">
                              <div className="vj-formhead">
                                Contrato #{l.contrato_id} · {l.locador} · {l.taxa_percentual}% sobre
                                aluguel de {brl(l.valor_aluguel)} · serviço de {brl(l.taxa_adm_valor)}
                              </div>
                              <div className="vj-formgrid">
                                <label className="vj-field">
                                  <span>Número da nota *</span>
                                  <input value={fNumero} onChange={(e) => setFNumero(e.target.value)} />
                                </label>
                                <label className="vj-field">
                                  <span>Data de emissão *</span>
                                  <input type="date" value={fData} onChange={(e) => setFData(e.target.value)} />
                                </label>
                                <label className="vj-field">
                                  <span>Código de verificação</span>
                                  <input value={fCodigo} onChange={(e) => setFCodigo(e.target.value)} />
                                </label>
                              </div>
                              <label className="vj-field">
                                <span>Link do PDF da nota</span>
                                <input
                                  placeholder="https://nfe.prefeitura.sp.gov.br/..."
                                  value={fPdf}
                                  onChange={(e) => setFPdf(e.target.value)}
                                />
                              </label>
                              <label className="vj-field">
                                <span>Observação</span>
                                <input value={fObs} onChange={(e) => setFObs(e.target.value)} />
                              </label>
                              {msg && <div className="vj-erro vj-erroform">{msg}</div>}
                              <div className="vj-formacoes">
                                <button
                                  className="vj-btn vj-confirm vj-btnauto"
                                  disabled={salvando}
                                  onClick={() => gravar(l.repasse_id, "emitida")}
                                >
                                  {salvando ? "Gravando…" : "Gravar como emitida"}
                                </button>
                                <button
                                  className="vj-btn vj-ghost"
                                  disabled={salvando}
                                  onClick={() => gravar(l.repasse_id, "dispensada")}
                                >
                                  Dispensar
                                </button>
                                <button className="vj-btn vj-ghost" disabled={salvando} onClick={fechar}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {carregando && <div className="vj-load">Carregando…</div>}
      </main>
    </div>
  );
}

const CSS = `
.vj-wrap{--azul:#003DA5;--azul-esc:#00286b;--verm:#DC1C2E;--bg:#F4F6FA;--card:#fff;--linha:#E4E9F2;--txt:#16233B;--mut:#5A6B85;--ok:#0F7B4F;--wait:#B8860B;
  min-height:100vh;background:var(--bg);color:var(--txt);
  font-family:Archivo,"Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
.vj-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 28px;background:var(--azul);color:#fff}
.vj-mark{font-weight:800;letter-spacing:.5px;font-size:18px}.vj-mark span{color:#BFD3FF;font-weight:600}
.vj-marklink{color:#fff;text-decoration:none}
.vj-crumb{font-size:13px;color:#C9D8F5}
.vj-main{max-width:1040px;margin:0 auto;padding:32px 20px 80px}
.vj-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:22px}
.vj-h1{font-family:Fraunces,Georgia,serif;font-size:30px;font-weight:600;margin:0 0 6px}
.vj-sub{color:var(--mut);margin:0;max-width:60ch;line-height:1.5}
.vj-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.vj-field>span{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-field input,.vj-field select{font:inherit;padding:10px 12px;border:1px solid var(--linha);border-radius:9px;background:#fff;color:var(--txt)}
.vj-field input:focus,.vj-field select:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-card{background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:22px;margin-bottom:20px;box-shadow:0 1px 2px rgba(16,35,59,.04)}
.vj-h2{font-family:Fraunces,Georgia,serif;font-size:19px;font-weight:600;margin:0 0 14px;display:flex;align-items:center;gap:10px}
.vj-count{background:#FBF3E2;color:var(--wait);font-family:Archivo,sans-serif;font-size:13px;font-weight:700;padding:2px 10px;border-radius:20px}
.vj-nums{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.vj-num{border-left:3px solid var(--linha);padding-left:12px}
.vj-num b{display:block;font-size:23px;font-family:Fraunces,Georgia,serif;line-height:1.15}
.vj-num span{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-num-t{border-left-color:var(--azul)}
.vj-num-w{border-left-color:var(--wait)}
.vj-num-a{border-left-color:var(--ok)}
.vj-serie{display:flex;align-items:flex-end;gap:8px;height:150px;padding-top:8px;border-top:1px solid var(--linha)}
.vj-serie-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;cursor:pointer;gap:4px}
.vj-serie-bar{width:100%;max-width:46px;background:#C9D8F5;border-radius:5px 5px 0 0;transition:background .15s}
.vj-serie-col:hover .vj-serie-bar{background:var(--azul)}
.vj-serie-on .vj-serie-bar{background:var(--azul)}
.vj-serie-val{font-size:11px;color:var(--mut);font-variant-numeric:tabular-nums}
.vj-serie-on .vj-serie-val{color:var(--azul);font-weight:700}
.vj-serie-lbl{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px}
.vj-serie-vazia{border-top:1px solid var(--linha);padding-top:12px;margin:0}
.vj-note{font-size:13px;color:var(--mut)}
.vj-ajhead{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.vj-btn-status{background:#fff;border:1px solid var(--azul);color:var(--azul);font:inherit;font-weight:600;font-size:14px;padding:9px 16px;border-radius:9px;cursor:pointer}
.vj-btn-status:hover{background:#F2F7FF}
.vj-filtros{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin:4px 0 16px;padding-bottom:14px;border-bottom:1px solid var(--linha)}
.vj-filtro{display:flex;flex-direction:column;gap:5px}
.vj-filtro>span{font-size:11px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-filtro select,.vj-filtro input{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff;color:var(--txt)}
.vj-filtro select:focus,.vj-filtro input:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-filtro-busca{flex:1;min-width:180px}
.vj-filtro-busca input{width:100%}
.vj-filtro-contagem{font-size:13px;color:var(--mut);padding-bottom:9px;margin-left:auto}
.vj-tab{width:100%;border-collapse:collapse}
.vj-tab th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);padding:0 10px 10px;border-bottom:1px solid var(--linha)}
.vj-tab td{padding:12px 10px;border-bottom:1px solid var(--linha);font-size:14px;vertical-align:middle}
.vj-r{text-align:right}
.vj-click:hover{background:#F5F9FF}
.vj-id{font-weight:700;color:var(--azul);font-variant-numeric:tabular-nums}
.vj-nome{font-weight:600}
.vj-end{font-size:12px;color:var(--mut);margin-top:2px}
.vj-money{font-variant-numeric:tabular-nums;font-weight:600}
.vj-compval{font-variant-numeric:tabular-nums;color:var(--mut);font-size:13px;white-space:nowrap}
@media (max-width:900px){.vj-comp{display:none}}
.vj-tag{display:inline-block;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px}
.vj-tag-pago{background:#EAF7F0;color:var(--ok)}
.vj-tag-wait{background:#FBF3E2;color:var(--wait)}
.vj-tag-exp{background:#FDECEE;color:var(--verm)}
.vj-tag-canc{background:#EEE;color:#777}
.vj-go{text-align:right;white-space:nowrap}
.vj-boleto{display:inline-block;margin-right:10px;color:var(--azul);text-decoration:none;font-weight:600;font-size:13px;padding:4px 10px;border:1px solid var(--linha);border-radius:8px;background:#fff}
.vj-boleto:hover{background:#F2F7FF;border-color:var(--azul)}
.vj-linkbtn{background:none;border:none;color:var(--azul);font:inherit;font-weight:600;font-size:13px;cursor:pointer;padding:4px 8px}
.vj-linkbtn:hover{text-decoration:underline}
.vj-linkbtn-d{color:var(--mut)}
.vj-btn-emitir{background:var(--verm);color:#fff;border:none;font:inherit;font-weight:600;font-size:14px;padding:9px 16px;border-radius:9px;cursor:pointer}
.vj-btn-emitir:hover:not(:disabled){background:#B4131F}
.vj-btn-emitir-sm{padding:6px 12px;font-size:13px}
.vj-empty{color:var(--mut);margin:6px 0}
.vj-diverge{display:inline-block;margin-left:6px;color:var(--verm);font-weight:700;cursor:help}
.vj-formrow td{background:#F7FAFF;border-bottom:2px solid var(--linha)}
.vj-form{padding:6px 2px}
.vj-formhead{font-weight:600;margin-bottom:14px;color:var(--azul)}
.vj-formgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.vj-formacoes{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.vj-btn{font:inherit;font-weight:600;padding:11px 18px;border-radius:9px;border:1px solid transparent;cursor:pointer}
.vj-btn:disabled{opacity:.5;cursor:not-allowed}
.vj-ghost{background:#fff;border-color:var(--linha);color:var(--azul)}
.vj-ghost:hover:not(:disabled){background:#F2F7FF}
.vj-confirm{background:var(--verm);color:#fff}
.vj-confirm:hover:not(:disabled){background:#B4131F}
.vj-btnauto{width:auto}
.vj-erro{background:#FDECEE;border:1px solid #F6C6CC;color:#9B1420;padding:11px 14px;border-radius:9px;font-size:14px;margin-bottom:16px}
.vj-erroform{margin:4px 0 12px}
.vj-load{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--azul);color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;box-shadow:0 6px 20px rgba(0,61,165,.3)}
@media (max-width:720px){
  .vj-nums{grid-template-columns:1fr 1fr}
  .vj-formgrid{grid-template-columns:1fr}
  .vj-serie{height:120px}
  .vj-serie-val{display:none}
}
@media (max-width:640px){
  .vj-tab, .vj-tab tbody, .vj-tab tr, .vj-tab td { display:block; width:100% }
  .vj-tab thead { display:none }
  .vj-tab tr { border:1px solid var(--linha); border-radius:12px; padding:12px 14px; margin-bottom:12px; background:#fff }
  .vj-tab td { border:0; padding:5px 0; text-align:left !important; display:flex; justify-content:space-between; align-items:center; gap:12px }
  .vj-tab td[data-label]::before { content: attr(data-label); font-size:11px; font-weight:600; color:var(--mut); text-transform:uppercase; letter-spacing:.4px }
  .vj-tab td.vj-id { font-size:16px }
  .vj-nome { font-size:16px; font-weight:700 }
  .vj-go { padding-top:10px !important; border-top:1px solid var(--linha) !important; display:flex; gap:10px; justify-content:flex-start; flex-wrap:wrap }
  .vj-formrow td { display:block; padding:12px 0 }
  .vj-filtros { flex-direction:column; align-items:stretch }
  .vj-filtro-contagem { margin-left:0 }
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

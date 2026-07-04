"use client";

import { useEffect, useMemo, useState } from "react";

type Linha = {
  contrato_id: number;
  locatario: string;
  endereco: string;
  aluguel: number;
  estado: "pronto" | "aguardando" | "gravada";
  total: number | null;
  vencimento: string | null;
  cobranca_id: number | null;
  status_cobranca?: string | null;
  comp?: { aluguel: number; condominio: number; iptu: number; outros: number } | null;
};
type Resumo = { total: number; gravadas: number; prontas: number; aguardando: number };

const brl = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const brlComp = (n: number | null | undefined) =>
  n == null || n === 0 ? "—" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FechamentoMes() {
  const [competencia, setCompetencia] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar(comp: string) {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/adm/fechamento?competencia=${comp}`);
      const d = await res.json();
      if (!res.ok) {
        setErro(d?.error || "Falha ao carregar.");
        setLinhas([]);
        setResumo(null);
      } else {
        setResumo(d.resumo);
        setLinhas(d.linhas || []);
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

  const aGravar = useMemo(() => linhas.filter((l) => l.estado !== "gravada"), [linhas]);
  const gravadas = useMemo(() => linhas.filter((l) => l.estado === "gravada"), [linhas]);
  const pendentesEmissao = useMemo(
    () => gravadas.filter((l) => l.status_cobranca === "a_emitir" && l.cobranca_id),
    [gravadas]
  );
  const pct = resumo && resumo.total ? Math.round((resumo.gravadas / resumo.total) * 100) : 0;

  // ---- filtros / ordenação / busca (só na seção Gravadas) ----
  const [filtroSit, setFiltroSit] = useState<string>("todas");
  const [ordenar, setOrdenar] = useState<string>("vencimento");
  const [busca, setBusca] = useState<string>("");

  // "em aberto" = emitido sem situação de pagamento resolvida (emitido/null)
  const ehAberto = (s?: string | null) => s === "emitido" || s == null;
  const contagem = useMemo(() => {
    const c: Record<string, number> = {
      todas: gravadas.length, aberto: 0, pago: 0, atrasado: 0, expirado: 0, cancelado: 0, a_emitir: 0,
    };
    for (const l of gravadas) {
      const s = l.status_cobranca;
      if (s === "pago") c.pago++;
      else if (s === "atrasado") c.atrasado++;
      else if (s === "expirado") c.expirado++;
      else if (s === "cancelado") c.cancelado++;
      else if (s === "a_emitir") c.a_emitir++;
      else if (s === "emitindo") {/* em trânsito, não conta */}
      else c.aberto++;
    }
    return c;
  }, [gravadas]);

  const gravadasView = useMemo(() => {
    let arr = gravadas;
    if (filtroSit !== "todas") {
      arr = arr.filter((l) =>
        filtroSit === "aberto" ? ehAberto(l.status_cobranca) : l.status_cobranca === filtroSit
      );
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (l) => l.locatario?.toLowerCase().includes(q) || String(l.contrato_id).includes(q)
      );
    }
    const cmp = (a: Linha, b: Linha) => {
      switch (ordenar) {
        case "valor": return (b.total ?? 0) - (a.total ?? 0);
        case "nome": return (a.locatario || "").localeCompare(b.locatario || "", "pt-BR");
        case "contrato": return a.contrato_id - b.contrato_id;
        case "vencimento":
        default:
          return String(a.vencimento || "").localeCompare(String(b.vencimento || ""));
      }
    };
    return [...arr].sort(cmp);
  }, [gravadas, filtroSit, ordenar, busca]);

  const [emitindo, setEmitindo] = useState(false);
  const [msgEmissao, setMsgEmissao] = useState<string | null>(null);
  const [conciliando, setConciliando] = useState(false);

  async function conciliar() {
    if (conciliando) return;
    setConciliando(true);
    setMsgEmissao("Consultando o Banco Inter e atualizando os status…");
    try {
      const res = await fetch("/api/adm/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsgEmissao(`Erro ao atualizar: ${d?.error || "falha"}.`);
      } else {
        setMsgEmissao(
          `Status atualizado — pagos: ${d?.pago ?? 0} · em aberto: ${d?.em_aberto ?? 0} · atrasados: ${d?.atrasado ?? 0} · cancelados: ${d?.cancelado ?? 0}.`
        );
        carregar(competencia);
      }
    } catch {
      setMsgEmissao("Erro de rede ao atualizar status.");
    } finally {
      setConciliando(false);
    }
  }

  async function emitir(ids: number[]) {
    if (ids.length === 0 || emitindo) return;
    const qtd = ids.length;
    if (!confirm(`Emitir ${qtd} boleto(s) no Banco Inter? Isso gera cobrança real.`)) return;
    setEmitindo(true);
    setMsgEmissao(`Emitindo ${qtd} boleto(s)… pode levar alguns minutos (não feche a página).`);
    try {
      const res = await fetch("/api/adm/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobranca_ids: ids }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsgEmissao(`Erro: ${d?.error || "falha na emissão"}. ${d?.detail ? JSON.stringify(d.detail).slice(0, 200) : ""}`);
      } else if (d?.mensagem) {
        setMsgEmissao(d.mensagem);
      } else {
        const ok = d?.emitidos ?? 0;
        const fal = d?.falhas ?? 0;
        let msg = `✓ ${ok} emitido(s)`;
        if (fal > 0) {
          const detalhes = (d.detalhe_falhas || [])
            .map((f: any) => `#${f.cobranca_id}: ${f.erro}`)
            .join(" · ");
          msg += ` · ⚠ ${fal} falha(s) — ${detalhes}`;
        }
        setMsgEmissao(msg);
      }
      carregar(competencia);
    } catch {
      setMsgEmissao("Erro de rede ao emitir. Verifique no painel antes de tentar de novo — pode ter emitido parcialmente.");
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <div className="vj-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="vj-top">
        <a href="/cobrancas" className="vj-mark vj-marklink">RE/MAX <span>Ville</span></a>
        <div className="vj-crumb">Administração · Fechamento do mês</div>
      </header>

      <main className="vj-main">
        <div className="vj-head">
          <div>
            <h1 className="vj-h1">Fechamento do mês</h1>
            <p className="vj-sub">Acompanhe o que já virou cobrança e o que ainda falta.</p>
          </div>
          <label className="vj-field">
            <span>Competência</span>
            <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </label>
        </div>

        {/* progresso */}
        {resumo && (
          <section className="vj-card vj-resumo">
            <div className="vj-nums">
              <div className="vj-num"><b>{resumo.gravadas}</b><span>Gravadas</span></div>
              <div className="vj-num"><b>{resumo.prontas}</b><span>Prontas</span></div>
              <div className="vj-num vj-num-w"><b>{resumo.aguardando}</b><span>Aguardando condomínio</span></div>
              <div className="vj-num vj-num-t"><b>{resumo.total}</b><span>Contratos ativos</span></div>
            </div>
            <div className="vj-bar"><div className="vj-fill" style={{ width: `${pct}%` }} /></div>
            <div className="vj-barlbl">{resumo.gravadas} de {resumo.total} fechadas · {pct}%</div>
          </section>
        )}

        {erro && <div className="vj-erro">{erro}</div>}

        {/* A GRAVAR */}
        <section className="vj-card">
          <h2 className="vj-h2">A gravar <span className="vj-count">{aGravar.length}</span></h2>
          {aGravar.length === 0 ? (
            <p className="vj-empty">Tudo fechado nesta competência. 🎉</p>
          ) : (
            <table className="vj-tab">
              <thead><tr><th>Contrato</th><th>Locatário</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {aGravar.map((l) => (
                  <tr key={l.contrato_id} className="vj-click">
                    <td className="vj-id">
                      <a className="vj-rowlink" href={`/cobrancas/nova?contrato=${l.contrato_id}&competencia=${competencia}`}>#{l.contrato_id}</a>
                    </td>
                    <td>
                      <a className="vj-rowlink" href={`/cobrancas/nova?contrato=${l.contrato_id}&competencia=${competencia}`}>
                        <div className="vj-nome">{l.locatario}</div>
                        <div className="vj-end">{l.endereco}</div>
                      </a>
                    </td>
                    <td>
                      {l.estado === "pronto" ? (
                        <span className="vj-tag vj-tag-ok">Pronta pra fechar</span>
                      ) : (
                        <span className="vj-tag vj-tag-wait">Falta informar condomínio</span>
                      )}
                    </td>
                    <td className="vj-go">
                      <a className="vj-rowlink" href={`/cobrancas/nova?contrato=${l.contrato_id}&competencia=${competencia}`}>Conferir →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* GRAVADAS */}
        <section className="vj-card">
          <div className="vj-ajhead">
            <h2 className="vj-h2">Gravadas <span className="vj-count">{gravadas.length}</span></h2>
            <div className="vj-acoes-cab">
              {gravadas.length > 0 && (
                <button className="vj-btn-status" disabled={conciliando || emitindo} onClick={conciliar}>
                  {conciliando ? "Atualizando…" : "↻ Atualizar status"}
                </button>
              )}
              {pendentesEmissao.length > 0 && (
                <button
                  className="vj-btn-emitir"
                  disabled={emitindo || conciliando}
                  onClick={() => emitir(pendentesEmissao.map((l) => l.cobranca_id as number))}
                >
                  Emitir {pendentesEmissao.length} pendente(s) no Inter
                </button>
              )}
            </div>
          </div>
          {msgEmissao && <div className="vj-msgemissao">{msgEmissao}</div>}
          {gravadas.length === 0 ? (
            <p className="vj-empty">Nenhuma cobrança gravada ainda.</p>
          ) : (
            <>
            <div className="vj-filtros">
              <label className="vj-filtro">
                <span>Situação</span>
                <select value={filtroSit} onChange={(e) => setFiltroSit(e.target.value)}>
                  <option value="todas">Todas ({contagem.todas})</option>
                  <option value="aberto">Em aberto ({contagem.aberto})</option>
                  <option value="pago">Pagos ({contagem.pago})</option>
                  <option value="atrasado">Atrasados ({contagem.atrasado})</option>
                  <option value="expirado">Vencidos ({contagem.expirado})</option>
                  <option value="cancelado">Cancelados ({contagem.cancelado})</option>
                  <option value="a_emitir">A emitir ({contagem.a_emitir})</option>
                </select>
              </label>
              <label className="vj-filtro">
                <span>Ordenar por</span>
                <select value={ordenar} onChange={(e) => setOrdenar(e.target.value)}>
                  <option value="vencimento">Vencimento</option>
                  <option value="valor">Maior valor</option>
                  <option value="nome">Nome</option>
                  <option value="contrato">Nº do contrato</option>
                </select>
              </label>
              <label className="vj-filtro vj-filtro-busca">
                <span>Buscar</span>
                <input
                  type="text"
                  placeholder="Nome do locatário ou nº do contrato…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
              <div className="vj-filtro-contagem">
                {gravadasView.length} de {gravadas.length}
              </div>
            </div>
            {gravadasView.length === 0 ? (
              <p className="vj-empty">Nenhuma cobrança com esse filtro.</p>
            ) : (
            <table className="vj-tab">
              <thead><tr><th>Contrato</th><th>Locatário</th><th>Vencimento</th><th className="vj-r vj-comp">Aluguel</th><th className="vj-r vj-comp">Cond.</th><th className="vj-r vj-comp">IPTU</th><th className="vj-r vj-comp">Outros</th><th className="vj-r">Total</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {gravadasView.map((l) => (
                  <tr key={l.contrato_id} className="vj-click">
                    <td className="vj-id">
                      <a className="vj-rowlink" href={`/cobrancas/nova?contrato=${l.contrato_id}&competencia=${competencia}`}>#{l.contrato_id}</a>
                    </td>
                    <td>
                      <a className="vj-rowlink" href={`/cobrancas/nova?contrato=${l.contrato_id}&competencia=${competencia}`}>
                        <div className="vj-nome">{l.locatario}</div>
                      </a>
                    </td>
                    <td>{l.vencimento}</td>
                    <td className="vj-r vj-comp vj-compval">{brlComp(l.comp?.aluguel)}</td>
                    <td className="vj-r vj-comp vj-compval">{brlComp(l.comp?.condominio)}</td>
                    <td className="vj-r vj-comp vj-compval">{brlComp(l.comp?.iptu)}</td>
                    <td className={`vj-r vj-comp vj-compval${(l.comp?.outros ?? 0) < 0 ? " vj-neg" : ""}`}>{brlComp(l.comp?.outros)}</td>
                    <td className="vj-r vj-money">{brl(l.total)}</td>
                    <td>
                      {l.status_cobranca === "a_emitir" ? (
                        <button
                          className="vj-btn-emitir vj-btn-emitir-sm"
                          disabled={emitindo || !l.cobranca_id}
                          onClick={() => emitir([l.cobranca_id as number])}
                        >
                          Emitir
                        </button>
                      ) : l.status_cobranca === "emitindo" ? (
                        <span className="vj-emitindo">emitindo…</span>
                      ) : l.status_cobranca === "pago" ? (
                        <span className="vj-tag vj-tag-pago">✓ pago</span>
                      ) : l.status_cobranca === "atrasado" ? (
                        <span className="vj-tag vj-tag-atras">⚠ atrasado</span>
                      ) : l.status_cobranca === "expirado" ? (
                        <span className="vj-tag vj-tag-exp">vencido</span>
                      ) : l.status_cobranca === "cancelado" ? (
                        <span className="vj-tag vj-tag-canc">cancelado</span>
                      ) : (
                        <span className="vj-tag vj-tag-aberto">em aberto</span>
                      )}
                    </td>
                    <td className="vj-go">
                      {l.cobranca_id &&
                        l.status_cobranca !== "a_emitir" &&
                        l.status_cobranca !== "emitindo" &&
                        l.status_cobranca !== "cancelado" && (
                          <a
                            className="vj-boleto"
                            href={`/api/adm/boleto-pdf?cobranca=${l.cobranca_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir o boleto em PDF"
                          >
                            ⭳ Boleto
                          </a>
                        )}
                      <a className="vj-rowlink vj-revisar" href={`/cobrancas/nova?contrato=${l.contrato_id}&competencia=${competencia}`}>Revisar →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
            </>
          )}
        </section>

        {(carregando || emitindo) && <div className="vj-load">{emitindo ? "Emitindo no Inter…" : "Carregando…"}</div>}
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
.vj-main{max-width:960px;margin:0 auto;padding:32px 20px 80px}
.vj-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:22px}
.vj-h1{font-family:Fraunces,Georgia,serif;font-size:30px;font-weight:600;margin:0 0 6px}
.vj-sub{color:var(--mut);margin:0}
.vj-field{display:flex;flex-direction:column;gap:6px}
.vj-field>span{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-field input{font:inherit;padding:10px 12px;border:1px solid var(--linha);border-radius:9px;background:#fff;color:var(--txt)}
.vj-field input:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-card{background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:22px;margin-bottom:20px;box-shadow:0 1px 2px rgba(16,35,59,.04)}
.vj-resumo{padding-bottom:18px}
.vj-nums{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.vj-num{border-left:3px solid var(--linha);padding-left:12px}
.vj-num b{display:block;font-size:26px;font-family:Fraunces,Georgia,serif;line-height:1}
.vj-num span{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-num-w{border-left-color:var(--wait)}.vj-num-t{border-left-color:var(--azul)}
.vj-bar{height:8px;background:#EAF0FA;border-radius:20px;overflow:hidden}
.vj-fill{height:100%;background:var(--azul);border-radius:20px;transition:width .4s}
.vj-barlbl{font-size:13px;color:var(--mut);margin-top:8px}
.vj-h2{font-family:Fraunces,Georgia,serif;font-size:19px;font-weight:600;margin:0 0 14px;display:flex;align-items:center;gap:10px}
.vj-count{background:#EAF0FA;color:var(--azul);font-family:Archivo,sans-serif;font-size:13px;font-weight:700;padding:2px 10px;border-radius:20px}
.vj-tab{width:100%;border-collapse:collapse}
.vj-tab th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);padding:0 10px 10px;border-bottom:1px solid var(--linha)}
.vj-tab td{padding:12px 10px;border-bottom:1px solid var(--linha);font-size:14px;vertical-align:middle}
.vj-r{text-align:right}
.vj-click{cursor:pointer;transition:background .12s}
.vj-click:hover{background:#F5F9FF}
.vj-rowlink{display:block;color:inherit;text-decoration:none}
.vj-id{font-weight:700;color:var(--azul);font-variant-numeric:tabular-nums}
.vj-nome{font-weight:600}
.vj-end{font-size:12px;color:var(--mut);margin-top:2px}
.vj-money{font-variant-numeric:tabular-nums;font-weight:600}
.vj-compval{font-variant-numeric:tabular-nums;color:var(--mut);font-size:13px;white-space:nowrap}
.vj-neg{color:var(--verm)}
@media (max-width:900px){.vj-comp{display:none}}
.vj-tag{display:inline-block;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px}
.vj-tag-ok{background:#EAF7F0;color:var(--ok)}
.vj-tag-wait{background:#FBF3E2;color:var(--wait)}
.vj-go{text-align:right;color:var(--azul);font-weight:600;font-size:13px;white-space:nowrap}
.vj-boleto{display:inline-block;margin-right:12px;color:var(--azul);text-decoration:none;font-weight:600;font-size:13px;padding:4px 10px;border:1px solid var(--linha);border-radius:8px;background:#fff}
.vj-boleto:hover{background:#F2F7FF;border-color:var(--azul)}
.vj-revisar{display:inline-block}
.vj-empty{color:var(--mut);margin:6px 0}
.vj-ajhead{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.vj-acoes-cab{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.vj-btn-status{background:#fff;border:1px solid var(--azul);color:var(--azul);font:inherit;font-weight:600;font-size:14px;padding:9px 16px;border-radius:9px;cursor:pointer}
.vj-btn-status:hover:not(:disabled){background:#F2F7FF}
.vj-btn-status:disabled{opacity:.5;cursor:not-allowed}
.vj-tag-pago{background:#EAF7F0;color:var(--ok)}
.vj-tag-aberto{background:#EAF0FA;color:var(--azul)}
.vj-tag-atras{background:#FBF3E2;color:var(--wait)}
.vj-tag-exp{background:#FDECEE;color:var(--verm)}
.vj-tag-canc{background:#EEE;color:#777}
.vj-filtros{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin:4px 0 16px;padding-bottom:14px;border-bottom:1px solid var(--linha)}
.vj-filtro{display:flex;flex-direction:column;gap:5px}
.vj-filtro>span{font-size:11px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-filtro select,.vj-filtro input{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff;color:var(--txt)}
.vj-filtro select:focus,.vj-filtro input:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-filtro-busca{flex:1;min-width:180px}
.vj-filtro-busca input{width:100%}
.vj-filtro-contagem{font-size:13px;color:var(--mut);padding-bottom:9px;margin-left:auto}
.vj-btn-emitir{background:var(--verm);color:#fff;border:none;font:inherit;font-weight:600;font-size:14px;padding:9px 16px;border-radius:9px;cursor:pointer}
.vj-btn-emitir:hover:not(:disabled){background:#B4131F}
.vj-btn-emitir:disabled{opacity:.5;cursor:not-allowed}
.vj-btn-emitir-sm{padding:6px 12px;font-size:13px}
.vj-emitido{color:var(--ok);font-weight:600;font-size:13px;white-space:nowrap}
.vj-emitindo{color:var(--wait);font-weight:600;font-size:13px;white-space:nowrap}
.vj-msgemissao{background:#EAF0FA;border:1px solid #C9D8F5;color:var(--azul);padding:10px 14px;border-radius:9px;font-size:14px;margin:10px 0}
.vj-erro{background:#FDECEE;border:1px solid #F6C6CC;color:#9B1420;padding:11px 14px;border-radius:9px;font-size:14px;margin-bottom:16px}
.vj-load{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--azul);color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;box-shadow:0 6px 20px rgba(0,61,165,.3)}
@media (max-width:720px){.vj-nums{grid-template-columns:1fr 1fr}.vj-end{display:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

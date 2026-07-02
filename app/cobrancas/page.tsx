"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Linha = {
  contrato_id: number;
  locatario: string;
  endereco: string;
  aluguel: number;
  estado: "pronto" | "aguardando" | "gravada";
  total: number | null;
  vencimento: string | null;
  cobranca_id: number | null;
};
type Resumo = { total: number; gravadas: number; prontas: number; aguardando: number };

const brl = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FechamentoMes() {
  const router = useRouter();
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
  const pct = resumo && resumo.total ? Math.round((resumo.gravadas / resumo.total) * 100) : 0;

  function abrir(l: Linha) {
    router.push(`/cobrancas/nova?contrato=${l.contrato_id}&competencia=${competencia}`);
  }

  return (
    <div className="vj-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="vj-top">
        <div className="vj-mark">RE/MAX <span>Ville</span></div>
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
                  <tr key={l.contrato_id} className="vj-click" onClick={() => abrir(l)}>
                    <td className="vj-id">#{l.contrato_id}</td>
                    <td>
                      <div className="vj-nome">{l.locatario}</div>
                      <div className="vj-end">{l.endereco}</div>
                    </td>
                    <td>
                      {l.estado === "pronto" ? (
                        <span className="vj-tag vj-tag-ok">Pronta pra fechar</span>
                      ) : (
                        <span className="vj-tag vj-tag-wait">Falta informar condomínio</span>
                      )}
                    </td>
                    <td className="vj-go">Conferir →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* GRAVADAS */}
        <section className="vj-card">
          <h2 className="vj-h2">Gravadas <span className="vj-count">{gravadas.length}</span></h2>
          {gravadas.length === 0 ? (
            <p className="vj-empty">Nenhuma cobrança gravada ainda.</p>
          ) : (
            <table className="vj-tab">
              <thead><tr><th>Contrato</th><th>Locatário</th><th>Vencimento</th><th className="vj-r">Total</th><th></th></tr></thead>
              <tbody>
                {gravadas.map((l) => (
                  <tr key={l.contrato_id} className="vj-click" onClick={() => abrir(l)}>
                    <td className="vj-id">#{l.contrato_id}</td>
                    <td><div className="vj-nome">{l.locatario}</div></td>
                    <td>{l.vencimento}</td>
                    <td className="vj-r vj-money">{brl(l.total)}</td>
                    <td className="vj-go">Revisar →</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
.vj-id{font-weight:700;color:var(--azul);font-variant-numeric:tabular-nums}
.vj-nome{font-weight:600}
.vj-end{font-size:12px;color:var(--mut);margin-top:2px}
.vj-money{font-variant-numeric:tabular-nums;font-weight:600}
.vj-tag{display:inline-block;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px}
.vj-tag-ok{background:#EAF7F0;color:var(--ok)}
.vj-tag-wait{background:#FBF3E2;color:var(--wait)}
.vj-go{text-align:right;color:var(--azul);font-weight:600;font-size:13px;white-space:nowrap}
.vj-empty{color:var(--mut);margin:6px 0}
.vj-erro{background:#FDECEE;border:1px solid #F6C6CC;color:#9B1420;padding:11px 14px;border-radius:9px;font-size:14px;margin-bottom:16px}
.vj-load{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--azul);color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;box-shadow:0 6px 20px rgba(0,61,165,.3)}
@media (max-width:720px){.vj-nums{grid-template-columns:1fr 1fr}.vj-end{display:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

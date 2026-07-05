"use client";

import { useEffect, useState } from "react";

type Contrato = Record<string, any>;

const GARANTIAS = [
  { v: "fiador", t: "Fiador" },
  { v: "caucao", t: "Caução" },
  { v: "seguro_fianca", t: "Seguro-fiança" },
  { v: "capitalizacao", t: "Capitalização" },
  { v: "fianca_remax_ville", t: "Fiança RE/MAX Ville" },
  { v: "fianca_bancaria", t: "Fiança bancária" },
];
const TIPO_USO = [
  { v: "residencial", t: "Residencial" },
  { v: "comercial", t: "Comercial" },
];
// valores do enum adm_responsavel_pgto
const RESPONSAVEL = [
  { v: "imobiliaria", t: "Imobiliária" },
  { v: "locador", t: "Locador" },
  { v: "locatario", t: "Locatário" },
];
const STATUS = [
  { v: "ativo", t: "Ativo" },
  { v: "inativo", t: "Inativo" },
];
const INDICES = ["IPCA", "IGPM", "INPC", "IGP-M"];

// garantias que têm alerta de renovação (mostram campos extras)
const GARANTIA_COM_VALIDADE = new Set(["seguro_fianca", "capitalizacao", "fianca_bancaria"]);

export default function EditarContrato() {
  const [id, setId] = useState<string | null>(null);
  const [c, setC] = useState<Contrato | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const cid = p.get("id");
    setId(cid);
    if (!cid) {
      setErro("Informe o contrato: ?id=NN");
      setCarregando(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/adm/contrato?id=${cid}`);
        const d = await res.json();
        if (!res.ok) setErro(d?.error || "Falha ao carregar.");
        else setC(d);
      } catch {
        setErro("Erro de rede.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  function set(campo: string, valor: any) {
    setC((prev) => (prev ? { ...prev, [campo]: valor } : prev));
  }

  async function salvar() {
    if (!c || !id || salvando) return;
    setSalvando(true);
    setMsg(null);
    setErro(null);
    try {
      const res = await fetch(`/api/adm/contrato?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const d = await res.json();
      if (!res.ok) setErro(d?.error || "Falha ao salvar.");
      else {
        setMsg("Contrato salvo.");
        if (d.contrato) setC((prev) => ({ ...prev, ...d.contrato }));
      }
    } catch {
      setErro("Erro de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const imovel = c?.adm_imoveis;
  const locatario = c?.adm_locatarios;
  const mostraValidadeGarantia = c && GARANTIA_COM_VALIDADE.has(c.garantia_categoria);

  return (
    <div className="vj-wrap">
      <header className="vj-top">
        <a href="/cobrancas" className="vj-mark vj-marklink">RE/MAX <span>Ville</span></a>
        <div className="vj-crumb">Administração · Editar contrato</div>
      </header>

      <main className="vj-main">
        {carregando && <div className="vj-card">Carregando…</div>}
        {erro && <div className="vj-card vj-erro">{erro}</div>}

        {c && (
          <>
            <div className="vj-head">
              <div>
                <h1 className="vj-h1">Contrato #{c.id}</h1>
                <p className="vj-sub">
                  {locatario?.nome || "—"} ·{" "}
                  {imovel ? `${imovel.rua}, ${imovel.numero} — ${imovel.bairro}` : "—"}
                </p>
              </div>
              <button className="vj-btn-salvar" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>

            {msg && <div className="vj-card vj-ok">{msg}</div>}

            {/* Aluguel */}
            <section className="vj-card">
              <h2 className="vj-h2">Aluguel</h2>
              <div className="vj-grid">
                <label className="vj-f">
                  <span>Valor atual do aluguel</span>
                  <input type="number" step="0.01" value={c.valor_atual_aluguel ?? ""} onChange={(e) => set("valor_atual_aluguel", e.target.value)} />
                  <small>Atualize aqui ao aplicar um reajuste.</small>
                </label>
                <label className="vj-f">
                  <span>Valor do primeiro aluguel</span>
                  <input type="number" step="0.01" value={c.valor_primeiro_aluguel ?? ""} onChange={(e) => set("valor_primeiro_aluguel", e.target.value)} />
                  <small>Histórico — o valor original do contrato.</small>
                </label>
                <label className="vj-f">
                  <span>Dia de vencimento</span>
                  <input type="number" min="1" max="31" value={c.dia_vencimento ?? ""} onChange={(e) => set("dia_vencimento", e.target.value)} />
                </label>
                <label className="vj-f">
                  <span>Dia venc. condomínio</span>
                  <input type="number" min="1" max="31" value={c.dia_vencimento_condominio ?? ""} onChange={(e) => set("dia_vencimento_condominio", e.target.value)} />
                </label>
              </div>
            </section>

            {/* Prazo e vigência */}
            <section className="vj-card">
              <h2 className="vj-h2">Prazo e vigência</h2>
              <div className="vj-grid">
                <label className="vj-f">
                  <span>Data de início (histórico)</span>
                  <input type="date" value={c.data_inicio ?? ""} onChange={(e) => set("data_inicio", e.target.value)} />
                  <small>Data real de nascimento do contrato.</small>
                </label>
                <label className="vj-f">
                  <span>Vigência atual (âncora)</span>
                  <input type="date" value={c.data_vigencia_atual ?? ""} onChange={(e) => set("data_vigencia_atual", e.target.value)} />
                  <small>Avance ao renovar — os alertas recontam a partir daqui.</small>
                </label>
                <label className="vj-f">
                  <span>Data do primeiro aluguel</span>
                  <input type="date" value={c.data_primeiro_aluguel ?? ""} onChange={(e) => set("data_primeiro_aluguel", e.target.value)} />
                </label>
                <label className="vj-f">
                  <span>Prazo (meses)</span>
                  <input type="number" value={c.prazo_meses ?? ""} onChange={(e) => set("prazo_meses", e.target.value)} disabled={c.prazo_indeterminado} />
                </label>
                <label className="vj-f vj-check">
                  <input type="checkbox" checked={!!c.prazo_indeterminado} onChange={(e) => set("prazo_indeterminado", e.target.checked)} />
                  <span>Prazo indeterminado (sem alerta de renovação)</span>
                </label>
              </div>
            </section>

            {/* Reajuste */}
            <section className="vj-card">
              <h2 className="vj-h2">Reajuste</h2>
              <div className="vj-grid">
                <label className="vj-f">
                  <span>Índice</span>
                  <select value={c.indice_reajuste ?? ""} onChange={(e) => set("indice_reajuste", e.target.value)}>
                    <option value="">—</option>
                    {INDICES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
                <label className="vj-f">
                  <span>Período de reajuste (meses)</span>
                  <input type="number" value={c.periodo_reajuste_meses ?? ""} onChange={(e) => set("periodo_reajuste_meses", e.target.value)} />
                </label>
              </div>
            </section>

            {/* Garantia */}
            <section className="vj-card">
              <h2 className="vj-h2">Garantia</h2>
              <div className="vj-grid">
                <label className="vj-f">
                  <span>Tipo de garantia</span>
                  <select value={c.garantia_categoria ?? ""} onChange={(e) => set("garantia_categoria", e.target.value)}>
                    <option value="">—</option>
                    {GARANTIAS.map((g) => <option key={g.v} value={g.v}>{g.t}</option>)}
                  </select>
                </label>
                {mostraValidadeGarantia && (
                  <>
                    <label className="vj-f">
                      <span>Seguradora / instituição</span>
                      <input value={c.garantia_seguradora ?? ""} onChange={(e) => set("garantia_seguradora", e.target.value)} />
                    </label>
                    <label className="vj-f">
                      <span>Prazo da garantia (meses)</span>
                      <input type="number" value={c.garantia_prazo_meses ?? ""} onChange={(e) => set("garantia_prazo_meses", e.target.value)} />
                    </label>
                    {c.garantia_categoria !== "capitalizacao" && (
                      <label className="vj-f">
                        <span>Validade da garantia</span>
                        <input type="date" value={c.validade_garantia ?? ""} onChange={(e) => set("validade_garantia", e.target.value)} />
                        <small>Para seguro-fiança, a data virá da tela de seguros.</small>
                      </label>
                    )}
                  </>
                )}
                {c.garantia_categoria === "seguro_fianca" && (
                  <label className="vj-f">
                    <span>Valor do seguro-fiança (mensal)</span>
                    <input type="number" step="0.01" value={c.valor_seguro_fianca ?? ""} onChange={(e) => set("valor_seguro_fianca", e.target.value)} />
                  </label>
                )}
              </div>
            </section>

            {/* Responsabilidades e taxas */}
            <section className="vj-card">
              <h2 className="vj-h2">Responsabilidades e taxas</h2>
              <div className="vj-grid">
                <label className="vj-f">
                  <span>Tipo de uso</span>
                  <select value={c.tipo_uso ?? ""} onChange={(e) => set("tipo_uso", e.target.value)}>
                    <option value="">—</option>
                    {TIPO_USO.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
                  </select>
                </label>
                <label className="vj-f">
                  <span>IPTU pago por</span>
                  <select value={c.iptu_responsavel ?? ""} onChange={(e) => set("iptu_responsavel", e.target.value)}>
                    <option value="">—</option>
                    {RESPONSAVEL.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
                  </select>
                </label>
                <label className="vj-f">
                  <span>Condomínio pago por</span>
                  <select value={c.condominio_responsavel ?? ""} onChange={(e) => set("condominio_responsavel", e.target.value)}>
                    <option value="">—</option>
                    {RESPONSAVEL.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
                  </select>
                </label>
                <label className="vj-f">
                  <span>Taxa de administração (%)</span>
                  <input type="number" step="0.01" value={c.taxa_administracao ?? ""} onChange={(e) => set("taxa_administracao", e.target.value)} />
                </label>
                <label className="vj-f">
                  <span>Multa (%)</span>
                  <input type="number" step="0.01" value={c.multa_percentual ?? ""} onChange={(e) => set("multa_percentual", e.target.value)} />
                </label>
                <label className="vj-f">
                  <span>Mora ao mês (%)</span>
                  <input type="number" step="0.01" value={c.mora_percentual ?? ""} onChange={(e) => set("mora_percentual", e.target.value)} />
                </label>
                <label className="vj-f">
                  <span>Status</span>
                  <select value={c.status ?? "ativo"} onChange={(e) => set("status", e.target.value)}>
                    {STATUS.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <div className="vj-foot">
              <button className="vj-btn-salvar" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

const CSS = `
.vj-wrap{--azul:#003DA5;--azul-esc:#00286b;--verm:#DC1C2E;--bg:#F4F6FA;--card:#fff;--linha:#E4E9F2;--txt:#16233B;--mut:#5A6B85;--ok:#0F7B4F;min-height:100vh;background:var(--bg);color:var(--txt);font-family:Inter,system-ui,sans-serif}
.vj-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 28px;background:var(--azul);color:#fff}
.vj-mark{font-family:Archivo,sans-serif;font-weight:800;letter-spacing:.5px;color:#fff;text-decoration:none}
.vj-mark span{font-weight:400}
.vj-crumb{font-size:14px;opacity:.9}
.vj-main{max-width:900px;margin:0 auto;padding:24px 20px 60px}
.vj-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
.vj-h1{font-family:Archivo,sans-serif;font-size:28px;margin:0}
.vj-sub{color:var(--mut);margin:4px 0 0}
.vj-card{background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:20px;margin-bottom:16px}
.vj-h2{font-family:Archivo,sans-serif;font-size:17px;margin:0 0 16px;color:var(--azul)}
.vj-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.vj-f{display:flex;flex-direction:column;gap:5px}
.vj-f>span{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-f input,.vj-f select{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff;color:var(--txt)}
.vj-f input:focus,.vj-f select:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-f small{font-size:11px;color:var(--mut)}
.vj-check{flex-direction:row;align-items:center;gap:8px;grid-column:1 / -1}
.vj-check input{width:auto}
.vj-check>span{text-transform:none;font-weight:500;font-size:14px;color:var(--txt)}
.vj-btn-salvar{background:var(--verm);border:none;color:#fff;font:inherit;font-weight:600;font-size:15px;padding:11px 22px;border-radius:10px;cursor:pointer;white-space:nowrap}
.vj-btn-salvar:hover:not(:disabled){background:#b8121f}
.vj-btn-salvar:disabled{opacity:.5;cursor:not-allowed}
.vj-foot{display:flex;justify-content:flex-end;margin-top:8px}
.vj-erro{border-color:#F5C2C7;background:#FDECEE;color:#8B1A24}
.vj-ok{border-color:#BCE3D0;background:#EAF7F0;color:var(--ok)}
@media (max-width:640px){.vj-grid{grid-template-columns:1fr}.vj-head{flex-direction:column}}
`;

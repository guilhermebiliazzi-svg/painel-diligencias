"use client";

import { useEffect, useMemo, useState } from "react";

/* ---------- tipos ---------- */
type Contrato = {
  id: number;
  aluguel: number;
  dia_vencimento: number | null;
  locatario: string;
  endereco: string;
  avulso: boolean;
};
type Item = { descricao: string; valor: number; categoria: string };
type Despesa = {
  condominio?: number | string;
  extraordinaria?: number | string;
  iptu?: number | string;
  valor_avulso?: number | string;
  descricao_avulso?: string;
};
type Previa = {
  itens: Item[];
  total: number;
  despesa: Despesa;
  cobranca_id?: number;
  vencimento?: string;
  status?: string;
  modo?: string;
};

/* ---------- helpers ---------- */
const brl = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const num = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/* ---------- página ---------- */
export default function ConferenciaCobranca() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [competencia, setCompetencia] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [despesa, setDespesa] = useState<Despesa>({});
  const [diaVenc, setDiaVenc] = useState<number | "">("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [gravado, setGravado] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const contrato = useMemo(
    () => contratos.find((c) => c.id === contratoId) || null,
    [contratos, contratoId]
  );
  const compData = `${competencia}-01`;

  // vencimento padrão segue o dia do contrato; editável por mês
  useEffect(() => {
    setDiaVenc(contrato?.dia_vencimento ?? "");
  }, [contrato]);

  useEffect(() => {
    fetch("/api/adm/contratos")
      .then((r) => r.json())
      .then((d) => setContratos(d.contratos || []))
      .catch(() => setErro("Não consegui carregar os contratos."));
  }, []);

  // pré-seleção ao chegar do dashboard: /cobrancas/nova?contrato=13&competencia=2026-07
  // roda no mount, independente do carregamento dos contratos
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const cid = q.get("contrato");
    const comp = q.get("competencia");
    if (cid && !Number.isNaN(Number(cid))) setContratoId(Number(cid));
    if (comp) setCompetencia(comp);
  }, []);

  function reset() {
    setPrevia(null);
    setGravado(null);
    setErro(null);
  }

  async function chamar(payload: any): Promise<Previa | null> {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/adm/cobranca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(typeof data?.detail === "string" ? data.detail : data?.error || "Falha no cálculo.");
        return null;
      }
      return data as Previa;
    } catch (e) {
      setErro("Erro de rede ao falar com o servidor.");
      return null;
    } finally {
      setCarregando(false);
    }
  }

  // 1) Ler boleto(s) e calcular a primeira prévia
  async function calcularComBoleto() {
    if (!contratoId) return;
    setGravado(null);
    const boletos = await Promise.all(
      arquivos.map(async (f) => ({ mimeType: f.type || "application/pdf", data: await fileToBase64(f) }))
    );
    const p = await chamar({
      modo: "calcular",
      contrato_id: contratoId,
      competencia: compData,
      boletos,
    });
    if (p) {
      setPrevia(p);
      setDespesa(p.despesa || {});
    }
  }

  // 1b) Contrato sem boleto (aluguel-only ou valor avulso): calcula direto dos campos
  async function calcularSemBoleto() {
    if (!contratoId) return;
    setGravado(null);
    const p = await chamar({
      modo: "calcular",
      contrato_id: contratoId,
      competencia: compData,
      overrides: limparDespesa(despesa),
    });
    if (p) {
      setPrevia(p);
      setDespesa(p.despesa || despesa);
    }
  }

  // 2) Recalcular após editar os valores lidos
  async function recalcular() {
    if (!contratoId) return;
    const p = await chamar({
      modo: "calcular",
      contrato_id: contratoId,
      competencia: compData,
      overrides: limparDespesa(despesa),
    });
    if (p) setPrevia(p);
  }

  // 3) Confirmar e gravar
  async function confirmar() {
    if (!contratoId) return;
    const p = await chamar({
      modo: "confirmar",
      contrato_id: contratoId,
      competencia: compData,
      despesa: limparDespesa(despesa),
      vencimento: buildVenc(),
    });
    if (p) setGravado(p);
  }

  function limparDespesa(d: Despesa) {
    return {
      condominio: num(d.condominio) ?? 0,
      extraordinaria: num(d.extraordinaria) ?? 0,
      iptu: num(d.iptu) ?? 0,
      valor_avulso: num(d.valor_avulso),
      descricao_avulso: d.descricao_avulso,
    };
  }

  // monta o vencimento a partir do dia escolhido (clampado ao último dia do mês)
  function buildVenc(): string | null {
    const dia = Number(diaVenc);
    if (!dia || dia < 1 || dia > 31) return null;
    const [y, m] = competencia.split("-").map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    const d = Math.min(dia, ultimo);
    return `${competencia}-${String(d).padStart(2, "0")}`;
  }

  const podeCalcular = !!contratoId && !carregando;

  return (
    <div className="vj-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="vj-top">
        <a href="/cobrancas" className="vj-mark vj-marklink">RE/MAX <span>Ville</span></a>
        <div className="vj-crumb">Administração · Conferência de cobrança</div>
      </header>

      <main className="vj-main">
        <a href="/cobrancas" className="vj-back">← Fechamento do mês</a>
        <h1 className="vj-h1">Conferir e gerar cobrança</h1>
        <p className="vj-sub">
          Selecione o contrato, envie o boleto de condomínio/IPTU e confira a composição
          antes de gravar. Nada é gravado até você confirmar.
        </p>

        {/* seleção */}
        <section className="vj-card">
          <div className="vj-row">
            <label className="vj-field vj-grow">
              <span>Contrato</span>
              <select
                value={contratoId ?? ""}
                onChange={(e) => {
                  setContratoId(e.target.value ? Number(e.target.value) : null);
                  reset();
                  setDespesa({});
                  setArquivos([]);
                }}
              >
                <option value="">Selecione…</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} · {c.locatario} — {c.endereco}
                  </option>
                ))}
              </select>
            </label>

            <label className="vj-field">
              <span>Competência</span>
              <input type="month" value={competencia} onChange={(e) => { setCompetencia(e.target.value); reset(); }} />
            </label>
          </div>

          {contrato && (
            <div className="vj-hint">
              Aluguel atual <b>{brl(contrato.aluguel)}</b> · vencimento dia{" "}
              <b>{contrato.dia_vencimento ?? "—"}</b>
              {contrato.avulso && <span className="vj-badge">valor variável (digite abaixo)</span>}
            </div>
          )}

          {contrato && !contrato.avulso && (
            <div className="vj-upload">
              <input
                id="file"
                type="file"
                accept="application/pdf,image/*"
                multiple
                onChange={(e) => setArquivos(Array.from(e.target.files || []))}
              />
              <label htmlFor="file" className="vj-drop">
                {arquivos.length
                  ? `${arquivos.length} arquivo(s): ${arquivos.map((f) => f.name).join(", ")}`
                  : "Arraste ou clique para enviar o boleto de condomínio / IPTU (PDF)"}
              </label>
            </div>
          )}

          <div className="vj-actions">
            {contrato?.avulso ? (
              <button className="vj-btn vj-primary" disabled={!podeCalcular} onClick={calcularSemBoleto}>
                Calcular prévia
              </button>
            ) : (
              <>
                <button
                  className="vj-btn vj-primary"
                  disabled={!podeCalcular || arquivos.length === 0}
                  onClick={calcularComBoleto}
                >
                  Ler boleto e calcular
                </button>
                <button className="vj-btn vj-ghost" disabled={!podeCalcular} onClick={calcularSemBoleto}>
                  Calcular sem boleto
                </button>
              </>
            )}
          </div>

          {erro && <div className="vj-erro">{erro}</div>}
        </section>

        {/* prévia */}
        {previa && !gravado && (
          <section className="vj-grid">
            {/* valores editáveis */}
            <div className="vj-card">
              <h2 className="vj-h2">Valores lidos</h2>
              <p className="vj-note">Corrija qualquer valor que o boleto mostre diferente e recalcule.</p>

              {contrato?.avulso ? (
                <label className="vj-field">
                  <span>Valor do mês</span>
                  <input
                    inputMode="decimal"
                    value={despesa.valor_avulso ?? ""}
                    onChange={(e) => setDespesa({ ...despesa, valor_avulso: e.target.value })}
                  />
                </label>
              ) : (
                <>
                  <label className="vj-field">
                    <span>Condomínio (bruto)</span>
                    <input inputMode="decimal" value={despesa.condominio ?? ""} onChange={(e) => setDespesa({ ...despesa, condominio: e.target.value })} />
                  </label>
                  <label className="vj-field">
                    <span>Despesas extraordinárias</span>
                    <input inputMode="decimal" value={despesa.extraordinaria ?? ""} onChange={(e) => setDespesa({ ...despesa, extraordinaria: e.target.value })} />
                  </label>
                  <label className="vj-field">
                    <span>IPTU</span>
                    <input inputMode="decimal" value={despesa.iptu ?? ""} onChange={(e) => setDespesa({ ...despesa, iptu: e.target.value })} />
                  </label>
                </>
              )}

              <button className="vj-btn vj-ghost" disabled={carregando} onClick={recalcular}>
                Recalcular
              </button>
            </div>

            {/* composição + total */}
            <div className="vj-card">
              <h2 className="vj-h2">Composição do boleto</h2>
              <table className="vj-tab">
                <tbody>
                  {previa.itens.map((it, i) => (
                    <tr key={i}>
                      <td>{it.descricao}</td>
                      <td className="vj-val">{brl(it.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="vj-total">{brl(previa.total)}</td>
                  </tr>
                </tfoot>
              </table>

              <label className="vj-field vj-venc">
                <span>Vencimento (dia)</span>
                <input
                  inputMode="numeric"
                  value={diaVenc}
                  onChange={(e) => setDiaVenc(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              {buildVenc() && (
                <div className="vj-venclbl">Vence em {buildVenc()!.split("-").reverse().join("/")}</div>
              )}

              <button className="vj-btn vj-confirm" disabled={carregando} onClick={confirmar}>
                Confirmar e gravar
              </button>
            </div>
          </section>
        )}

        {/* gravado */}
        {gravado && (
          <section className="vj-card vj-ok">
            <div className="vj-okmark">✓ Cobrança gravada</div>
            <div className="vj-okgrid">
              <div><span>Cobrança</span><b>#{gravado.cobranca_id}</b></div>
              <div><span>Total</span><b>{brl(gravado.total)}</b></div>
              <div><span>Vencimento</span><b>{gravado.vencimento}</b></div>
              <div><span>Status</span><b>{gravado.status}</b></div>
            </div>
            <p className="vj-note">Pronta para emissão no Banco Inter.</p>
            <button className="vj-btn vj-ghost" onClick={() => { reset(); setDespesa({}); setArquivos([]); }}>
              Nova cobrança
            </button>
          </section>
        )}

        {carregando && <div className="vj-load">Processando…</div>}
      </main>
    </div>
  );
}

/* ---------- estilo (RE/MAX Ville: azul #003DA5, vermelho #DC1C2E) ---------- */
const CSS = `
.vj-wrap{--azul:#003DA5;--azul-esc:#00286b;--verm:#DC1C2E;--bg:#F4F6FA;--card:#fff;--linha:#E4E9F2;--txt:#16233B;--mut:#5A6B85;--ok:#0F7B4F;
  min-height:100vh;background:var(--bg);color:var(--txt);
  font-family:Archivo,"Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
.vj-top{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:16px 28px;background:var(--azul);color:#fff;}
.vj-mark{font-weight:800;letter-spacing:.5px;font-size:18px}
.vj-marklink{color:#fff;text-decoration:none}
.vj-mark span{color:#BFD3FF;font-weight:600}
.vj-crumb{font-size:13px;color:#C9D8F5}
.vj-back{display:inline-block;margin-bottom:14px;color:var(--azul);text-decoration:none;font-weight:600;font-size:14px}
.vj-back:hover{text-decoration:underline}
.vj-main{max-width:960px;margin:0 auto;padding:32px 20px 80px}
.vj-h1{font-family:Fraunces,Georgia,serif;font-size:30px;font-weight:600;margin:0 0 6px}
.vj-sub{color:var(--mut);margin:0 0 24px;max-width:60ch;line-height:1.5}
.vj-card{background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:22px;margin-bottom:20px;
  box-shadow:0 1px 2px rgba(16,35,59,.04)}
.vj-row{display:flex;gap:16px;flex-wrap:wrap}
.vj-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.vj-field.vj-grow{flex:1;min-width:260px}
.vj-field>span{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-field input,.vj-field select{font:inherit;padding:11px 12px;border:1px solid var(--linha);border-radius:9px;background:#fff;color:var(--txt)}
.vj-field input:focus,.vj-field select:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-hint{font-size:14px;color:var(--mut);margin:4px 0 14px}
.vj-hint b{color:var(--txt)}
.vj-badge{display:inline-block;margin-left:10px;background:#FDECEE;color:var(--verm);font-size:12px;font-weight:600;padding:3px 9px;border-radius:20px}
.vj-upload{position:relative;margin:6px 0 16px}
.vj-upload input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}
.vj-drop{display:block;border:1.5px dashed #B8C6DF;border-radius:11px;padding:22px;text-align:center;
  color:var(--mut);cursor:pointer;transition:.15s;background:#FAFCFF}
.vj-drop:hover{border-color:var(--azul);color:var(--azul);background:#F2F7FF}
.vj-actions{display:flex;gap:10px;flex-wrap:wrap}
.vj-btn{font:inherit;font-weight:600;padding:11px 18px;border-radius:9px;border:1px solid transparent;cursor:pointer;transition:.15s}
.vj-btn:disabled{opacity:.5;cursor:not-allowed}
.vj-primary{background:var(--azul);color:#fff}
.vj-primary:not(:disabled):hover{background:var(--azul-esc)}
.vj-ghost{background:#fff;border-color:var(--linha);color:var(--azul)}
.vj-ghost:not(:disabled):hover{background:#F2F7FF}
.vj-confirm{background:var(--verm);color:#fff;width:100%;margin-top:16px;padding:13px}
.vj-confirm:not(:disabled):hover{background:#B4131F}
.vj-erro{margin-top:14px;background:#FDECEE;border:1px solid #F6C6CC;color:#9B1420;padding:11px 14px;border-radius:9px;font-size:14px}
.vj-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.vj-h2{font-family:Fraunces,Georgia,serif;font-size:19px;font-weight:600;margin:0 0 4px}
.vj-note{font-size:13px;color:var(--mut);margin:0 0 16px}
.vj-tab{width:100%;border-collapse:collapse;margin-bottom:8px}
.vj-tab td{padding:11px 0;border-bottom:1px solid var(--linha);font-size:15px}
.vj-tab .vj-val{text-align:right;font-variant-numeric:tabular-nums}
.vj-tab tfoot td{border:0;padding-top:14px;font-weight:700}
.vj-total{text-align:right;font-size:22px;color:var(--azul);font-variant-numeric:tabular-nums}
.vj-venc{margin-top:16px;max-width:160px}
.vj-venclbl{font-size:13px;color:var(--mut);margin:-6px 0 4px}
.vj-ok{border-color:#B7E3CE;background:#F1FBF6}
.vj-okmark{color:var(--ok);font-weight:700;font-size:17px;margin-bottom:14px}
.vj-okgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:12px}
.vj-okgrid span{display:block;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-okgrid b{font-size:17px}
.vj-load{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--azul);color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;box-shadow:0 6px 20px rgba(0,61,165,.3)}
@media (max-width:720px){.vj-grid{grid-template-columns:1fr}.vj-okgrid{grid-template-columns:1fr 1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

"use client";

import { useEffect, useMemo, useState } from "react";

type Boleto = {
  id: number;
  vencimento: string | null;
  status_pgto: string | null;
  situacao_inter: string | null;
  data_recebimento: string | null;
  data_situacao: string | null;
  valor_recebido: number | null;
  valor_total_pago: number | null;
  total: number | null;
};
type Linha = {
  contrato_id: number;
  contrato_status: string;
  locatario: string;
  proprietario: string;
  endereco: string;
  boleto: Boleto | null;
  repasse: "pago" | "aguardando_aprovacao" | "erro" | "recibo_gerado" | "pendente";
  repasse_id: number | null;
  total_liquido: number | null;
  repassado_em: string | null;
};

const brl = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

function boletoTag(b: Boleto | null) {
  if (!b) return { cls: "neutro", txt: "não emitido", pago: false };
  const sit = String(b.situacao_inter || "").toUpperCase();
  if (b.status_pgto === "pago" || sit === "RECEBIDO" || sit === "MARCADO_RECEBIDO")
    return { cls: "pago", txt: `✓ pago ${dataBR(b.data_recebimento || b.data_situacao)}`.trim(), pago: true };
  if (sit === "CANCELADO") return { cls: "neutro", txt: "cancelado", pago: false };
  const venc = b.vencimento ? new Date(b.vencimento + "T23:59:59").getTime() : 0;
  if (sit === "ATRASADO" || (venc && venc < Date.now())) return { cls: "atras", txt: `⚠ atrasado (${dataBR(b.vencimento)})`, pago: false };
  return { cls: "aberto", txt: `em aberto · vence ${dataBR(b.vencimento)}`, pago: false };
}

function repasseTag(l: Linha) {
  switch (l.repasse) {
    case "pago": return { cls: "pago", txt: `✓ repassado ${dataBR(l.repassado_em)}`.trim() };
    case "aguardando_aprovacao": return { cls: "aberto", txt: "Pix aguardando aprovação" };
    case "erro": return { cls: "atras", txt: "Pix com erro" };
    case "recibo_gerado": return { cls: "aberto", txt: "recibo gerado · não pago" };
    default: return { cls: "neutro", txt: "não feito" };
  }
}

type Filtro = "todos" | "fazer" | "feitos";

export default function ListaRepasses({ competencia, recarregar, onAbrir }: {
  competencia: string;
  recarregar: number;
  onAbrir: (contratoId: number) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    setLinhas(null);
    setErro(null);
    fetch(`/api/adm/repasses-lista?competencia=${competencia}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (vivo) d?.linhas ? setLinhas(d.linhas) : setErro(d?.error || "Falha ao carregar."); })
      .catch(() => vivo && setErro("Erro de rede."));
    return () => { vivo = false; };
  }, [competencia, recarregar]);

  const feitos = (linhas || []).filter((l) => l.repasse === "pago").length;
  // a fazer = boleto pago e repasse ainda não feito
  const aFazer = (linhas || []).filter((l) => l.repasse !== "pago" && boletoTag(l.boleto).pago).length;

  const view = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (linhas || [])
      .filter((l) => (filtro === "feitos" ? l.repasse === "pago" : filtro === "fazer" ? l.repasse !== "pago" : true))
      .filter((l) => !q || `${l.contrato_id} ${l.locatario} ${l.proprietario} ${l.endereco}`.toLowerCase().includes(q))
      .sort((a, b) => {
        // pendentes com boleto pago primeiro, depois pendentes, depois feitos
        const peso = (l: Linha) => (l.repasse === "pago" ? 2 : boletoTag(l.boleto).pago ? 0 : 1);
        return peso(a) - peso(b) || a.contrato_id - b.contrato_id;
      });
  }, [linhas, filtro, busca]);

  return (
    <section className="vj-card vjl">
      <div className="vjl-topo">
        <h2 className="vj-h2" style={{ margin: 0 }}>Repasses da competência</h2>
        {linhas && (
          <div className="vjl-resumo">
            <span><b>{feitos}</b> feitos</span>
            <span><b>{linhas.length - feitos}</b> não feitos</span>
            {aFazer > 0 && <span className="vjl-alerta"><b>{aFazer}</b> com boleto pago aguardando repasse</span>}
          </div>
        )}
      </div>

      <div className="vjl-filtros">
        {([["todos", "Todos"], ["fazer", "Não feitos"], ["feitos", "Feitos"]] as [Filtro, string][]).map(([k, t]) => (
          <button key={k} className={`vjl-chip${filtro === k ? " on" : ""}`} onClick={() => setFiltro(k)}>{t}</button>
        ))}
        <input className="vjl-busca" placeholder="Buscar contrato, inquilino ou proprietário…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {erro && <p className="vjl-vazio">{erro}</p>}
      {!erro && !linhas && <p className="vjl-vazio">Carregando…</p>}
      {linhas && view.length === 0 && <p className="vjl-vazio">Nenhum contrato com esse filtro.</p>}

      {linhas && view.length > 0 && (
        <div className="vjl-scroll">
          <table className="vjl-tab">
            <thead>
              <tr><th>Contrato</th><th>Proprietário / inquilino</th><th>Boleto</th><th>Repasse</th><th className="vjl-r">Líquido</th><th></th></tr>
            </thead>
            <tbody>
              {view.map((l) => {
                const b = boletoTag(l.boleto);
                const r = repasseTag(l);
                return (
                  <tr key={l.contrato_id} onClick={() => onAbrir(l.contrato_id)}>
                    <td className="vjl-id">#{l.contrato_id}{l.contrato_status !== "ativo" ? <small> inativo</small> : null}</td>
                    <td>
                      <div className="vjl-nome">{l.proprietario}</div>
                      <div className="vjl-sub">{l.locatario}{l.endereco ? ` · ${l.endereco}` : ""}</div>
                    </td>
                    <td data-label="Boleto"><span className={`vjl-tag ${b.cls}`}>{b.txt}</span></td>
                    <td data-label="Repasse"><span className={`vjl-tag ${r.cls}`}>{r.txt}</span></td>
                    <td className="vjl-r" data-label="Líquido">{l.total_liquido != null ? brl(Number(l.total_liquido)) : "—"}</td>
                    <td className="vjl-go"><button className="vjl-abrir" onClick={(e) => { e.stopPropagation(); onAbrir(l.contrato_id); }}>Abrir →</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </section>
  );
}

const CSS = `
.vjl-topo{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.vjl-resumo{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:#5A6B85}
.vjl-resumo b{color:#16233B;font-variant-numeric:tabular-nums}
.vjl-alerta{color:#8A5A00}.vjl-alerta b{color:#8A5A00}
.vjl-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.vjl-chip{font:inherit;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;border:1px solid #E4E9F2;background:#fff;color:#5A6B85;cursor:pointer}
.vjl-chip.on{background:#003DA5;border-color:#003DA5;color:#fff}
.vjl-busca{flex:1;min-width:200px;font:inherit;font-size:13px;padding:7px 11px;border:1px solid #E4E9F2;border-radius:8px}
.vjl-vazio{color:#5A6B85;margin:8px 0}
.vjl-scroll{overflow-x:auto}
.vjl-tab{width:100%;border-collapse:collapse}
.vjl-tab th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#5A6B85;padding:0 10px 10px;border-bottom:1px solid #E4E9F2;white-space:nowrap}
.vjl-tab td{padding:11px 10px;border-bottom:1px solid #E4E9F2;font-size:14px;vertical-align:middle}
.vjl-tab tbody tr{cursor:pointer}.vjl-tab tbody tr:hover{background:#F7F9FC}
.vjl-id{font-weight:700;color:#003DA5;white-space:nowrap}.vjl-id small{color:#5A6B85;font-weight:500}
.vjl-nome{font-weight:600}
.vjl-sub{font-size:12px;color:#5A6B85;margin-top:2px}
.vjl-r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.vjl-tag{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}
.vjl-tag.pago{background:#EAF7F0;color:#0F7B4F}
.vjl-tag.aberto{background:#FFF6E0;color:#8A5A00}
.vjl-tag.atras{background:#FDECEE;color:#8B1A24}
.vjl-tag.neutro{background:#F1F4F9;color:#5A6B85}
.vjl-go{text-align:right}
.vjl-abrir{font:inherit;font-size:13px;font-weight:600;background:none;border:none;color:#003DA5;cursor:pointer;white-space:nowrap}
@media (max-width:640px){
  .vjl-tab thead{display:none}
  .vjl-tab,.vjl-tab tbody,.vjl-tab tr,.vjl-tab td{display:block;width:100%}
  .vjl-tab tr{border-bottom:1px solid #E4E9F2;padding:8px 0}
  .vjl-tab td{border:none;padding:4px 0}
  .vjl-tab td[data-label]{display:flex;justify-content:space-between;gap:10px}
  .vjl-tab td[data-label]::before{content:attr(data-label);font-size:12px;color:#5A6B85}
  .vjl-r{text-align:right}.vjl-go{text-align:left}
}
`;

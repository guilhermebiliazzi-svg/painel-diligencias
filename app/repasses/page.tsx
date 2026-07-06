"use client";

import { useEffect, useMemo, useState } from "react";

type Contrato = { id: number; locatario: string; endereco: string };
type Linha = { descricao: string; categoria: string; valor: number | string };
type Previa = {
  cobranca_id: number;
  contrato_id: number;
  competencia: string;
  cabecalho: { locador: string; imovel: string; cidade: string };
  recebimentos: Linha[];
  taxa_adm: { percentual: number; base: number; valor: number };
  deducoes: Linha[];
  totais: {
    total_recebido: number;
    credito_dono: number;
    taxa_adm: number;
    total_deducoes: number;
    liquido: number;
  };
  erro?: string;
};

const brl = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = new Date();
const compAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

export default function Repasse() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [competencia, setCompetencia] = useState(compAtual);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // valores editáveis (cópia local da prévia)
  const [recebimentos, setRecebimentos] = useState<Linha[]>([]);
  const [deducoes, setDeducoes] = useState<Linha[]>([]);
  const [taxaAdm, setTaxaAdm] = useState<number>(0);
  const [avulsas, setAvulsas] = useState<Linha[]>([]);

  useEffect(() => {
    fetch("/api/adm/contratos")
      .then((r) => r.json())
      .then((d) => setContratos(d.contratos || []))
      .catch(() => {});
  }, []);

  async function calcular() {
    if (!contratoId) return;
    setCarregando(true);
    setErro(null);
    setPrevia(null);
    try {
      const res = await fetch(`/api/adm/repasse-previa?contrato=${contratoId}&competencia=${competencia}`);
      const d = (await res.json()) as Previa;
      if (!res.ok || d.erro) {
        setErro(d.erro || "Falha ao calcular.");
      } else {
        setPrevia(d);
        setRecebimentos(d.recebimentos.map((x) => ({ ...x })));
        setDeducoes(d.deducoes.map((x) => ({ ...x })));
        setTaxaAdm(d.taxa_adm.valor);
        setAvulsas([]);
      }
    } catch {
      setErro("Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }

  // total líquido recalculado ao vivo
  const totais = useMemo(() => {
    const somaReceb = recebimentos.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const somaDed = deducoes.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const somaAvulsas = avulsas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const creditoDono = somaReceb; // o que o dono recebe (itens que foram ao boleto)
    const liquido = creditoDono - (Number(taxaAdm) || 0) - somaDed - somaAvulsas;
    return { somaReceb, somaDed, somaAvulsas, liquido };
  }, [recebimentos, deducoes, avulsas, taxaAdm]);

  function editarLinha(
    lista: Linha[],
    setLista: (l: Linha[]) => void,
    i: number,
    campo: keyof Linha,
    valor: any
  ) {
    setLista(lista.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  return (
    <div className="vj-wrap">
      <header className="vj-top">
        <a href="/cobrancas" className="vj-mark vj-marklink">RE/MAX <span>Ville</span></a>
        <div className="vj-crumb">Administração · Repasse ao locador</div>
      </header>

      <main className="vj-main">
        <div className="vj-head">
          <h1 className="vj-h1">Repasse ao locador</h1>
          <p className="vj-sub">Confira o demonstrativo, ajuste se necessário e gere o recibo.</p>
        </div>

        <section className="vj-card vj-sel">
          <label className="vj-field vj-grow">
            <span>Contrato</span>
            <select value={contratoId ?? ""} onChange={(e) => { setContratoId(e.target.value ? Number(e.target.value) : null); setPrevia(null); }}>
              <option value="">Selecione…</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>#{c.id} · {c.locatario} — {c.endereco}</option>
              ))}
            </select>
          </label>
          <label className="vj-field">
            <span>Competência</span>
            <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </label>
          <button className="vj-btn vj-primary" disabled={!contratoId || carregando} onClick={calcular}>
            {carregando ? "Calculando…" : "Calcular repasse"}
          </button>
        </section>

        {erro && <div className="vj-card vj-erro">{erro}</div>}

        {previa && (
          <>
            <section className="vj-card vj-cab">
              <div><small>Proprietário</small><b>{previa.cabecalho.locador}</b></div>
              <div><small>Imóvel</small><b>{previa.cabecalho.imovel}</b></div>
            </section>

            {/* Recebimentos */}
            <section className="vj-card">
              <h2 className="vj-h2">Recebimentos</h2>
              {recebimentos.map((l, i) => (
                <div key={i} className="vj-lin">
                  <input className="vj-desc" value={l.descricao} onChange={(e) => editarLinha(recebimentos, setRecebimentos, i, "descricao", e.target.value)} />
                  <input className="vj-vlr" type="number" step="0.01" value={l.valor} onChange={(e) => editarLinha(recebimentos, setRecebimentos, i, "valor", e.target.value)} />
                </div>
              ))}
              <div className="vj-subtotal"><span>Total recebido</span><b>{brl(totais.somaReceb)}</b></div>
            </section>

            {/* Deduções */}
            <section className="vj-card">
              <h2 className="vj-h2">Deduções</h2>
              <div className="vj-lin">
                <span className="vj-desc vj-fixa">Taxa de administração ({previa.taxa_adm.percentual}%)</span>
                <input className="vj-vlr" type="number" step="0.01" value={taxaAdm} onChange={(e) => setTaxaAdm(Number(e.target.value))} />
              </div>
              {deducoes.map((l, i) => (
                <div key={i} className="vj-lin">
                  <input className="vj-desc" value={l.descricao} onChange={(e) => editarLinha(deducoes, setDeducoes, i, "descricao", e.target.value)} />
                  <input className="vj-vlr" type="number" step="0.01" value={l.valor} onChange={(e) => editarLinha(deducoes, setDeducoes, i, "valor", e.target.value)} />
                  <button className="vj-x" onClick={() => setDeducoes(deducoes.filter((_, idx) => idx !== i))} title="Remover">×</button>
                </div>
              ))}

              {/* Deduções avulsas (manutenção, comissão, etc.) */}
              {avulsas.map((l, i) => (
                <div key={`av${i}`} className="vj-lin vj-lin-avulsa">
                  <input className="vj-desc" placeholder="Descrição (ex.: Manutenção hidráulica)" value={l.descricao} onChange={(e) => editarLinha(avulsas, setAvulsas, i, "descricao", e.target.value)} />
                  <input className="vj-vlr" type="number" step="0.01" placeholder="0,00" value={l.valor} onChange={(e) => editarLinha(avulsas, setAvulsas, i, "valor", e.target.value)} />
                  <button className="vj-x" onClick={() => setAvulsas(avulsas.filter((_, idx) => idx !== i))} title="Remover">×</button>
                </div>
              ))}
              <button className="vj-add" onClick={() => setAvulsas([...avulsas, { descricao: "", categoria: "avulso", valor: "" }])}>
                + Adicionar dedução avulsa
              </button>
            </section>

            {/* Total líquido */}
            <section className="vj-card vj-liquido">
              <span>Total líquido a repassar</span>
              <b>{brl(totais.liquido)}</b>
            </section>

            <div className="vj-acoes">
              <button className="vj-btn vj-gerar" disabled>
                Gerar recibo (em breve)
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
.vj-wrap{--azul:#003DA5;--verm:#DC1C2E;--bg:#F4F6FA;--card:#fff;--linha:#E4E9F2;--txt:#16233B;--mut:#5A6B85;min-height:100vh;background:var(--bg);color:var(--txt);font-family:Inter,system-ui,sans-serif}
.vj-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 28px;background:var(--azul);color:#fff}
.vj-mark{font-family:Archivo,sans-serif;font-weight:800;color:#fff;text-decoration:none}.vj-mark span{font-weight:400}
.vj-crumb{font-size:14px;opacity:.9}
.vj-main{max-width:820px;margin:0 auto;padding:24px 20px 60px}
.vj-head{margin-bottom:16px}
.vj-h1{font-family:Archivo,sans-serif;font-size:28px;margin:0}
.vj-sub{color:var(--mut);margin:4px 0 0}
.vj-card{background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:18px;margin-bottom:14px}
.vj-sel{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap}
.vj-field{display:flex;flex-direction:column;gap:6px}
.vj-field.vj-grow{flex:1;min-width:240px}
.vj-field>span{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-field input,.vj-field select{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff}
.vj-h2{font-family:Archivo,sans-serif;font-size:16px;margin:0 0 14px;color:var(--azul)}
.vj-cab{display:flex;gap:32px;flex-wrap:wrap}
.vj-cab small{display:block;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}
.vj-lin{display:flex;gap:10px;align-items:center;margin-bottom:8px}
.vj-desc{flex:1;font:inherit;padding:8px 10px;border:1px solid var(--linha);border-radius:7px}
.vj-desc.vj-fixa{background:#F7F9FC;color:var(--txt);display:flex;align-items:center}
.vj-vlr{width:140px;font:inherit;padding:8px 10px;border:1px solid var(--linha);border-radius:7px;text-align:right}
.vj-lin-avulsa .vj-desc,.vj-lin-avulsa .vj-vlr{border-style:dashed;border-color:#B8860B}
.vj-x{background:none;border:none;color:var(--verm);font-size:20px;cursor:pointer;padding:0 6px;line-height:1}
.vj-add{margin-top:6px;background:none;border:1px dashed var(--azul);color:var(--azul);font:inherit;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer}
.vj-subtotal{display:flex;justify-content:space-between;padding-top:12px;margin-top:8px;border-top:1px solid var(--linha);font-size:15px}
.vj-liquido{display:flex;justify-content:space-between;align-items:center;background:var(--azul);color:#fff;font-size:18px}
.vj-liquido b{font-size:24px;color:#fff}
.vj-btn{font:inherit;font-weight:600;padding:11px 22px;border-radius:9px;cursor:pointer;border:none}
.vj-primary{background:var(--azul);color:#fff}
.vj-gerar{background:var(--verm);color:#fff;width:100%}
.vj-gerar:disabled{opacity:.5;cursor:not-allowed}
.vj-acoes{margin-top:4px}
.vj-erro{border-color:#F5C2C7;background:#FDECEE;color:#8B1A24}
@media (max-width:640px){.vj-sel{flex-direction:column;align-items:stretch}.vj-vlr{width:110px}}
`;

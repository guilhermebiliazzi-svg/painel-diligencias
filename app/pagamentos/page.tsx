"use client";

import { useEffect, useState } from "react";

// Contas a pagar: boletos de IPTU/condomínio de responsabilidade da imobiliária.
// Cola-se a linha digitável, confere-se valor/vencimento e envia-se ao Inter.
// O pagamento fica pendente da sua aprovação no app do banco.

type PagamentoItem = {
  id: number;
  status: string;
  inter_status: string | null;
  inter_codigo: string | null;
  valor: number;
  linha_digitavel: string | null;
};

type Item = {
  contrato_id: number;
  endereco: string;
  complemento?: string | null;
  locatario?: string | null;
  subtipo: "iptu" | "condominio";
  rotulo: string;
  valor: number;
  boleto: { url: string | null; nome: string | null } | null;
  pagamentos: PagamentoItem[];
};

const brl = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const hoje = new Date();
const compAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

export default function PagamentosPage() {
  const [competencia, setCompetencia] = useState(compAtual);
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregou, setCarregou] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/adm/contas-a-pagar?competencia=${competencia}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao carregar.");
      else {
        setItens(d.itens || []);
        setCarregou(true);
      }
    } catch {
      setErro("Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="vj-wrap">
      <header className="vj-top">
        <a href="/" className="vj-mark vj-marklink">RE/MAX <span>Ville</span></a>
        <div className="vj-crumb">Administração · Contas a pagar</div>
      </header>

      <main className="vj-main">
        <div className="vj-head">
          <h1 className="vj-h1">Contas a pagar</h1>
          <p className="vj-sub">
            Boletos de IPTU e condomínio de responsabilidade da imobiliária. Cada pagamento é
            enviado ao Banco Inter e fica pendente da sua aprovação no app do banco.
          </p>
        </div>

        <section className="vj-card vj-sel">
          <label className="vj-field">
            <span>Competência</span>
            <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </label>
          <button className="vj-btn vj-primary" disabled={carregando} onClick={carregar}>
            {carregando ? "Carregando…" : "Carregar boletos"}
          </button>
        </section>

        {erro && <div className="vj-card vj-erro">{erro}</div>}

        {carregou && itens.length === 0 && (
          <div className="vj-card vj-vazio">
            Nenhum boleto de responsabilidade da imobiliária nesta competência.
          </div>
        )}

        {itens.map((it) => (
          <LinhaBoleto key={`${it.contrato_id}|${it.subtipo}`} item={it} competencia={competencia} />
        ))}
      </main>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

function PagoRow({ pagamento }: { pagamento: PagamentoItem }) {
  const [pg, setPg] = useState<PagamentoItem>(pagamento);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [checando, setChecando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (pg.status !== "efetivado") return;
    (async () => {
      try {
        const r = await fetch(`/api/adm/pagar-boleto?pagamento=${pg.id}`, { cache: "no-store" });
        const d = await r.json();
        if (d.comprovante_url) setComprovante(d.comprovante_url);
      } catch {
        /* silencioso */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checar() {
    setChecando(true);
    try {
      const r = await fetch(`/api/adm/pagar-boleto?pagamento=${pg.id}`, { cache: "no-store" });
      const d = await r.json();
      if (d.pagamento) setPg((p) => ({ ...p, status: d.pagamento.status, inter_status: d.pagamento.inter_status }));
      if (d.comprovante_url) setComprovante(d.comprovante_url);
    } catch {
      /* silencioso */
    } finally {
      setChecando(false);
    }
  }

  async function cancelar() {
    if (!confirm("Cancelar o agendamento deste boleto no Inter?")) return;
    setCancelando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/adm/pagar-boleto?pagamento=${pg.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao cancelar.");
      else setPg((p) => ({ ...p, status: "cancelado" }));
    } catch {
      setErro("Erro de rede ao cancelar.");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="vj-pago">
      {erro && <div className="vj-erro-in">{erro}</div>}
      {pg.status === "efetivado" ? (
        <p className="vj-badge efet">✓ Pago</p>
      ) : pg.status === "cancelado" ? (
        <p className="vj-badge canc">Agendamento cancelado</p>
      ) : (
        <p className="vj-badge aguard">⏳ Enviado ao Inter — aguardando sua aprovação no app</p>
      )}
      <p className="vj-cod">
        Valor {brl(pg.valor)}
        {pg.inter_codigo ? <> · transação {pg.inter_codigo}</> : null}
      </p>
      {pg.status === "efetivado" && comprovante && (
        <a className="vj-link" href={comprovante} target="_blank" rel="noopener noreferrer">📄 Baixar comprovante (PDF)</a>
      )}
      {pg.status !== "efetivado" && pg.status !== "cancelado" && (
        <div className="vj-status-acoes">
          <button className="vj-link" onClick={checar} disabled={checando}>{checando ? "Consultando…" : "Atualizar status"}</button>
          <button className="vj-link vj-del-link" onClick={cancelar} disabled={cancelando}>{cancelando ? "Cancelando…" : "Cancelar agendamento"}</button>
        </div>
      )}
    </div>
  );
}

function NovoBoleto({ item, competencia, autoRead }: { item: Item; competencia: string; autoRead: boolean }) {
  const [pago, setPago] = useState<PagamentoItem | null>(null);
  const [linha, setLinha] = useState("");
  const [valor, setValor] = useState("");
  const [venc, setVenc] = useState("");
  const [cpf, setCpf] = useState("");
  const [dataPag, setDataPag] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lida, setLida] = useState(false);
  const [avisoVenc, setAvisoVenc] = useState<string | null>(null);
  const [vencOrigem, setVencOrigem] = useState<string | null>(null);

  // Lê a linha do boleto anexado (só o primeiro formulário).
  useEffect(() => {
    if (!autoRead || !item.boleto) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/adm/ler-linha-digitavel?contrato=${item.contrato_id}&competencia=${competencia}&subtipo=${item.subtipo}`, { cache: "no-store" });
        const d = await r.json();
        if (!vivo) return;
        if (d.linha) { setLinha((a) => (a.replace(/\D/g, "") ? a : d.linha)); setLida(true); }
        // O valor vem do próprio código de barras, em centavos — é o que o
        // banco cobra. Só preenche se o campo ainda estiver vazio.
        if (d.valor > 0) setValor((a) => (a ? a : String(d.valor)));
        if (d.vencimento) {
          setVenc((a) => a || d.vencimento);
          setVencOrigem(d.vencimento_origem || null);
          // Data de pagamento = vencimento, desde que não esteja no passado.
          const hojeISO = new Date().toISOString().slice(0, 10);
          if (String(d.vencimento) >= hojeISO) setDataPag((a) => a || d.vencimento);
          const [cy, cm] = competencia.split("-").map(Number);
          const [vy, vm] = String(d.vencimento).slice(0, 7).split("-").map(Number);
          if (vy * 12 + vm - (cy * 12 + cm) !== 0) {
            const [yy, mm, dd] = String(d.vencimento).split("-");
            setAvisoVenc(`Este boleto vence em ${dd}/${mm}/${yy} — fora da competência ${competencia}. Confira.`);
          }
        }
      } catch {
        /* silencioso */
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviar() {
    setErro(null);
    const linhaDig = linha.replace(/\D/g, "");
    if (linhaDig.length < 44 || linhaDig.length > 48) { setErro("Linha digitável inválida (44 a 48 dígitos)."); return; }
    if (!(Number(valor) > 0)) { setErro("Informe o valor a pagar."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) { setErro("Informe o vencimento."); return; }
    const quando = dataPag ? `agendado para ${dataPag.split("-").reverse().join("/")}` : "hoje";
    if (!confirm(`Enviar pagamento de ${brl(Number(valor))} — ${item.rotulo} de ${item.endereco} (${quando})?\n\nVai ao Inter e fica pendente da sua aprovação no app do banco.`)) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/adm/pagar-boleto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrato_id: item.contrato_id, competencia, subtipo: item.subtipo, linha_digitavel: linhaDig, valor: Number(valor), vencimento: venc, cpfCnpjBeneficiario: cpf || undefined, dataPagamento: dataPag || undefined }),
      });
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao enviar.");
      else if (d.jaExiste) setErro(d.mensagem || "Este boleto já foi enviado.");
      else setPago({ id: d.pagamento_id, status: d.status || "aguardando_aprovacao", inter_status: d.statusPagamento || null, inter_codigo: d.codigoTransacao || null, valor: Number(valor), linha_digitavel: linhaDig });
    } catch {
      setErro("Erro de rede.");
    } finally {
      setEnviando(false);
    }
  }

  if (pago) return <PagoRow pagamento={pago} />;

  return (
    <div className="vj-form">
      {erro && <div className="vj-erro-in">{erro}</div>}
      {avisoVenc && <div className="vj-aviso-in">⚠ {avisoVenc}</div>}
      <label className="vj-f">
        <span>Linha digitável / código de barras{lida ? <span className="vj-lida"> · lida do boleto, confira</span> : null}</span>
        <input value={linha} onChange={(e) => { setLinha(e.target.value); setLida(false); }} placeholder="Só os números do boleto" inputMode="numeric" />
      </label>
      <div className="vj-frow">
        <label className="vj-f"><span>Valor a pagar</span><input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></label>
        <label className="vj-f">
          <span>
            Vencimento{" "}
            {vencOrigem === "codigo-de-barras" && <b className="vj-lida">· do código de barras</b>}
          </span>
          <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
        </label>
        <label className="vj-f"><span>CPF/CNPJ beneficiário (opcional)</span><input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="só números" inputMode="numeric" /></label>
        <label className="vj-f"><span>Data de pagamento (vazio = hoje; futura = agenda)</span><input type="date" value={dataPag} onChange={(e) => setDataPag(e.target.value)} /></label>
      </div>
      <button className="vj-btn vj-gerar" onClick={enviar} disabled={enviando}>
        {enviando ? "Enviando…" : dataPag ? "Agendar pagamento no Inter" : "Enviar pagamento ao Inter"}
      </button>
    </div>
  );
}

function LinhaBoleto({ item, competencia }: { item: Item; competencia: string }) {
  const [novos, setNovos] = useState<number[]>([0]);

  return (
    <section className="vj-card vj-boleto">
      <div className="vj-boleto-cab">
        <div>
          <span className="vj-tag">{item.rotulo}</span>
          <b className="vj-endereco">{item.endereco}</b>
          <span className="vj-sub-id">Contrato #{item.contrato_id}{item.locatario ? ` · Locatário: ${item.locatario}` : ""}</span>
        </div>
        <div className="vj-valor-ref">
          {item.valor > 0 ? <>Valor de referência <b>{brl(item.valor)}</b> <span className="vj-ref-obs">(total)</span></> : <span className="vj-semvalor">sem valor lançado</span>}
        </div>
      </div>

      {item.boleto?.url && (
        <a href={item.boleto.url} target="_blank" rel="noopener noreferrer" className="vj-boleto-link">
          📄 Abrir boleto anexado{item.boleto.nome ? ` (${item.boleto.nome})` : ""}
        </a>
      )}

      {item.pagamentos.map((p) => (
        <PagoRow key={p.id} pagamento={p} />
      ))}

      {novos.map((n, idx) => (
        <NovoBoleto key={n} item={item} competencia={competencia} autoRead={idx === 0 && item.pagamentos.length === 0} />
      ))}

      <button className="vj-add-btn" onClick={() => setNovos((ns) => [...ns, (ns.length ? Math.max(...ns) : 0) + 1])}>
        ＋ Adicionar outro boleto (apto, vaga…)
      </button>
    </section>
  );
}

const CSS = `
.vj-wrap{--azul:#003DA5;--verm:#DC1C2E;--bg:#F4F6FA;--card:#fff;--linha:#E4E9F2;--txt:#16233B;--mut:#5A6B85;min-height:100vh;background:var(--bg);color:var(--txt);font-family:Inter,system-ui,sans-serif}
.vj-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 28px;background:var(--azul);color:#fff}
.vj-mark{font-weight:800;color:#fff;text-decoration:none}.vj-mark span{color:#BFD3FF;font-weight:600}
.vj-crumb{font-size:14px;opacity:.9}
.vj-main{max-width:820px;margin:0 auto;padding:24px 20px 60px}
.vj-head{margin-bottom:16px}
.vj-h1{font-size:28px;margin:0}
.vj-sub{color:var(--mut);margin:4px 0 0;line-height:1.5;max-width:64ch}
.vj-card{background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:18px;margin-bottom:14px}
.vj-sel{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap}
.vj-field{display:flex;flex-direction:column;gap:6px}
.vj-field>span{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-field input{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff}
.vj-btn{font:inherit;font-weight:600;padding:11px 22px;border-radius:9px;cursor:pointer;border:none}
.vj-primary{background:var(--azul);color:#fff}
.vj-gerar{background:var(--verm);color:#fff;width:100%}
.vj-btn:disabled{opacity:.5;cursor:not-allowed}
.vj-erro{border-color:#F5C2C7;background:#FDECEE;color:#8B1A24}
.vj-vazio{color:var(--mut);text-align:center}
.vj-boleto-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.vj-tag{display:inline-block;background:#EEF2FB;color:var(--azul);font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px}
.vj-endereco{display:block;font-size:15px}
.vj-sub-id{display:block;font-size:12px;color:var(--mut);margin-top:3px}
.vj-valor-ref{font-size:13px;color:var(--mut);text-align:right}
.vj-valor-ref b{color:var(--txt)}
.vj-semvalor{color:#B7791F}
.vj-boleto-link{display:inline-block;color:var(--azul);font-weight:600;font-size:13px;text-decoration:none;margin-bottom:12px}
.vj-boleto-link:hover{text-decoration:underline}
.vj-form{display:flex;flex-direction:column;gap:12px}
.vj-f{display:flex;flex-direction:column;gap:6px;flex:1;min-width:150px}
.vj-f>span{font-size:12px;font-weight:600;color:var(--mut)}
.vj-lida{color:#0F7B4F;font-weight:600}
.vj-f input{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff}
.vj-frow{display:flex;gap:12px;flex-wrap:wrap}
.vj-erro-in{background:#FDECEE;border:1px solid #F5C2C7;color:#8B1A24;padding:8px 11px;border-radius:8px;font-size:13px;margin-bottom:10px}
.vj-aviso-in{background:#FFF7E6;border:1px solid #FADFA0;color:#8a6d00;padding:8px 11px;border-radius:8px;font-size:13px;margin-bottom:10px;font-weight:600}
.vj-ok-in{background:#EAF7F0;border:1px solid #BCE3D0;color:#0F7B4F;padding:8px 11px;border-radius:8px;font-size:13px;margin-bottom:10px}
.vj-status{display:flex;flex-direction:column;gap:6px}
.vj-badge{margin:0;font-weight:700;font-size:14px}
.vj-badge.aguard{color:#8a6d00}
.vj-badge.efet{color:#0F7B4F}
.vj-badge.canc{color:#8B1A24}
.vj-pago{border:1px solid var(--linha);border-radius:11px;padding:12px 14px;margin-bottom:10px;background:#F8FAFD;display:flex;flex-direction:column;gap:6px}
.vj-add-h{font-size:13px;font-weight:700;color:var(--azul);margin-bottom:2px}
.vj-ref-obs{font-size:11px;color:var(--mut)}
.vj-add-btn{margin-top:6px;background:none;border:1px dashed var(--azul);color:var(--azul);font:inherit;font-weight:600;padding:9px 14px;border-radius:9px;cursor:pointer;width:100%}
.vj-cod{margin:0;font-size:13px;color:var(--mut)}
.vj-link{align-self:flex-start;background:none;border:none;color:var(--azul);font:inherit;font-weight:600;font-size:13px;cursor:pointer;padding:0;text-decoration:underline}
.vj-status-acoes{display:flex;gap:16px;flex-wrap:wrap}
.vj-del-link{color:var(--verm)}
@media (max-width:640px){.vj-sel{flex-direction:column;align-items:stretch}}
`;

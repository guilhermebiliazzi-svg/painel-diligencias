"use client";

import { useCallback, useEffect, useState } from "react";

// Repasse ao locador via Pix. Submete ao Inter; a saída fica pendente da sua
// aprovação no app do banco (Gestão de Aprovações).

type Conta = {
  id: number;
  titular: string | null;
  cpf_cnpj: string | null;
  banco_ispb: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
};

type Pagamento = {
  id: number;
  status: string;
  inter_status: string | null;
  inter_codigo: string | null;
  valor: number;
} | null;

const brl = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PixRepasse({
  contratoId,
  competencia,
  valorLiquido,
}: {
  contratoId: number;
  competencia: string; // YYYY-MM
  valorLiquido: number;
}) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState<number | null>(null);
  const [pg, setPg] = useState<Pagamento>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [checando, setChecando] = useState(false);

  const carregarStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/adm/repasse-pix?contrato=${contratoId}&competencia=${competencia}`, { cache: "no-store" });
      const d = await r.json();
      setPg(d.pagamento || null);
    } catch {
      /* silencioso */
    }
  }, [contratoId, competencia]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/adm/contas-bancarias?contrato=${contratoId}`, { cache: "no-store" });
        const d = await r.json();
        if (!vivo) return;
        const cs: Conta[] = d.contas || [];
        setContas(cs);
        if (cs[0]) setContaId(cs[0].id);
      } catch {
        /* silencioso */
      }
    })();
    carregarStatus();
    return () => {
      vivo = false;
    };
  }, [contratoId, competencia, carregarStatus]);

  async function enviar() {
    if (!contaId) {
      setErro("Escolha a conta de destino.");
      return;
    }
    const c = contas.find((x) => x.id === contaId);
    const alvo = c ? `${c.titular || "conta"} — ag ${c.agencia}/${c.conta}` : "";
    if (!confirm(`Enviar repasse de ${brl(valorLiquido)} via Pix para:\n${alvo}\n\nO pagamento vai ao Inter e fica pendente da sua aprovação no app do banco. Confirmar?`)) {
      return;
    }
    setEnviando(true);
    setErro(null);
    setMsg(null);
    try {
      const r = await fetch("/api/adm/repasse-pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrato_id: contratoId, competencia, conta_bancaria_id: contaId }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErro(d?.error || "Falha ao enviar o Pix.");
      } else {
        setMsg(d.jaExiste ? d.mensagem : "Repasse enviado ao Inter.");
        await carregarStatus();
      }
    } catch {
      setErro("Erro de rede ao enviar o Pix.");
    } finally {
      setEnviando(false);
    }
  }

  async function checar() {
    setChecando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/adm/repasse-pix?contrato=${contratoId}&competencia=${competencia}`, { cache: "no-store" });
      const d = await r.json();
      setPg(d.pagamento || null);
    } catch {
      setErro("Erro ao consultar status.");
    } finally {
      setChecando(false);
    }
  }

  const jaEnviado = pg && ["submetido", "aguardando_aprovacao", "efetivado"].includes(pg.status);

  return (
    <section className="vjpix">
      <h2 className="vjpix-h">Repasse via Pix</h2>

      {erro && <div className="vjpix-erro">{erro}</div>}
      {msg && <div className="vjpix-ok">{msg}</div>}

      {jaEnviado ? (
        <div className="vjpix-status">
          {pg!.status === "efetivado" ? (
            <p className="vjpix-badge efet">✓ Repasse efetivado</p>
          ) : (
            <p className="vjpix-badge aguard">⏳ Enviado ao Inter — aguardando sua aprovação no app do banco</p>
          )}
          <p className="vjpix-cod">
            Valor {brl(pg!.valor)}
            {pg!.inter_codigo ? <> · código {pg!.inter_codigo}</> : null}
          </p>
          {pg!.status !== "efetivado" && (
            <button className="vjpix-link" onClick={checar} disabled={checando}>
              {checando ? "Consultando…" : "Atualizar status"}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="vjpix-sub">
            Envia o valor líquido por Pix para a conta do locador. Fica pendente da sua
            aprovação no app do Inter antes de sair.
          </p>
          {contas.length === 0 ? (
            <p className="vjpix-vazio">Nenhuma conta bancária cadastrada para este locador.</p>
          ) : (
            <label className="vjpix-field">
              <span>Conta de destino</span>
              <select value={contaId ?? ""} onChange={(e) => setContaId(Number(e.target.value))}>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titular || "Titular"} — ag {c.agencia}/{c.conta} ({c.tipo_conta === "CONTA_POUPANCA" ? "poupança" : "corrente"})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="vjpix-btn"
            onClick={enviar}
            disabled={enviando || !contaId || !(valorLiquido > 0)}
          >
            {enviando ? "Enviando…" : `Enviar repasse via Pix (${brl(valorLiquido)})`}
          </button>
        </>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
.vjpix{background:#fff;border:1px solid #E4E9F2;border-radius:14px;padding:20px;margin-bottom:16px}
.vjpix-h{font-size:16px;margin:0 0 4px;color:#003DA5;font-weight:700}
.vjpix-sub{font-size:13px;color:#5A6B85;margin:0 0 12px;line-height:1.45}
.vjpix-erro{background:#FDECEE;border:1px solid #F5C2C7;color:#8B1A24;padding:9px 12px;border-radius:9px;font-size:13px;margin-bottom:10px}
.vjpix-ok{background:#EAF7F0;border:1px solid #BCE3D0;color:#0F7B4F;padding:9px 12px;border-radius:9px;font-size:13px;margin-bottom:10px}
.vjpix-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.vjpix-field>span{font-size:12px;font-weight:600;color:#5A6B85;text-transform:uppercase;letter-spacing:.4px}
.vjpix-field select{font:inherit;padding:10px 11px;border:1px solid #E4E9F2;border-radius:9px;background:#fff}
.vjpix-btn{background:#003DA5;color:#fff;border:none;font:inherit;font-weight:700;padding:12px 20px;border-radius:9px;cursor:pointer;width:100%}
.vjpix-btn:disabled{opacity:.5;cursor:not-allowed}
.vjpix-vazio{font-size:13px;color:#8B1A24;background:#FDECEE;border:1px solid #F5C2C7;padding:9px 12px;border-radius:9px}
.vjpix-status{display:flex;flex-direction:column;gap:6px}
.vjpix-badge{margin:0;font-weight:700;font-size:14px}
.vjpix-badge.aguard{color:#8a6d00}
.vjpix-badge.efet{color:#0F7B4F}
.vjpix-cod{margin:0;font-size:13px;color:#5A6B85}
.vjpix-link{align-self:flex-start;background:none;border:none;color:#003DA5;font:inherit;font-weight:600;font-size:13px;cursor:pointer;padding:0;text-decoration:underline}
.vjpix-link:disabled{opacity:.5;cursor:default}
`,
        }}
      />
    </section>
  );
}

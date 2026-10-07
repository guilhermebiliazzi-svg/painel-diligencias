"use client";

// Conta bancária do locador para o repasse (Pix por dados bancários via Inter).
// - FormConta: só o formulário (usado no Novo contrato).
// - ContaRepasse (default): quadro completo da tela Editar contrato.

import { useCallback, useEffect, useState } from "react";
import { BANCOS, TIPOS_CONTA, nomeBanco } from "@/lib/bancos";

export type ContaForm = {
  titular: string;
  cpf_cnpj: string;
  banco_ispb: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
};
type Conta = ContaForm & { id: number; contrato_id: number | null; locador_id: number | null };

export const contaVazia = (titular = "", cpf = ""): ContaForm => ({
  titular,
  cpf_cnpj: cpf,
  banco_ispb: "",
  agencia: "",
  conta: "",
  tipo_conta: "CONTA_CORRENTE",
});

export function resumoConta(c: Partial<ContaForm>) {
  return `${nomeBanco(c.banco_ispb)} · ag ${c.agencia || "—"} · ${c.tipo_conta === "CONTA_POUPANCA" ? "poup" : "cc"} ${c.conta || "—"}`;
}

const OUTRO = "__outro__";

export function FormConta({ v, onChange }: { v: ContaForm; onChange: (v: ContaForm) => void }) {
  const naLista = BANCOS.some((b) => b.ispb === v.banco_ispb);
  const [outro, setOutro] = useState(!!v.banco_ispb && !naLista);
  return (
    <div className="vj-cr-form">
      <label>Titular *<input value={v.titular} onChange={(e) => onChange({ ...v, titular: e.target.value })} /></label>
      <label>CPF / CNPJ do titular *<input value={v.cpf_cnpj} onChange={(e) => onChange({ ...v, cpf_cnpj: e.target.value })} /></label>
      <label>
        Banco *
        <select
          value={outro ? OUTRO : v.banco_ispb}
          onChange={(e) => {
            if (e.target.value === OUTRO) {
              setOutro(true);
              onChange({ ...v, banco_ispb: "" });
            } else {
              setOutro(false);
              onChange({ ...v, banco_ispb: e.target.value });
            }
          }}
        >
          <option value="">— escolha —</option>
          {BANCOS.map((b) => (
            <option key={b.ispb} value={b.ispb}>{b.codigo} · {b.nome}</option>
          ))}
          <option value={OUTRO}>Outro (informar ISPB)</option>
        </select>
      </label>
      {outro ? (
        <label>
          ISPB do banco *
          <input maxLength={8} placeholder="8 dígitos" value={v.banco_ispb} onChange={(e) => onChange({ ...v, banco_ispb: e.target.value.replace(/\D/g, "") })} />
        </label>
      ) : (
        <label>
          Tipo de conta
          <select value={v.tipo_conta} onChange={(e) => onChange({ ...v, tipo_conta: e.target.value })}>
            {TIPOS_CONTA.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
          </select>
        </label>
      )}
      <label>Agência * <small>(sem dígito)</small><input value={v.agencia} onChange={(e) => onChange({ ...v, agencia: e.target.value })} /></label>
      <label>Conta * <small>(com dígito)</small><input placeholder="12345-6" value={v.conta} onChange={(e) => onChange({ ...v, conta: e.target.value })} /></label>
      {outro && (
        <label>
          Tipo de conta
          <select value={v.tipo_conta} onChange={(e) => onChange({ ...v, tipo_conta: e.target.value })}>
            {TIPOS_CONTA.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
          </select>
        </label>
      )}
      <style dangerouslySetInnerHTML={{ __html: CSS_CR }} />
    </div>
  );
}

export default function ContaRepasse({ contratoId }: { contratoId: number }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [locador, setLocador] = useState<{ nome: string; cpf_cnpj: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: number | null; v: ContaForm } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/adm/contas-bancarias?contrato=${contratoId}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao carregar a conta.");
      else {
        setContas(d.contas || []);
        setLocador(d.locador || null);
      }
    } catch {
      setErro("Erro de rede ao carregar a conta.");
    }
  }, [contratoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const proprias = contas.filter((c) => c.contrato_id === contratoId);
  const doLocador = contas.filter((c) => c.contrato_id !== contratoId);

  async function salvar() {
    if (!editando || salvando) return;
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      const r = await fetch(
        editando.id ? `/api/adm/contas-bancarias?id=${editando.id}` : "/api/adm/contas-bancarias",
        {
          method: editando.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...editando.v, contrato_id: contratoId }),
        }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErro(d?.error || "Falha ao salvar a conta.");
      else {
        setOk("Conta salva.");
        setEditando(null);
        await carregar();
      }
    } finally {
      setSalvando(false);
    }
  }

  async function copiarParaContrato(c: Conta) {
    setEditando({ id: null, v: { titular: c.titular || "", cpf_cnpj: c.cpf_cnpj || "", banco_ispb: c.banco_ispb || "", agencia: c.agencia || "", conta: c.conta || "", tipo_conta: c.tipo_conta || "CONTA_CORRENTE" } });
  }

  async function excluir(c: Conta) {
    if (!window.confirm("Excluir esta conta do contrato?")) return;
    const r = await fetch(`/api/adm/contas-bancarias?id=${c.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setErro(d?.error || "Falha ao excluir.");
    await carregar();
  }

  return (
    <section className="vj-card">
      <h2 className="vj-h2">Conta para repasse (dados bancários do locador)</h2>
      {erro && <div className="vj-cr-erro">{erro}</div>}
      {ok && <div className="vj-cr-ok">{ok}</div>}

      {proprias.length === 0 && !editando && (
        <p className="vj-cr-aviso">
          Este contrato ainda não tem conta de repasse{doLocador.length ? " própria — hoje o repasse usa a conta abaixo, do locador." : ". Sem ela o repasse por Pix não sai."}
        </p>
      )}

      <ul className="vj-cr-lista">
        {proprias.map((c) => (
          <li key={c.id}>
            <div>
              <b>{c.titular}</b> · {c.cpf_cnpj}
              <small>{resumoConta(c)}</small>
            </div>
            <div className="vj-cr-acoes">
              <button type="button" onClick={() => setEditando({ id: c.id, v: { titular: c.titular || "", cpf_cnpj: c.cpf_cnpj || "", banco_ispb: c.banco_ispb || "", agencia: c.agencia || "", conta: c.conta || "", tipo_conta: c.tipo_conta || "CONTA_CORRENTE" } })}>Editar</button>
              <button type="button" onClick={() => excluir(c)}>Excluir</button>
            </div>
          </li>
        ))}
        {proprias.length === 0 &&
          doLocador.map((c) => (
            <li key={c.id} className="vj-cr-outra">
              <div>
                <b>{c.titular}</b> · {c.cpf_cnpj}
                <small>{resumoConta(c)} · cadastrada no contrato #{c.contrato_id}</small>
              </div>
              <div className="vj-cr-acoes">
                <button type="button" onClick={() => copiarParaContrato(c)}>Usar neste contrato</button>
              </div>
            </li>
          ))}
      </ul>

      {editando ? (
        <>
          <FormConta v={editando.v} onChange={(v) => setEditando({ ...editando, v })} />
          <div className="vj-cr-botoes">
            <button type="button" className="vj-cr-btn" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar conta"}
            </button>
            <button type="button" className="vj-cr-link" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="vj-cr-btn vj-cr-btn-sec"
          onClick={() => setEditando({ id: null, v: contaVazia(locador?.nome || "", locador?.cpf_cnpj || "") })}
        >
          + {proprias.length ? "Adicionar outra conta" : "Cadastrar conta"}
        </button>
      )}
      <style dangerouslySetInnerHTML={{ __html: CSS_CR }} />
    </section>
  );
}

const CSS_CR = `
.vj-cr-form{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;background:#F8FAFD;border:1px solid var(--linha,#E4E9F2);border-radius:10px;padding:14px;margin-top:6px}
.vj-cr-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--mut,#5A6B85);text-transform:uppercase;letter-spacing:.4px}
.vj-cr-form label small{text-transform:none;font-weight:400;letter-spacing:0}
.vj-cr-form input,.vj-cr-form select{font:inherit;font-size:14px;text-transform:none;letter-spacing:0;font-weight:400;padding:9px 11px;border:1px solid var(--linha,#E4E9F2);border-radius:8px;background:#fff;color:var(--txt,#16233B)}
.vj-cr-lista{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:6px}
.vj-cr-lista li{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--linha,#E4E9F2);border-radius:10px;padding:10px 12px;font-size:14px;background:#fff}
.vj-cr-lista li.vj-cr-outra{border-style:dashed;background:#FBFCFE}
.vj-cr-lista li small{display:block;color:var(--mut,#5A6B85);font-size:12px;margin-top:2px}
.vj-cr-acoes{display:flex;gap:10px}
.vj-cr-acoes button,.vj-cr-link{border:none;background:none;color:var(--azul,#003DA5);cursor:pointer;font:inherit;font-size:13px;padding:0;text-decoration:underline}
.vj-cr-btn{background:var(--azul,#003DA5);color:#fff;border:none;border-radius:8px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.vj-cr-btn:disabled{opacity:.5}
.vj-cr-btn-sec{background:#fff;color:var(--azul,#003DA5);border:1px dashed var(--azul,#003DA5)}
.vj-cr-botoes{display:flex;gap:14px;align-items:center;margin-top:12px}
.vj-cr-aviso{font-size:13px;color:#7A5B00;background:#FFF8E6;border-radius:8px;padding:8px 12px;margin:0 0 10px}
.vj-cr-erro{border:1px solid #F5C2C7;background:#FDECEE;color:#8B1A24;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:13px}
.vj-cr-ok{border:1px solid #BCE3D0;background:#EAF7F0;color:#0F7B4F;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:13px}
@media (max-width:640px){.vj-cr-form{grid-template-columns:1fr}}
`;

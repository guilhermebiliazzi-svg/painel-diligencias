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
type Ajuste = { descricao: string; valor: number | string; tipo: "desconto" | "acrescimo" };
type Despesa = {
  condominio?: number | string;
  extraordinaria?: number | string;
  iptu?: number | string;
  extra_desc?: string;
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
  multa_percentual?: number;
  mora_percentual?: number;
};

/* ---------- helpers ---------- */
const brl = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const num = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// extrai o dia (1..31) de um vencimento que pode vir como ISO ou "YYYY-MM-DD"
const diaDoVencimento = (v?: string): number | null => {
  if (!v) return null;
  const m = String(v).match(/^\d{4}-\d{2}-(\d{2})/);
  return m ? Number(m[1]) : null;
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
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [diaVenc, setDiaVenc] = useState<number | "">("");
  const [multa, setMulta] = useState<number | "">("");
  const [mora, setMora] = useState<number | "">("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [gravado, setGravado] = useState<Previa | null>(null);
  const [revisandoGravada, setRevisandoGravada] = useState(false);
  const [diaVencGravado, setDiaVencGravado] = useState<number | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [msgCancel, setMsgCancel] = useState<string | null>(null);
  const [novoVenc, setNovoVenc] = useState<string>("");
  const [alterandoVenc, setAlterandoVenc] = useState(false);
  const [msgVenc, setMsgVenc] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const contrato = useMemo(
    () => contratos.find((c) => c.id === contratoId) || null,
    [contratos, contratoId]
  );
  const compData = `${competencia}-01`;

  // vencimento padrão segue o dia do contrato; editável por mês.
  // Ao revisar uma cobrança gravada, mantém o dia gravado (não sobrescreve).
  useEffect(() => {
    if (revisandoGravada && diaVencGravado != null) {
      setDiaVenc(diaVencGravado);
    } else {
      setDiaVenc(contrato?.dia_vencimento ?? "");
    }
  }, [contrato, revisandoGravada, diaVencGravado]);

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
    // se veio do "Revisar", tenta abrir com a cobrança já gravada
    if (cid && !Number.isNaN(Number(cid)) && comp) {
      carregarGravada(Number(cid), comp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca uma cobrança já gravada e, se existir, monta a prévia preenchida
  // (mesmo formato de calcular/confirmar) para revisão sem re-subir boleto.
  async function carregarGravada(cid: number, comp: string) {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/adm/cobranca-gravada?contrato=${cid}&competencia=${comp}`);
      const d = await res.json();
      if (!res.ok || !d?.gravada) return; // sem cobrança gravada → fluxo normal (vazio)
      const p: Previa = {
        itens: d.itens || [],
        total: d.total,
        despesa: d.despesa || {},
        cobranca_id: d.cobranca_id,
        vencimento: d.vencimento,
        status: d.status,
        multa_percentual: d.multa_percentual,
        mora_percentual: d.mora_percentual,
      };
      setPrevia(p);
      setDespesa(p.despesa || {});
      setMulta(d.multa_percentual ?? 10);
      setMora(d.mora_percentual ?? 1);
      // vencimento vem como data (ISO ou YYYY-MM-DD) → extrai o dia
      const dia = diaDoVencimento(d.vencimento);
      if (dia) {
        setDiaVencGravado(dia);
        setDiaVenc(dia);
      }
      setRevisandoGravada(true);
    } catch {
      // silencioso: se falhar, a tela apenas segue no fluxo normal
    } finally {
      setCarregando(false);
    }
  }

  // Cancela o boleto emitido no Inter. O backend bloqueia se já estiver pago.
  // Em caso de sucesso, a cobrança volta para 'a_emitir' (reemitível) — recarrega a tela.
  async function cancelarBoleto() {
    const cid = previa?.cobranca_id;
    if (!cid || cancelando) return;
    if (
      !confirm(
        "Cancelar este boleto no Banco Inter?\n\n" +
          "O boleto será cancelado e a cobrança voltará para \"a emitir\", " +
          "mantendo a composição. Você poderá reemitir depois.\n\n" +
          "Boletos já pagos não podem ser cancelados."
      )
    )
      return;
    setCancelando(true);
    setMsgCancel("Consultando o Inter e cancelando o boleto… (pode levar alguns segundos)");
    try {
      const res = await fetch("/api/adm/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobranca_id: cid }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsgCancel(`Erro ao cancelar: ${d?.error || "falha"}.`);
      } else if (d?.ok) {
        setMsgCancel(d?.mensagem || "Boleto cancelado. A cobrança voltou para “a emitir”.");
        // recarrega o estado gravado (agora a_emitir, sem código)
        if (contratoId) await carregarGravada(contratoId, competencia);
      } else {
        // bloqueado (já pago) ou falha controlada
        setMsgCancel(d?.mensagem || "Não foi possível cancelar este boleto.");
      }
    } catch {
      setMsgCancel("Erro de rede ao cancelar. Confira a situação no painel antes de tentar de novo.");
    } finally {
      setCancelando(false);
    }
  }

  // Altera o vencimento do boleto emitido no Inter (mesmo boleto, só a data).
  // Se o Inter aceitar, a nova data é gravada e a tela recarrega.
  async function alterarVencimento() {
    const cid = previa?.cobranca_id;
    if (!cid || alterandoVenc) return;
    if (!novoVenc || !/^\d{4}-\d{2}-\d{2}$/.test(novoVenc)) {
      setMsgVenc("Escolha a nova data de vencimento.");
      return;
    }
    if (
      !confirm(
        `Alterar o vencimento para ${novoVenc.split("-").reverse().join("/")}?\n\n` +
          "O boleto continua o mesmo (mesma linha digitável), só a data muda. " +
          "A alteração é enviada ao Inter e aplica em alguns segundos."
      )
    )
      return;
    setAlterandoVenc(true);
    setMsgVenc("Enviando a alteração ao Inter…");
    try {
      const res = await fetch("/api/adm/alterar-vencimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobranca_id: cid, nova_data: novoVenc }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsgVenc(`Erro: ${d?.error || "falha"}.`);
      } else if (d?.ok) {
        setMsgVenc(d?.mensagem || "Vencimento alterado.");
        setNovoVenc("");
        if (contratoId) await carregarGravada(contratoId, competencia);
      } else {
        setMsgVenc(d?.mensagem || "Não foi possível alterar o vencimento.");
      }
    } catch {
      setMsgVenc("Erro de rede ao alterar o vencimento. Confira no painel antes de tentar de novo.");
    } finally {
      setAlterandoVenc(false);
    }
  }

  function reset() {
    setPrevia(null);
    setGravado(null);
    setErro(null);
    setRevisandoGravada(false);
    setDiaVencGravado(null);
    setNovoVenc("");
    setMsgVenc(null);
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
      setMulta(p.multa_percentual ?? 10);
      setMora(p.mora_percentual ?? 1);
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
      setMulta(p.multa_percentual ?? 10);
      setMora(p.mora_percentual ?? 1);
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
      extra_desc: d.extra_desc,
      multa_percentual: num(multa),
      mora_percentual: num(mora),
      ajustes: ajustes
        .filter((a) => num(a.valor) && num(a.valor)! > 0)
        .map((a) => ({ descricao: a.descricao, valor: num(a.valor), tipo: a.tipo })),
    };
  }

  function addAjuste() {
    setAjustes([...ajustes, { descricao: "", valor: "", tipo: "desconto" }]);
  }
  function setAjuste(i: number, patch: Partial<Ajuste>) {
    setAjustes(ajustes.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function delAjuste(i: number) {
    setAjustes(ajustes.filter((_, idx) => idx !== i));
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
                  setAjustes([]);
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
            {revisandoGravada && (
              <div className="vj-revaviso">
                Revisando a cobrança <b>#{previa.cobranca_id}</b> já gravada
                {previa.status ? <> · situação <b>{previa.status}</b></> : null}. Os valores abaixo
                são os que estão gravados. Recalcular e confirmar de novo <b>substitui</b> esta cobrança.
                {["emitido", "atrasado", "expirado"].includes(String(previa.status)) && (
                  <div className="vj-vencrow">
                    <label className="vj-venclbl2">Novo vencimento</label>
                    <input
                      type="date"
                      className="vj-vencinput"
                      value={novoVenc}
                      onChange={(e) => setNovoVenc(e.target.value)}
                    />
                    <button
                      type="button"
                      className="vj-btn-venc"
                      disabled={alterandoVenc || !novoVenc}
                      onClick={alterarVencimento}
                    >
                      {alterandoVenc ? "Alterando…" : "Alterar vencimento"}
                    </button>
                    <span className="vj-cancelhint">
                      Muda só a data — o boleto continua o mesmo (mesma linha digitável).
                    </span>
                  </div>
                )}
                {msgVenc && <div className="vj-cancelmsg">{msgVenc}</div>}
                {["emitido", "atrasado", "expirado"].includes(String(previa.status)) && (
                  <div className="vj-cancelrow">
                    <button
                      type="button"
                      className="vj-btn-cancelar"
                      disabled={cancelando}
                      onClick={cancelarBoleto}
                    >
                      {cancelando ? "Cancelando…" : "Cancelar boleto no Inter"}
                    </button>
                    <span className="vj-cancelhint">
                      Cancela o boleto e devolve a cobrança para “a emitir” (mantém a composição).
                    </span>
                  </div>
                )}
                {msgCancel && <div className="vj-cancelmsg">{msgCancel}</div>}
              </div>
            )}
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
                  {despesa.extra_desc ? (
                    <div className="vj-extradesc">
                      <b>Não é do inquilino (o Gemini identificou):</b> {despesa.extra_desc}
                      <span className="vj-extrahint">Confira contra o boleto e ajuste o valor acima se algo estiver errado.</span>
                    </div>
                  ) : null}
                  <label className="vj-field">
                    <span>IPTU</span>
                    <input inputMode="decimal" value={despesa.iptu ?? ""} onChange={(e) => setDespesa({ ...despesa, iptu: e.target.value })} />
                  </label>
                </>
              )}

              <div className="vj-ajustes">
                <div className="vj-ajhead">
                  <span>Ajustes (descontos / acréscimos)</span>
                  <button type="button" className="vj-addaj" onClick={addAjuste}>+ adicionar</button>
                </div>
                {ajustes.length === 0 && <p className="vj-ajnote">Nenhum ajuste neste mês.</p>}
                {ajustes.map((a, i) => (
                  <div className="vj-ajcard" key={i}>
                    <div className="vj-ajgrid">
                      <label className="vj-ajfield">
                        <span>Tipo</span>
                        <select
                          value={a.tipo}
                          onChange={(e) => setAjuste(i, { tipo: e.target.value as Ajuste["tipo"] })}
                        >
                          <option value="desconto">Desconto</option>
                          <option value="acrescimo">Acréscimo</option>
                        </select>
                      </label>
                      <label className="vj-ajfield vj-ajfield-val">
                        <span>Valor (R$)</span>
                        <input
                          inputMode="decimal"
                          placeholder="0,00"
                          value={a.valor}
                          onChange={(e) => setAjuste(i, { valor: e.target.value })}
                        />
                      </label>
                      <button type="button" className="vj-ajdel" onClick={() => delAjuste(i)} title="Remover ajuste">×</button>
                    </div>
                    <label className="vj-ajfield">
                      <span>Descrição</span>
                      <input
                        placeholder="ex.: reembolso troca de fechadura"
                        value={a.descricao}
                        onChange={(e) => setAjuste(i, { descricao: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>

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

              <div className="vj-venc-row">
                <label className="vj-field vj-venc">
                  <span>Vencimento (dia)</span>
                  <input
                    inputMode="numeric"
                    value={diaVenc}
                    onChange={(e) => setDiaVenc(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
                <label className="vj-field vj-venc">
                  <span>Multa (%)</span>
                  <input
                    inputMode="decimal"
                    value={multa}
                    onChange={(e) => setMulta(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
                <label className="vj-field vj-venc">
                  <span>Juros ao mês (%)</span>
                  <input
                    inputMode="decimal"
                    value={mora}
                    onChange={(e) => setMora(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
              </div>
              {buildVenc() && (
                <div className="vj-venclbl">
                  Vence em {buildVenc()!.split("-").reverse().join("/")} · após vencimento: multa {multa || 0}% + juros {mora || 0}%/mês
                </div>
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
            <button className="vj-btn vj-ghost" onClick={() => { reset(); setDespesa({}); setAjustes([]); setArquivos([]); }}>
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
.vj-revaviso{grid-column:1 / -1;background:#EAF0FA;border:1px solid #C9D8F5;color:var(--azul);padding:12px 16px;border-radius:11px;font-size:14px;line-height:1.5}
.vj-cancelrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #C9D8F5}
.vj-vencrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #C9D8F5}
.vj-venclbl2{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-vencinput{font:inherit;padding:8px 10px;border:1px solid var(--linha);border-radius:8px;background:#fff;color:var(--txt)}
.vj-vencinput:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-btn-venc{background:var(--azul);border:none;color:#fff;font:inherit;font-weight:600;font-size:14px;padding:9px 16px;border-radius:9px;cursor:pointer;white-space:nowrap}
.vj-btn-venc:hover:not(:disabled){background:var(--azul-esc)}
.vj-btn-venc:disabled{opacity:.5;cursor:not-allowed}
.vj-btn-cancelar{background:#fff;border:1px solid var(--verm);color:var(--verm);font:inherit;font-weight:600;font-size:14px;padding:9px 16px;border-radius:9px;cursor:pointer;white-space:nowrap}
.vj-btn-cancelar:hover:not(:disabled){background:#FDECEE}
.vj-btn-cancelar:disabled{opacity:.5;cursor:not-allowed}
.vj-cancelhint{font-size:12px;color:var(--mut)}
.vj-cancelmsg{margin-top:10px;background:#fff;border:1px solid #C9D8F5;border-radius:9px;padding:9px 12px;font-size:13px;color:var(--txt)}
.vj-h2{font-family:Fraunces,Georgia,serif;font-size:19px;font-weight:600;margin:0 0 4px}
.vj-note{font-size:13px;color:var(--mut);margin:0 0 16px}
.vj-extradesc{background:#FBF3E2;border:1px solid #F0DFB8;border-radius:9px;padding:10px 12px;margin:-6px 0 14px;font-size:13px;color:#6B5410;line-height:1.5}
.vj-extradesc b{color:#5A4300}
.vj-extrahint{display:block;color:var(--mut);margin-top:4px;font-size:12px}
.vj-ajustes{margin:6px 0 16px;border-top:1px solid var(--linha);padding-top:14px}
.vj-ajhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.vj-ajhead>span{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-addaj{background:none;border:1px solid var(--linha);color:var(--azul);font:inherit;font-weight:600;font-size:13px;padding:5px 12px;border-radius:8px;cursor:pointer}
.vj-addaj:hover{background:#F2F7FF}
.vj-ajnote{font-size:13px;color:var(--mut);margin:4px 0}
.vj-ajcard{border:1px solid var(--linha);border-radius:10px;padding:12px;margin-bottom:10px;background:#FAFCFF}
.vj-ajgrid{display:flex;gap:10px;align-items:flex-end;margin-bottom:10px}
.vj-ajfield{display:flex;flex-direction:column;gap:5px;flex:1}
.vj-ajfield>span{font-size:11px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-ajfield select,.vj-ajfield input{font:inherit;padding:9px 10px;border:1px solid var(--linha);border-radius:8px;background:#fff;color:var(--txt);width:100%}
.vj-ajfield select:focus,.vj-ajfield input:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-ajfield-val input{text-align:right;font-variant-numeric:tabular-nums}
.vj-ajdel{background:none;border:none;color:var(--verm);font-size:22px;line-height:1;cursor:pointer;padding:0 2px 6px}
.vj-ajdel:hover{color:#B4131F}
.vj-tab{width:100%;border-collapse:collapse;margin-bottom:8px}
.vj-tab td{padding:11px 0;border-bottom:1px solid var(--linha);font-size:15px}
.vj-tab .vj-val{text-align:right;font-variant-numeric:tabular-nums}
.vj-tab tfoot td{border:0;padding-top:14px;font-weight:700}
.vj-total{text-align:right;font-size:22px;color:var(--azul);font-variant-numeric:tabular-nums}
.vj-venc{margin-top:16px;max-width:160px}
.vj-venc-row{display:flex;gap:12px;flex-wrap:wrap}
.vj-venc-row .vj-venc{max-width:130px}
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

"use client";

import { useEffect, useState } from "react";

// Notas fiscais de comissão (corretagem, código 06297).
//
// Duas origens: o recebimento no Asaas — onde a parte da Ville é o total menos
// os splits, porque quem tem subconta recebe direto e emite a própria nota — e
// a nota avulsa, para recebimentos que não passaram por cobrança.
//
// Uma cobrança pode virar várias notas: a comissão pode ser dividida entre dois
// tomadores (casal, irmãos) em qualquer proporção. A regra é só uma: a soma não
// passa da parte da Ville.

type Nota = {
  id: number;
  status: string;
  tomador_nome: string;
  tomador_doc: string;
  valor_servico: number;
  numero_nota: string | null;
  pdf_url: string | null;
  emissao_erro: string | null;
  origem: string;
  created_at: string;
};

type ParteSugerida = { nome: string; doc: string };

type Sugestao = {
  diligencia_id: string;
  tomador: { nome: string; doc: string; email: string; lado: string } | null;
  operacao: {
    valor_alienacao: number | null;
    endereco_texto: string;
    alienantes: ParteSugerida[];
    adquirentes: ParteSugerida[];
  };
  comissao_total: number | null;
  composicao: { credor: string; valor: number; destino: string }[];
  operacao_id: number | null;
  candidatos: { nome: string; doc: string; lado: string; paga: boolean }[];
};

type Cobranca = {
  asaas_payment_id: string;
  status: string;
  vencimento: string | null;
  link: string | null;
  valor_cobranca: number;
  valor_splits: number;
  valor_sugerido: number;
  diligencia_id: string | null;
  sugestao: Sugestao | null;
  nota: Nota | null;
};

type Parte = { id?: number; nome: string; doc: string; papel?: string };

type Operacao = {
  id: number;
  data_contrato: string | null;
  valor_alienacao: number;
  imovel_tipo_logradouro: string | null;
  imovel_logradouro: string;
  imovel_numero: string | null;
  imovel_complemento: string | null;
  imovel_bairro: string | null;
  alienantes: Parte[];
  adquirentes: Parte[];
};

type Tomador = {
  nome: string;
  doc: string;
  email: string;
  valor: string;
  lado: string;
  // endereço só é exigido para PJ (erros 317/318 da Prefeitura)
  tipoLogradouro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  cidadeIbge: string;
  uf: string;
};

const brl = (v: any) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dig = (v: any) => String(v ?? "").replace(/\D/g, "");

const fmtDoc = (v: any) => {
  const d = dig(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return String(v ?? "");
};

const fmtData = (d: string | null) =>
  d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";

const DESTINO_ROTULO: Record<string, string> = {
  ville: "Ville (fica na cobrança)",
  asaas: "split — subconta Asaas",
  fora_direto: "recebe por fora",
  fora_split_proprio: "recebe por fora",
};

/** aceita "3.412,50", "3412,50" e "3412.50" */
const paraNumero = (v: string) =>
  Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;

const hojeISO = () => new Date().toISOString().slice(0, 10);

const tomadorVazio = (): Tomador => ({
  nome: "",
  doc: "",
  email: "",
  valor: "",
  lado: "",
  tipoLogradouro: "R",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cep: "",
  cidadeIbge: "3550308",
  uf: "SP",
});

function enderecoDe(t: Tomador) {
  if (!t.logradouro.trim()) return null;
  return {
    tipoLogradouro: t.tipoLogradouro.trim(),
    logradouro: t.logradouro.trim(),
    numero: t.numero.trim(),
    complemento: t.complemento.trim(),
    bairro: t.bairro.trim(),
    cep: dig(t.cep),
    cidadeIbge: dig(t.cidadeIbge),
    uf: t.uf.trim().toUpperCase(),
  };
}

function resumoOperacao(o: Operacao) {
  const via = [o.imovel_tipo_logradouro, o.imovel_logradouro].filter(Boolean).join(" ");
  const local = [via, o.imovel_numero].filter(Boolean).join(", ");
  const comp = [o.imovel_complemento, o.imovel_bairro].filter(Boolean).join(" — ");
  return `${local}${comp ? " — " + comp : ""} · ${brl(o.valor_alienacao)} · ${fmtData(o.data_contrato)}`;
}

export default function NotasComissaoPage() {
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [avulsas, setAvulsas] = useState<Nota[]>([]);
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aba, setAba] = useState<"asaas" | "avulsa" | "operacoes">("asaas");

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const [rN, rO] = await Promise.all([
        fetch("/api/adm/notas-comissao", { cache: "no-store" }),
        fetch("/api/adm/operacoes", { cache: "no-store" }),
      ]);
      const dN = await rN.json().catch(() => ({}));
      const dO = await rO.json().catch(() => ({}));
      if (!rN.ok) setErro(dN?.error || "Falha ao carregar os recebimentos.");
      else {
        setCobrancas(dN.cobrancas || []);
        setAvulsas(dN.avulsas || []);
        // se a ficha da diligência não veio, a tela precisa dizer por quê em
        // vez de simplesmente aparecer vazia
        setAviso(dN.sugestao_erro || null);
      }
      if (rO.ok) setOperacoes(dO.operacoes || []);
    } catch {
      setErro("Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const pendentes = cobrancas.filter((c) => !c.nota);

  return (
    <div className="vj-wrap">
      <header className="vj-top">
        <a href="/" className="vj-mark vj-marklink">RE/MAX <span>Ville</span></a>
        <div className="vj-crumb">Administração · Notas de comissão</div>
      </header>

      <main className="vj-main">
        <div className="vj-head">
          <h1 className="vj-h1">Notas fiscais de comissão</h1>
          <p className="vj-sub">
            Serviço 06297 — corretagem. A parte da Ville é o valor recebido menos os splits:
            quem tem subconta no Asaas recebe direto e emite a própria nota. A comissão pode ser
            dividida entre mais de um tomador, desde que a soma feche.
          </p>
        </div>

        <nav className="vj-abas">
          <button className={aba === "asaas" ? "on" : ""} onClick={() => setAba("asaas")}>
            Recebimentos ({pendentes.length} sem nota)
          </button>
          <button className={aba === "avulsa" ? "on" : ""} onClick={() => setAba("avulsa")}>
            Nota avulsa
          </button>
          <button className={aba === "operacoes" ? "on" : ""} onClick={() => setAba("operacoes")}>
            Operações ({operacoes.length})
          </button>
        </nav>

        {erro && <div className="vj-card vj-erro">{erro}</div>}
        {aviso && (
          <div className="vj-card vj-aviso-in">
            Não consegui ler a ficha do negócio para preencher os tomadores: {aviso}
          </div>
        )}
        {carregando && <div className="vj-card vj-vazio">Carregando…</div>}

        {!carregando && aba === "asaas" && (
          <>
            {cobrancas.length === 0 && (
              <div className="vj-card vj-vazio">Nenhum recebimento do Asaas até agora.</div>
            )}
            {cobrancas.map((cb) => (
              <CardCobranca
                key={cb.asaas_payment_id}
                cobranca={cb}
                operacoes={operacoes}
                onEmitiu={carregar}
                onNovaOperacao={(op) => setOperacoes((v) => [op, ...v])}
              />
            ))}
          </>
        )}

        {!carregando && aba === "avulsa" && (
          <>
            <CardAvulsa
              operacoes={operacoes}
              onEmitiu={carregar}
              onNovaOperacao={(op) => setOperacoes((v) => [op, ...v])}
            />
            {avulsas.length > 0 && (
              <section className="vj-card">
                <h2 className="vj-h2">Avulsas já emitidas</h2>
                {avulsas.map((nt) => (
                  <LinhaNota key={nt.id} nota={nt} />
                ))}
              </section>
            )}
          </>
        )}

        {!carregando && aba === "operacoes" && (
          <FormOperacao operacoes={operacoes} onCriou={carregar} />
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* nota já existente                                                    */
/* ------------------------------------------------------------------ */

function LinhaNota({ nota }: { nota: Nota }) {
  const emitida = nota.status === "emitida";
  return (
    <div className={`vj-nota ${emitida ? "ok" : "pend"}`}>
      <div>
        <b>{nota.tomador_nome}</b>
        <span className="vj-sub-id">
          {fmtDoc(nota.tomador_doc)} · {brl(nota.valor_servico)}
          {emitida && nota.numero_nota ? ` · NFS-e nº ${nota.numero_nota}` : ` · ${nota.status}`}
        </span>
        {nota.emissao_erro && <span className="vj-erro-txt">{nota.emissao_erro}</span>}
      </div>
      {nota.pdf_url && (
        <a href={nota.pdf_url} target="_blank" rel="noopener noreferrer" className="vj-nota-link">
          Abrir nota
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* tomadores: nome, doc, valor e endereço quando PJ                     */
/* ------------------------------------------------------------------ */

function CamposTomador({
  t,
  onChange,
  onRemover,
  podeRemover,
  candidatos,
  disponivel,
  indice,
}: {
  t: Tomador;
  onChange: (t: Tomador) => void;
  onRemover: () => void;
  podeRemover: boolean;
  candidatos: { nome: string; doc: string; lado: string; paga: boolean }[];
  disponivel: number | null;
  indice: number;
}) {
  const set = (campo: keyof Tomador, valor: string) => onChange({ ...t, [campo]: valor });
  const ehPJ = dig(t.doc).length === 14;

  const valorNum = paraNumero(t.valor);
  const pct = disponivel && disponivel > 0 ? (valorNum / disponivel) * 100 : 0;

  // Digitar o % é o jeito natural de dividir uma comissão; o valor sai daí.
  function aplicarPct(txt: string) {
    const p = paraNumero(txt);
    if (disponivel == null || disponivel <= 0) return;
    const v = Math.round(disponivel * (p / 100) * 100) / 100;
    onChange({ ...t, valor: String(v).replace(".", ",") });
  }

  const escolhido = candidatos.find((c) => dig(c.doc) === dig(t.doc));

  return (
    <div className="vj-tomador">
      <div className="vj-tomador-cab">
        <span className="vj-tag">Tomador {indice + 1}</span>
        {podeRemover && (
          <button className="vj-link vj-del-link" onClick={onRemover} type="button">
            remover
          </button>
        )}
      </div>

      {candidatos.length > 0 && (
        <label className="vj-f">
          <span>Quem recebe a nota</span>
          <select
            value={escolhido ? dig(escolhido.doc) : "__manual"}
            onChange={(e) => {
              const c = candidatos.find((x) => dig(x.doc) === e.target.value);
              if (!c) onChange({ ...t, nome: "", doc: "", lado: "" });
              else onChange({ ...t, nome: c.nome, doc: c.doc, lado: c.lado });
            }}
          >
            {candidatos.map((c) => (
              <option key={c.doc} value={dig(c.doc)}>
                {c.nome} — {c.lado}
                {c.paga ? " (paga a comissão)" : ""}
              </option>
            ))}
            <option value="__manual">— outro: digitar à mão —</option>
          </select>
        </label>
      )}

      <div className="vj-frow">
        <label className="vj-f">
          <span>Nome / razão social</span>
          <input value={t.nome} onChange={(e) => set("nome", e.target.value)} />
        </label>
        <label className="vj-f">
          <span>CPF/CNPJ</span>
          <input value={t.doc} onChange={(e) => set("doc", e.target.value)} inputMode="numeric" />
        </label>
      </div>
      <div className="vj-frow">
        <label className="vj-f">
          <span>E-mail (opcional)</span>
          <input value={t.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        {disponivel != null && (
          <label className="vj-f" style={{ maxWidth: 130 }}>
            <span>% da comissão</span>
            <input
              value={pct ? pct.toFixed(2).replace(".", ",") : ""}
              onChange={(e) => aplicarPct(e.target.value)}
              inputMode="decimal"
              placeholder="100"
            />
          </label>
        )}
        <label className="vj-f" style={{ maxWidth: 180 }}>
          <span>Valor da nota</span>
          <input
            value={t.valor}
            onChange={(e) => set("valor", e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
        </label>
      </div>

      {ehPJ && (
        <>
          <div className="vj-aviso-in">Tomador PJ: a Prefeitura exige o endereço no RPS.</div>
          <div className="vj-frow">
            <label className="vj-f" style={{ maxWidth: 90 }}>
              <span>Tipo</span>
              <input value={t.tipoLogradouro} onChange={(e) => set("tipoLogradouro", e.target.value)} />
            </label>
            <label className="vj-f">
              <span>Logradouro</span>
              <input value={t.logradouro} onChange={(e) => set("logradouro", e.target.value)} />
            </label>
            <label className="vj-f" style={{ maxWidth: 110 }}>
              <span>Número</span>
              <input value={t.numero} onChange={(e) => set("numero", e.target.value)} />
            </label>
          </div>
          <div className="vj-frow">
            <label className="vj-f">
              <span>Complemento</span>
              <input value={t.complemento} onChange={(e) => set("complemento", e.target.value)} />
            </label>
            <label className="vj-f">
              <span>Bairro</span>
              <input value={t.bairro} onChange={(e) => set("bairro", e.target.value)} />
            </label>
          </div>
          <div className="vj-frow">
            <label className="vj-f">
              <span>CEP</span>
              <input value={t.cep} onChange={(e) => set("cep", e.target.value)} inputMode="numeric" />
            </label>
            <label className="vj-f">
              <span>Cidade (IBGE)</span>
              <input value={t.cidadeIbge} onChange={(e) => set("cidadeIbge", e.target.value)} inputMode="numeric" />
            </label>
            <label className="vj-f" style={{ maxWidth: 80 }}>
              <span>UF</span>
              <input value={t.uf} onChange={(e) => set("uf", e.target.value)} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* emissão a partir de um recebimento do Asaas                          */
/* ------------------------------------------------------------------ */

function CardCobranca({
  cobranca,
  operacoes,
  onEmitiu,
  onNovaOperacao,
}: {
  cobranca: Cobranca;
  operacoes: Operacao[];
  onEmitiu: () => void;
  onNovaOperacao: (op: Operacao) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const comp = cobranca.sugestao?.composicao || [];
  return (
    <section className="vj-card">
      <div className="vj-boleto-cab">
        <div>
          <span className="vj-tag">{cobranca.status}</span>
          <b className="vj-endereco">{brl(cobranca.valor_sugerido)} — parte da Ville</b>
          <span className="vj-sub-id">
            Cobrança {brl(cobranca.valor_cobranca)} · splits {brl(cobranca.valor_splits)} ·
            vencimento {fmtData(cobranca.vencimento)}
          </span>
          <span className="vj-sub-id">{cobranca.asaas_payment_id}</span>
        </div>
        <div>
          {cobranca.nota ? (
            <span className="vj-badge efet">nota emitida</span>
          ) : (
            <button className="vj-btn vj-primary" onClick={() => setAberto((v) => !v)}>
              {aberto ? "Fechar" : "Emitir nota"}
            </button>
          )}
        </div>
      </div>

      {comp.length > 0 && (
        <details className="vj-comp">
          <summary>De onde sai a parte da Ville</summary>
          <table>
            <tbody>
              {comp.map((c, i) => (
                <tr key={i} className={c.destino === "ville" ? "ville" : ""}>
                  <td>{c.credor || "—"}</td>
                  <td>{DESTINO_ROTULO[c.destino] || c.destino || "—"}</td>
                  <td className="num">{brl(c.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="vj-comp-nota">
            A Ville nunca entra no split do Asaas: ela recebe o que sobra da cobrança.
            Quem está marcado &quot;recebe por fora&quot; não entra nesta cobrança nem
            nesta nota.
          </p>
        </details>
      )}

      {cobranca.nota && <LinhaNota nota={cobranca.nota} />}

      {aberto && (
        <FormEmissao
          origem="asaas"
          asaasPaymentId={cobranca.asaas_payment_id}
          disponivel={cobranca.valor_sugerido}
          operacoes={operacoes}
          sugestao={cobranca.sugestao}
          onEmitiu={onEmitiu}
          onNovaOperacao={onNovaOperacao}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* nota avulsa                                                          */
/* ------------------------------------------------------------------ */

function CardAvulsa({
  operacoes,
  onEmitiu,
  onNovaOperacao,
}: {
  operacoes: Operacao[];
  onEmitiu: () => void;
  onNovaOperacao: (op: Operacao) => void;
}) {
  return (
    <section className="vj-card">
      <h2 className="vj-h2">Nova nota avulsa</h2>
      <p className="vj-sub">
        Para recebimentos que não passaram por cobrança do Asaas. Sem teto de valor — a
        conferência é sua.
      </p>
      <FormEmissao
        origem="avulsa"
        disponivel={null}
        operacoes={operacoes}
        sugestao={null}
        onEmitiu={onEmitiu}
        onNovaOperacao={onNovaOperacao}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* o formulário de emissão, comum às duas origens                       */
/* ------------------------------------------------------------------ */

function FormEmissao({
  origem,
  asaasPaymentId,
  disponivel,
  operacoes,
  sugestao,
  onEmitiu,
  onNovaOperacao,
}: {
  origem: "asaas" | "avulsa";
  asaasPaymentId?: string;
  disponivel: number | null;
  operacoes: Operacao[];
  sugestao: Sugestao | null;
  onEmitiu: () => void;
  onNovaOperacao: (op: Operacao) => void;
}) {
  const [operacaoId, setOperacaoId] = useState(
    sugestao?.operacao_id ? String(sugestao.operacao_id) : ""
  );
  const [discriminacao, setDiscriminacao] = useState("");
  const [codigo, setCodigo] = useState("06297");
  // o tomador é o pagador da comissão, que a ficha do negócio já conhece
  const [tomadores, setTomadores] = useState<Tomador[]>([
    sugestao?.tomador
      ? {
          ...tomadorVazio(),
          nome: sugestao.tomador.nome,
          doc: sugestao.tomador.doc,
          email: sugestao.tomador.email || "",
          lado: sugestao.tomador.lado || "",
        }
      : tomadorVazio(),
  ]);
  const [enviando, setEnviando] = useState(false);
  const [criandoOp, setCriandoOp] = useState(false);
  const [msgs, setMsgs] = useState<{ tipo: "ok" | "erro"; texto: string }[]>([]);

  // Cria a operação com o que já está na diligência: endereço, preço e as duas
  // pontas. O endereço vem como uma linha só; dá para ajustar depois na aba
  // Operações se a nota exigir número e bairro separados.
  async function criarOperacaoDaDiligencia() {
    if (!sugestao) return;
    setMsgs([]);
    setCriandoOp(true);
    try {
      const r = await fetch("/api/adm/operacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diligencia_id: sugestao.diligencia_id,
          data_contrato: hojeISO(),
          valor_alienacao: sugestao.operacao.valor_alienacao,
          imovel_tipo_logradouro: "",
          imovel_logradouro: sugestao.operacao.endereco_texto,
          imovel_cidade_ibge: "3550308",
          imovel_uf: "SP",
          alienantes: sugestao.operacao.alienantes,
          adquirentes: sugestao.operacao.adquirentes,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.operacao) {
        setMsgs([{ tipo: "erro", texto: d?.error || "Falha ao criar a operação." }]);
      } else {
        onNovaOperacao(d.operacao);
        setOperacaoId(String(d.operacao.id));
        setMsgs([
          {
            tipo: "ok",
            texto: "Operação criada a partir da diligência. Confira o endereço na aba Operações.",
          },
        ]);
      }
    } catch {
      setMsgs([{ tipo: "erro", texto: "Erro de rede ao criar a operação." }]);
    } finally {
      setCriandoOp(false);
    }
  }

  const op = operacoes.find((o) => String(o.id) === operacaoId) || null;
  // Quem pode receber a nota: as pessoas do negócio. Preferimos a ficha da
  // diligência; se ela não veio, caímos nas partes da operação escolhida.
  const candidatos =
    sugestao?.candidatos?.length
      ? sugestao.candidatos
      : op
        ? [
            ...(op.adquirentes || []).map((p) => ({
              nome: p.nome,
              doc: p.doc,
              lado: "comprador",
              paga: false,
            })),
            ...(op.alienantes || []).map((p) => ({
              nome: p.nome,
              doc: p.doc,
              lado: "vendedor",
              paga: false,
            })),
          ]
        : [];

  const num = paraNumero;
  const soma = tomadores.reduce((a, t) => a + num(t.valor), 0);
  const sobra = disponivel == null ? null : Math.round((disponivel - soma) * 100) / 100;

  // quando há um único tomador e um teto conhecido, o valor cheio é o palpite certo
  useEffect(() => {
    if (disponivel != null && tomadores.length === 1 && !tomadores[0].valor) {
      setTomadores((ts) => [{ ...ts[0], valor: String(disponivel).replace(".", ",") }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function emitir() {
    setMsgs([]);
    const validos = tomadores.filter((t) => t.nome.trim() && dig(t.doc) && num(t.valor) > 0);
    if (!validos.length) {
      setMsgs([{ tipo: "erro", texto: "Preencha nome, documento e valor de ao menos um tomador." }]);
      return;
    }
    if (!operacaoId && !discriminacao.trim()) {
      setMsgs([
        { tipo: "erro", texto: "Escolha a operação imobiliária ou escreva a discriminação." },
      ]);
      return;
    }
    if (sobra != null && sobra < -0.01) {
      setMsgs([
        { tipo: "erro", texto: `A soma passa do disponível em ${brl(Math.abs(sobra))}.` },
      ]);
      return;
    }

    setEnviando(true);
    const resultados: { tipo: "ok" | "erro"; texto: string }[] = [];
    // uma nota por vez: o RPS é sequencial e o erro de uma não pode
    // atropelar a próxima
    for (const t of validos) {
      try {
        const r = await fetch("/api/adm/notas-comissao/emitir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origem,
            asaas_payment_id: asaasPaymentId,
            operacao_id: operacaoId ? Number(operacaoId) : null,
            codigo_servico: codigo.trim() || undefined,
            discriminacao: discriminacao.trim() || undefined,
            valor_servico: num(t.valor),
            tomador: {
              nome: t.nome.trim(),
              doc: dig(t.doc),
              email: t.email.trim() || undefined,
              lado: t.lado || undefined,
              endereco: enderecoDe(t),
            },
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok) {
          resultados.push({
            tipo: "ok",
            texto: `${t.nome}: NFS-e nº ${d.numeroNota} emitida (${brl(num(t.valor))}).`,
          });
        } else {
          resultados.push({
            tipo: "erro",
            texto: `${t.nome}: ${d.erro || d.error || "falha na emissão"}`,
          });
        }
      } catch {
        resultados.push({ tipo: "erro", texto: `${t.nome}: erro de rede.` });
      }
    }
    setMsgs(resultados);
    setEnviando(false);
    if (resultados.some((m) => m.tipo === "ok")) onEmitiu();
  }

  return (
    <div className="vj-form">
      <label className="vj-f">
        <span>Operação imobiliária (monta a discriminação)</span>
        <select value={operacaoId} onChange={(e) => setOperacaoId(e.target.value)}>
          <option value="">— sem operação (escrever a discriminação à mão) —</option>
          {operacoes.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {resumoOperacao(o)}
            </option>
          ))}
        </select>
      </label>

      {!operacaoId && sugestao && sugestao.operacao.alienantes.length > 0 && (
        <button
          type="button"
          className="vj-add-btn"
          onClick={criarOperacaoDaDiligencia}
          disabled={criandoOp}
        >
          {criandoOp ? "Criando…" : "＋ Criar a operação com os dados da diligência"}
        </button>
      )}

      {!operacaoId && (
        <label className="vj-f">
          <span>Discriminação</span>
          <textarea
            rows={4}
            value={discriminacao}
            onChange={(e) => setDiscriminacao(e.target.value)}
            placeholder="Comissão pela intermediação na venda do imóvel situado à…"
          />
        </label>
      )}

      {tomadores.map((t, i) => (
        <CamposTomador
          key={i}
          t={t}
          indice={i}
          candidatos={candidatos}
          disponivel={disponivel}
          podeRemover={tomadores.length > 1}
          onChange={(nt) => setTomadores((ts) => ts.map((x, j) => (j === i ? nt : x)))}
          onRemover={() => setTomadores((ts) => ts.filter((_, j) => j !== i))}
        />
      ))}

      <button
        type="button"
        className="vj-add-btn"
        onClick={() =>
          setTomadores((ts) => {
            const falta =
              disponivel == null
                ? 0
                : Math.round(
                    (disponivel - ts.reduce((a, x) => a + paraNumero(x.valor), 0)) * 100
                  ) / 100;
            return [
              ...ts,
              { ...tomadorVazio(), valor: falta > 0 ? String(falta).replace(".", ",") : "" },
            ];
          })
        }
      >
        ＋ Dividir com outro tomador
      </button>

      <div className="vj-frow">
        <label className="vj-f" style={{ maxWidth: 160 }}>
          <span>Código do serviço</span>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" />
        </label>
        <div className="vj-f">
          <span>Soma</span>
          <div className={`vj-soma ${sobra != null && sobra < -0.01 ? "ruim" : ""}`}>
            {brl(soma)}
            {disponivel != null && (
              <em>
                {" "}
                de {brl(disponivel)} · {sobra! >= 0 ? "resta " : "excede "}
                {brl(Math.abs(sobra!))}
              </em>
            )}
          </div>
        </div>
      </div>

      {msgs.map((m, i) => (
        <div key={i} className={m.tipo === "ok" ? "vj-ok-in" : "vj-erro-in"}>
          {m.texto}
        </div>
      ))}

      <button className="vj-btn vj-gerar" onClick={emitir} disabled={enviando}>
        {enviando ? "Emitindo…" : `Emitir ${tomadores.length > 1 ? `${tomadores.length} notas` : "nota"}`}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* cadastro da operação imobiliária (também alimenta a DIMOB)           */
/* ------------------------------------------------------------------ */

function FormOperacao({ operacoes, onCriou }: { operacoes: Operacao[]; onCriou: () => void }) {
  const [dataContrato, setDataContrato] = useState("");
  const [valor, setValor] = useState("");
  const [tipoLog, setTipoLog] = useState("R");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cep, setCep] = useState("");
  const [cidadeIbge, setCidadeIbge] = useState("3550308");
  const [uf, setUf] = useState("SP");
  const [matricula, setMatricula] = useState("");
  const [alienantes, setAlienantes] = useState<Parte[]>([{ nome: "", doc: "" }]);
  const [adquirentes, setAdquirentes] = useState<Parte[]>([{ nome: "", doc: "" }]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function salvar() {
    setMsg(null);
    setSalvando(true);
    try {
      const r = await fetch("/api/adm/operacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_contrato: dataContrato,
          valor_alienacao: Number(String(valor).replace(/\./g, "").replace(",", ".")) || 0,
          imovel_tipo_logradouro: tipoLog,
          imovel_logradouro: logradouro,
          imovel_numero: numero,
          imovel_complemento: complemento,
          imovel_bairro: bairro,
          imovel_cep: cep,
          imovel_cidade_ibge: cidadeIbge,
          imovel_uf: uf,
          imovel_matricula: matricula,
          alienantes: alienantes.filter((p) => p.nome.trim() && dig(p.doc)),
          adquirentes: adquirentes.filter((p) => p.nome.trim() && dig(p.doc)),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ tipo: "erro", texto: d?.error || "Falha ao gravar a operação." });
      } else {
        setMsg({ tipo: "ok", texto: "Operação cadastrada. Já aparece na lista de emissão." });
        setLogradouro("");
        setNumero("");
        setComplemento("");
        setValor("");
        setMatricula("");
        setAlienantes([{ nome: "", doc: "" }]);
        setAdquirentes([{ nome: "", doc: "" }]);
        onCriou();
      }
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede." });
    } finally {
      setSalvando(false);
    }
  }

  const linhasParte = (
    lista: Parte[],
    setLista: (p: Parte[]) => void,
    rotulo: string
  ) => (
    <div className="vj-partes">
      <div className="vj-add-h">{rotulo}</div>
      {lista.map((p, i) => (
        <div className="vj-frow" key={i}>
          <label className="vj-f">
            <span>Nome</span>
            <input
              value={p.nome}
              onChange={(e) =>
                setLista(lista.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))
              }
            />
          </label>
          <label className="vj-f">
            <span>CPF/CNPJ</span>
            <input
              value={p.doc}
              inputMode="numeric"
              onChange={(e) =>
                setLista(lista.map((x, j) => (j === i ? { ...x, doc: e.target.value } : x)))
              }
            />
          </label>
          {lista.length > 1 && (
            <button
              type="button"
              className="vj-link vj-del-link"
              onClick={() => setLista(lista.filter((_, j) => j !== i))}
            >
              remover
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="vj-link"
        onClick={() => setLista([...lista, { nome: "", doc: "" }])}
      >
        ＋ adicionar
      </button>
    </div>
  );

  return (
    <>
      <section className="vj-card">
        <h2 className="vj-h2">Nova operação imobiliária</h2>
        <p className="vj-sub">
          É o que a DIMOB declara e o que a discriminação da nota cita: valor da venda, endereço do
          imóvel e a parte oposta à do tomador.
        </p>

        <div className="vj-form">
          <div className="vj-frow">
            <label className="vj-f">
              <span>Data do contrato</span>
              <input type="date" value={dataContrato} onChange={(e) => setDataContrato(e.target.value)} />
            </label>
            <label className="vj-f">
              <span>Valor da venda</span>
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </label>
            <label className="vj-f">
              <span>Matrícula (opcional)</span>
              <input value={matricula} onChange={(e) => setMatricula(e.target.value)} />
            </label>
          </div>

          <div className="vj-frow">
            <label className="vj-f" style={{ maxWidth: 90 }}>
              <span>Tipo</span>
              <input value={tipoLog} onChange={(e) => setTipoLog(e.target.value)} />
            </label>
            <label className="vj-f">
              <span>Logradouro do imóvel</span>
              <input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} />
            </label>
            <label className="vj-f" style={{ maxWidth: 110 }}>
              <span>Número</span>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </label>
          </div>

          <div className="vj-frow">
            <label className="vj-f">
              <span>Complemento</span>
              <input value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Apto 103" />
            </label>
            <label className="vj-f">
              <span>Bairro</span>
              <input value={bairro} onChange={(e) => setBairro(e.target.value)} />
            </label>
            <label className="vj-f">
              <span>CEP</span>
              <input value={cep} onChange={(e) => setCep(e.target.value)} inputMode="numeric" />
            </label>
          </div>

          <div className="vj-frow">
            <label className="vj-f">
              <span>Cidade (IBGE)</span>
              <input value={cidadeIbge} onChange={(e) => setCidadeIbge(e.target.value)} inputMode="numeric" />
            </label>
            <label className="vj-f" style={{ maxWidth: 80 }}>
              <span>UF</span>
              <input value={uf} onChange={(e) => setUf(e.target.value)} />
            </label>
          </div>

          {linhasParte(alienantes, setAlienantes, "Vendedores (alienantes)")}
          {linhasParte(adquirentes, setAdquirentes, "Compradores (adquirentes)")}

          {msg && <div className={msg.tipo === "ok" ? "vj-ok-in" : "vj-erro-in"}>{msg.texto}</div>}

          <button className="vj-btn vj-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Gravando…" : "Cadastrar operação"}
          </button>
        </div>
      </section>

      {operacoes.length > 0 && (
        <section className="vj-card">
          <h2 className="vj-h2">Operações cadastradas</h2>
          {operacoes.map((o) => (
            <div className="vj-nota" key={o.id}>
              <div>
                <b>{resumoOperacao(o)}</b>
                <span className="vj-sub-id">
                  Vende: {(o.alienantes || []).map((p) => p.nome).join(", ") || "—"} · Compra:{" "}
                  {(o.adquirentes || []).map((p) => p.nome).join(", ") || "—"}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

const CSS = `
.vj-wrap{--azul:#003DA5;--verm:#DC1C2E;--bg:#F4F6FA;--card:#fff;--linha:#E4E9F2;--txt:#16233B;--mut:#5A6B85;min-height:100vh;background:var(--bg);color:var(--txt);font-family:Inter,system-ui,sans-serif}
.vj-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 28px;background:var(--azul);color:#fff}
.vj-mark{font-weight:800;color:#fff;text-decoration:none}.vj-mark span{color:#BFD3FF;font-weight:600}
.vj-crumb{font-size:14px;opacity:.9}
.vj-main{max-width:880px;margin:0 auto;padding:24px 20px 60px}
.vj-head{margin-bottom:16px}
.vj-h1{font-size:28px;margin:0}
.vj-h2{font-size:17px;margin:0 0 6px}
.vj-sub{color:var(--mut);margin:4px 0 0;line-height:1.5;max-width:70ch}
.vj-card{background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:18px;margin-bottom:14px}
.vj-abas{display:flex;gap:8px;margin:16px 0 14px;flex-wrap:wrap}
.vj-abas button{font:inherit;font-weight:600;font-size:13px;padding:9px 16px;border-radius:999px;border:1px solid var(--linha);background:#fff;color:var(--mut);cursor:pointer}
.vj-abas button.on{background:var(--azul);color:#fff;border-color:var(--azul)}
.vj-field{display:flex;flex-direction:column;gap:6px}
.vj-btn{font:inherit;font-weight:600;padding:11px 22px;border-radius:9px;cursor:pointer;border:none}
.vj-primary{background:var(--azul);color:#fff}
.vj-gerar{background:var(--verm);color:#fff;width:100%}
.vj-btn:disabled{opacity:.5;cursor:not-allowed}
.vj-erro{border-color:#F5C2C7;background:#FDECEE;color:#8B1A24}
.vj-vazio{color:var(--mut);text-align:center}
.vj-boleto-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.vj-tag{display:inline-block;background:#EEF2FB;color:var(--azul);font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px}
.vj-endereco{display:block;font-size:16px}
.vj-sub-id{display:block;font-size:12px;color:var(--mut);margin-top:3px}
.vj-erro-txt{display:block;font-size:12px;color:#8B1A24;margin-top:3px}
.vj-form{display:flex;flex-direction:column;gap:12px;margin-top:12px}
.vj-f{display:flex;flex-direction:column;gap:6px;flex:1;min-width:150px}
.vj-f>span{font-size:12px;font-weight:600;color:var(--mut)}
.vj-f input,.vj-f select,.vj-f textarea{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff;width:100%;box-sizing:border-box}
.vj-f textarea{resize:vertical;line-height:1.5}
.vj-frow{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
.vj-erro-in{background:#FDECEE;border:1px solid #F5C2C7;color:#8B1A24;padding:8px 11px;border-radius:8px;font-size:13px}
.vj-aviso-in{background:#FFF7E6;border:1px solid #FADFA0;color:#8a6d00;padding:8px 11px;border-radius:8px;font-size:13px;font-weight:600}
.vj-ok-in{background:#EAF7F0;border:1px solid #BCE3D0;color:#0F7B4F;padding:8px 11px;border-radius:8px;font-size:13px}
.vj-badge{margin:0;font-weight:700;font-size:14px}
.vj-badge.efet{color:#0F7B4F}
.vj-tomador{border:1px solid var(--linha);border-radius:11px;padding:14px;background:#F8FAFD;display:flex;flex-direction:column;gap:10px}
.vj-tomador-cab{display:flex;justify-content:space-between;align-items:center}
.vj-partes{border-top:1px solid var(--linha);padding-top:12px;display:flex;flex-direction:column;gap:10px}
.vj-add-h{font-size:13px;font-weight:700;color:var(--azul)}
.vj-add-btn{background:none;border:1px dashed var(--azul);color:var(--azul);font:inherit;font-weight:600;padding:9px 14px;border-radius:9px;cursor:pointer;width:100%}
.vj-link{align-self:flex-start;background:none;border:none;color:var(--azul);font:inherit;font-weight:600;font-size:13px;cursor:pointer;padding:0;text-decoration:underline}
.vj-del-link{color:var(--verm)}
.vj-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.vj-chips-h{font-size:12px;color:var(--mut);font-weight:600}
.vj-chip{font:inherit;font-size:12px;background:#EEF2FB;border:1px solid #D6E0F5;color:var(--azul);border-radius:999px;padding:4px 10px;cursor:pointer}
.vj-chip i{opacity:.7;font-style:normal}
.vj-soma{font-weight:700;padding:9px 0}
.vj-soma em{font-weight:500;font-style:normal;color:var(--mut);font-size:13px}
.vj-soma.ruim{color:#8B1A24}
.vj-nota{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--linha);border-radius:11px;padding:12px 14px;margin-top:10px;background:#F8FAFD}
.vj-nota.ok{border-color:#BCE3D0;background:#F3FAF6}
.vj-nota-link{color:var(--azul);font-weight:600;font-size:13px;text-decoration:none;white-space:nowrap}
.vj-comp{border:1px solid var(--linha);border-radius:11px;padding:10px 14px;background:#F8FAFD;margin-top:6px}
.vj-comp summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--azul)}
.vj-comp table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
.vj-comp td{padding:5px 6px;border-top:1px solid var(--linha)}
.vj-comp td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.vj-comp tr.ville td{font-weight:700;color:var(--azul)}
.vj-comp-nota{font-size:12px;color:var(--mut);margin:8px 0 0;line-height:1.5}
@media (max-width:640px){.vj-frow{flex-direction:column;align-items:stretch}}
`;

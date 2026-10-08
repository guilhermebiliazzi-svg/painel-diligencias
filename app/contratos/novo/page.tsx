"use client";

// Cadastro de contrato de locação: locador → imóvel → locatário → contrato → documentos.
// Locador/imóvel/locatário podem ser escolhidos da base ou cadastrados aqui mesmo.

import { useEffect, useMemo, useRef, useState } from "react";
import DocumentosContrato, { type DocumentosContratoHandle } from "@/app/_components/DocumentosContrato";
import { FormConta, contaVazia, resumoConta, type ContaForm } from "@/app/_components/ContaRepasse";
import { normalizarConta } from "@/lib/bancos";
import { normalizarCobrancaSeguro } from "@/lib/contrato-documentos";

type Pessoa = { id: number; nome: string; cpf_cnpj: string | null };
type Imovel = {
  id: number;
  locador_id: number;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  contrato_ativo: number | null;
};

const GARANTIAS = [
  { v: "fiador", t: "Fiador" },
  { v: "caucao", t: "Caução" },
  { v: "seguro_fianca", t: "Seguro-fiança" },
  { v: "capitalizacao", t: "Capitalização" },
  { v: "fianca_remax_ville", t: "Fiança REMAX Ville" },
  { v: "fianca_bancaria", t: "Fiança bancária" },
];
const TIPO_USO = [
  { v: "residencial", t: "Residencial" },
  { v: "comercial", t: "Comercial" },
];
const RESPONSAVEL = [
  { v: "imobiliaria", t: "Imobiliária" },
  { v: "locador", t: "Locador" },
  { v: "locatario", t: "Locatário" },
];
const INDICES = ["IPCA", "IGPM", "INPC", "IGP-M"];
const TIPOS_IMOVEL = ["Apartamento", "Casa de Rua", "Casa em Condomínio", "Sala Comercial", "Loja", "Galpão", "Outro"];
const GARANTIA_COM_VALIDADE = new Set(["seguro_fianca", "capitalizacao", "fianca_bancaria"]);

const NOVO = "__novo__";
const vazioPessoa = { nome: "", cpf_cnpj: "", email: "", telefone: "" };
const vazioImovel = {
  rua: "", numero: "", complemento: "", bairro: "", cep: "", cidade: "São Paulo", estado: "SP",
  tipo_imovel: "Apartamento", nro_contribuinte: "", administradora: "", dia_venc_condominio: "", dia_venc_iptu: "",
};

const endImovel = (i: Imovel) =>
  `${i.rua || ""}, ${i.numero || ""}${i.complemento ? " " + i.complemento : ""}${i.bairro ? " — " + i.bairro : ""}`;

export default function NovoContrato() {
  const [listas, setListas] = useState<{ locadores: Pessoa[]; locatarios: Pessoa[]; imoveis: Imovel[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);

  const [locadorSel, setLocadorSel] = useState<string>("");
  const [locadorNovo, setLocadorNovo] = useState({ ...vazioPessoa });
  const [imovelSel, setImovelSel] = useState<string>("");
  const [imovelNovo, setImovelNovo] = useState({ ...vazioImovel });
  const [locatarioSel, setLocatarioSel] = useState<string>("");
  const [locatarioNovo, setLocatarioNovo] = useState({ ...vazioPessoa });

  const [c, setC] = useState<Record<string, any>>({
    tipo_uso: "residencial",
    indice_reajuste: "IPCA",
    periodo_reajuste_meses: 12,
    prazo_meses: 30,
    prazo_indeterminado: false,
    multa_percentual: 10,
    mora_percentual: 1,
    taxa_administracao: "",
    iptu_responsavel: "locatario",
    condominio_responsavel: "locatario",
    status: "ativo",
  });
  const set = (k: string, v: any) => setC((p) => ({ ...p, [k]: v }));

  const docsRef = useRef<DocumentosContratoHandle>(null);

  // seguro residencial do inquilino
  const [seg, setSeg] = useState({
    tem: false,
    seguradora: "",
    numero_apolice: "",
    vigencia_inicio: "",
    vigencia_fim: "",
    premio: "",
    cobrar_no_boleto: true,
    valor_mensal: "",
    parcelas_total: "12",
    cobranca_inicio: "",
  });
  const mesPrimeiroAluguel = String(c.data_primeiro_aluguel || c.data_inicio || "").slice(0, 7);

  // conta de repasse do locador
  const [contaModo, setContaModo] = useState<string>("nova"); // "nova" | "depois" | id de conta existente
  const [contaForm, setContaForm] = useState<ContaForm>(contaVazia());
  const [contaAuto, setContaAuto] = useState(true); // titular/CPF ainda seguem o locador
  const [contasLocador, setContasLocador] = useState<(ContaForm & { id: number })[]>([]);

  // contas já cadastradas do locador escolhido (para reaproveitar)
  useEffect(() => {
    setContasLocador([]);
    if (!locadorSel || locadorSel === NOVO) {
      setContaModo((m) => (m === "nova" || m === "depois" ? m : "nova"));
      return;
    }
    let vivo = true;
    fetch(`/api/adm/contas-bancarias?locador=${locadorSel}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        const lista = (d?.contas || []) as (ContaForm & { id: number })[];
        setContasLocador(lista);
        setContaModo(lista.length ? String(lista[lista.length - 1].id) : "nova");
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [locadorSel]);

  // titular/CPF da conta nova acompanham o locador até a pessoa mexer neles
  useEffect(() => {
    if (!contaAuto) return;
    const lo =
      locadorSel === NOVO
        ? { nome: locadorNovo.nome, cpf: locadorNovo.cpf_cnpj }
        : (() => {
            const p = listas?.locadores.find((x) => String(x.id) === locadorSel);
            return { nome: p?.nome || "", cpf: p?.cpf_cnpj || "" };
          })();
    setContaForm((f) => ({ ...f, titular: lo.nome, cpf_cnpj: lo.cpf }));
  }, [contaAuto, locadorSel, locadorNovo.nome, locadorNovo.cpf_cnpj, listas]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/adm/contrato?listas=1", { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) setErro(d?.error || "Falha ao carregar cadastros.");
        else setListas(d);
      } catch {
        setErro("Erro de rede.");
      }
    })();
  }, []);

  // imóveis do locador escolhido (ou todos, se locador ainda não escolhido)
  const imoveisFiltrados = useMemo(() => {
    const todos = listas?.imoveis || [];
    if (locadorSel && locadorSel !== NOVO) return todos.filter((i) => String(i.locador_id) === locadorSel);
    return todos;
  }, [listas, locadorSel]);

  const imovelEscolhido = listas?.imoveis.find((i) => String(i.id) === imovelSel) || null;

  // escolher imóvel existente define o locador
  function escolherImovel(v: string) {
    setImovelSel(v);
    const im = listas?.imoveis.find((i) => String(i.id) === v);
    if (im) setLocadorSel(String(im.locador_id));
  }

  async function criar() {
    if (salvando) return;
    setErro(null);

    const imovel = imovelSel && imovelSel !== NOVO ? { id: Number(imovelSel) } : { novo: imovelNovo };
    const locador = locadorSel && locadorSel !== NOVO ? { id: Number(locadorSel) } : { novo: locadorNovo };
    const locatario = locatarioSel && locatarioSel !== NOVO ? { id: Number(locatarioSel) } : { novo: locatarioNovo };

    // validações rápidas (o servidor valida de novo)
    if (!imovelSel) return setErro("Escolha o imóvel (ou “Cadastrar novo”).");
    if (imovelSel === NOVO && !locadorSel) return setErro("Escolha o locador (ou “Cadastrar novo”).");
    if (imovelSel === NOVO && locadorSel === NOVO && !locadorNovo.nome.trim()) return setErro("Informe o nome do locador.");
    if (imovelSel === NOVO && (!imovelNovo.rua.trim() || !imovelNovo.numero.trim())) return setErro("Informe rua e número do imóvel.");
    if (!locatarioSel) return setErro("Escolha o locatário (ou “Cadastrar novo”).");
    if (locatarioSel === NOVO && !locatarioNovo.nome.trim()) return setErro("Informe o nome do locatário.");
    if (!c.valor_primeiro_aluguel) return setErro("Informe o valor do aluguel.");
    if (!c.data_inicio) return setErro("Informe a data de início.");
    if (!c.dia_vencimento) return setErro("Informe o dia de vencimento.");
    let conta: ContaForm | null = null;
    if (contaModo === "nova") {
      const n = normalizarConta(contaForm);
      if (!n.ok) return setErro(n.error + " (ou escolha “Cadastrar depois”).");
      conta = contaForm;
    } else if (contaModo !== "depois") {
      conta = contasLocador.find((x) => String(x.id) === contaModo) || null;
    }
    let seguro: Record<string, any> | null = null;
    if (seg.tem) {
      seguro = { ...seg, cobranca_inicio: seg.cobranca_inicio || mesPrimeiroAluguel };
      const sc = normalizarCobrancaSeguro(seguro);
      if (!sc.ok) return setErro(sc.error);
    }
    if (imovelEscolhido?.contrato_ativo &&
        !window.confirm(`Este imóvel já tem o contrato ativo #${imovelEscolhido.contrato_ativo}. Criar outro mesmo assim?`)) return;

    setSalvando(true);
    setEtapa("Criando contrato…");
    try {
      const r = await fetch("/api/adm/contrato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locador,
          imovel,
          locatario,
          contrato: { ...c, valor_atual_aluguel: c.valor_primeiro_aluguel },
          conta,
          seguro,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(d?.error || "Falha ao criar o contrato.");
        setSalvando(false);
        setEtapa(null);
        return;
      }
      const id = d.id as number;
      let aviso = "";
      if (docsRef.current?.temFila()) {
        setEtapa("Enviando documentos…");
        const res = await docsRef.current.enviarFila(id, d.seguro_id ? { residencial: d.seguro_id } : undefined);
        if (res.falhas.length) aviso = "&falhas=" + res.falhas.length;
      }
      window.location.href = `/contratos/editar?id=${id}&novo=1${aviso}`;
    } catch {
      setErro("Erro de rede ao criar o contrato.");
      setSalvando(false);
      setEtapa(null);
    }
  }

  const mostraValidadeGarantia = GARANTIA_COM_VALIDADE.has(c.garantia_categoria);

  const camposPessoa = (p: typeof vazioPessoa, setP: (x: typeof vazioPessoa) => void) => (
    <div className="vj-grid vj-sub-grid">
      <label className="vj-f"><span>Nome *</span><input value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} /></label>
      <label className="vj-f"><span>CPF / CNPJ</span><input value={p.cpf_cnpj} onChange={(e) => setP({ ...p, cpf_cnpj: e.target.value })} /></label>
      <label className="vj-f"><span>E-mail</span><input type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} /></label>
      <label className="vj-f"><span>Telefone</span><input value={p.telefone} onChange={(e) => setP({ ...p, telefone: e.target.value })} /></label>
    </div>
  );

  return (
    <div className="vj-wrap">
      <header className="vj-top">
        <a href="/cobrancas" className="vj-mark vj-marklink">REMAX <span>Ville</span></a>
        <div className="vj-crumb">Administração · Novo contrato</div>
      </header>

      <main className="vj-main">
        <div className="vj-head">
          <div>
            <h1 className="vj-h1">Novo contrato de locação</h1>
            <p className="vj-sub">Escolha da base ou cadastre na hora. Os documentos sobem junto ao criar.</p>
          </div>
          <button className="vj-btn-salvar" onClick={criar} disabled={salvando || !listas}>
            {salvando ? etapa || "Salvando…" : "Criar contrato"}
          </button>
        </div>

        {erro && <div className="vj-card vj-erro">{erro}</div>}
        {!listas && !erro && <div className="vj-card">Carregando cadastros…</div>}

        {listas && (
          <>
            {/* Imóvel e locador */}
            <section className="vj-card">
              <h2 className="vj-h2">Imóvel e locador</h2>
              <div className="vj-grid">
                <label className="vj-f vj-larga">
                  <span>Imóvel *</span>
                  <select value={imovelSel} onChange={(e) => escolherImovel(e.target.value)}>
                    <option value="">— escolha —</option>
                    <option value={NOVO}>+ Cadastrar imóvel novo</option>
                    {imoveisFiltrados.map((i) => (
                      <option key={i.id} value={i.id}>
                        {endImovel(i)}{i.contrato_ativo ? `  (contrato ativo #${i.contrato_ativo})` : ""}
                      </option>
                    ))}
                  </select>
                  {imovelEscolhido?.contrato_ativo ? (
                    <small className="vj-alerta">Este imóvel já tem contrato ativo (#{imovelEscolhido.contrato_ativo}). Se é uma nova locação, inative o anterior depois.</small>
                  ) : null}
                </label>

                <label className="vj-f vj-larga">
                  <span>Locador (proprietário) {imovelSel === NOVO ? "*" : ""}</span>
                  <select
                    value={locadorSel}
                    disabled={!!imovelSel && imovelSel !== NOVO}
                    onChange={(e) => { setLocadorSel(e.target.value); if (imovelSel !== NOVO) setImovelSel(""); }}
                  >
                    <option value="">— escolha —</option>
                    <option value={NOVO}>+ Cadastrar locador novo</option>
                    {listas.locadores.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` · ${p.cpf_cnpj}` : ""}</option>
                    ))}
                  </select>
                  {imovelSel && imovelSel !== NOVO && <small>Definido pelo imóvel escolhido.</small>}
                </label>
              </div>

              {imovelSel === NOVO && locadorSel === NOVO && (
                <>
                  <h3 className="vj-h3">Novo locador</h3>
                  {camposPessoa(locadorNovo, setLocadorNovo)}
                </>
              )}

              {imovelSel === NOVO && (
                <>
                  <h3 className="vj-h3">Novo imóvel</h3>
                  <div className="vj-grid vj-sub-grid">
                    <label className="vj-f"><span>Rua *</span><input value={imovelNovo.rua} onChange={(e) => setImovelNovo({ ...imovelNovo, rua: e.target.value })} /></label>
                    <label className="vj-f"><span>Número *</span><input value={imovelNovo.numero} onChange={(e) => setImovelNovo({ ...imovelNovo, numero: e.target.value })} /></label>
                    <label className="vj-f"><span>Complemento</span><input placeholder="ap 121" value={imovelNovo.complemento} onChange={(e) => setImovelNovo({ ...imovelNovo, complemento: e.target.value })} /></label>
                    <label className="vj-f"><span>Bairro</span><input value={imovelNovo.bairro} onChange={(e) => setImovelNovo({ ...imovelNovo, bairro: e.target.value })} /></label>
                    <label className="vj-f"><span>CEP</span><input value={imovelNovo.cep} onChange={(e) => setImovelNovo({ ...imovelNovo, cep: e.target.value })} /></label>
                    <label className="vj-f"><span>Tipo</span>
                      <select value={imovelNovo.tipo_imovel} onChange={(e) => setImovelNovo({ ...imovelNovo, tipo_imovel: e.target.value })}>
                        {TIPOS_IMOVEL.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                    <label className="vj-f"><span>Cidade</span><input value={imovelNovo.cidade} onChange={(e) => setImovelNovo({ ...imovelNovo, cidade: e.target.value })} /></label>
                    <label className="vj-f"><span>UF</span><input maxLength={2} value={imovelNovo.estado} onChange={(e) => setImovelNovo({ ...imovelNovo, estado: e.target.value })} /></label>
                    <label className="vj-f"><span>Nº contribuinte (IPTU)</span><input value={imovelNovo.nro_contribuinte} onChange={(e) => setImovelNovo({ ...imovelNovo, nro_contribuinte: e.target.value })} /></label>
                    <label className="vj-f"><span>Administradora do condomínio</span><input value={imovelNovo.administradora} onChange={(e) => setImovelNovo({ ...imovelNovo, administradora: e.target.value })} /></label>
                    <label className="vj-f"><span>Dia venc. condomínio</span><input type="number" min="1" max="31" value={imovelNovo.dia_venc_condominio} onChange={(e) => setImovelNovo({ ...imovelNovo, dia_venc_condominio: e.target.value })} /></label>
                    <label className="vj-f"><span>Dia venc. IPTU</span><input type="number" min="1" max="31" value={imovelNovo.dia_venc_iptu} onChange={(e) => setImovelNovo({ ...imovelNovo, dia_venc_iptu: e.target.value })} /></label>
                  </div>
                </>
              )}
            </section>

            {/* Conta de repasse */}
            <section className="vj-card">
              <h2 className="vj-h2">Conta para repasse (dados bancários do locador)</h2>
              <div className="vj-grid">
                <label className="vj-f vj-larga">
                  <span>Conta</span>
                  <select value={contaModo} onChange={(e) => setContaModo(e.target.value)}>
                    {contasLocador.map((k) => (
                      <option key={k.id} value={String(k.id)}>
                        Usar a já cadastrada: {k.titular} — {resumoConta(k)}
                      </option>
                    ))}
                    <option value="nova">Cadastrar conta nova</option>
                    <option value="depois">Cadastrar depois</option>
                  </select>
                  {contaModo === "depois" && (
                    <small className="vj-alerta">Sem conta, o repasse por Pix não sai. Dá para cadastrar depois no Editar contrato.</small>
                  )}
                </label>
              </div>
              {contaModo === "nova" && (
                <FormConta
                  v={contaForm}
                  onChange={(v) => {
                    if (v.titular !== contaForm.titular || v.cpf_cnpj !== contaForm.cpf_cnpj) setContaAuto(false);
                    setContaForm(v);
                  }}
                />
              )}
            </section>

            {/* Locatário */}
            <section className="vj-card">
              <h2 className="vj-h2">Locatário (inquilino)</h2>
              <div className="vj-grid">
                <label className="vj-f vj-larga">
                  <span>Locatário *</span>
                  <select value={locatarioSel} onChange={(e) => setLocatarioSel(e.target.value)}>
                    <option value="">— escolha —</option>
                    <option value={NOVO}>+ Cadastrar locatário novo</option>
                    {listas.locatarios.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` · ${p.cpf_cnpj}` : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
              {locatarioSel === NOVO && camposPessoa(locatarioNovo, setLocatarioNovo)}
            </section>

            {/* Aluguel e prazo */}
            <section className="vj-card">
              <h2 className="vj-h2">Aluguel e prazo</h2>
              <div className="vj-grid">
                <label className="vj-f"><span>Valor do aluguel *</span>
                  <input type="number" step="0.01" value={c.valor_primeiro_aluguel ?? ""} onChange={(e) => set("valor_primeiro_aluguel", e.target.value)} />
                </label>
                <label className="vj-f"><span>Dia de vencimento *</span>
                  <input type="number" min="1" max="31" value={c.dia_vencimento ?? ""} onChange={(e) => set("dia_vencimento", e.target.value)} />
                </label>
                <label className="vj-f"><span>Data de início *</span>
                  <input type="date" value={c.data_inicio ?? ""} onChange={(e) => set("data_inicio", e.target.value)} />
                  <small>Também vira a âncora da vigência (alertas de renovação/reajuste).</small>
                </label>
                <label className="vj-f"><span>Data do primeiro aluguel</span>
                  <input type="date" value={c.data_primeiro_aluguel ?? ""} onChange={(e) => set("data_primeiro_aluguel", e.target.value)} />
                </label>
                <label className="vj-f"><span>Prazo (meses)</span>
                  <input type="number" value={c.prazo_meses ?? ""} disabled={c.prazo_indeterminado} onChange={(e) => set("prazo_meses", e.target.value)} />
                </label>
                <label className="vj-f"><span>Dia venc. condomínio</span>
                  <input type="number" min="1" max="31" value={c.dia_vencimento_condominio ?? ""} onChange={(e) => set("dia_vencimento_condominio", e.target.value)} />
                </label>
                <label className="vj-f vj-check">
                  <input type="checkbox" checked={!!c.prazo_indeterminado} onChange={(e) => set("prazo_indeterminado", e.target.checked)} />
                  <span>Prazo indeterminado (sem alerta de renovação)</span>
                </label>
              </div>
            </section>

            {/* Reajuste e garantia */}
            <section className="vj-card">
              <h2 className="vj-h2">Reajuste e garantia</h2>
              <div className="vj-grid">
                <label className="vj-f"><span>Índice</span>
                  <select value={c.indice_reajuste ?? ""} onChange={(e) => set("indice_reajuste", e.target.value)}>
                    {INDICES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
                <label className="vj-f"><span>Período de reajuste (meses)</span>
                  <input type="number" value={c.periodo_reajuste_meses ?? ""} onChange={(e) => set("periodo_reajuste_meses", e.target.value)} />
                </label>
                <label className="vj-f"><span>Tipo de garantia</span>
                  <select value={c.garantia_categoria ?? ""} onChange={(e) => set("garantia_categoria", e.target.value)}>
                    <option value="">—</option>
                    {GARANTIAS.map((g) => <option key={g.v} value={g.v}>{g.t}</option>)}
                  </select>
                </label>
                {mostraValidadeGarantia && (
                  <>
                    <label className="vj-f"><span>Seguradora / instituição</span>
                      <input value={c.garantia_seguradora ?? ""} onChange={(e) => set("garantia_seguradora", e.target.value)} />
                    </label>
                    <label className="vj-f"><span>Prazo da garantia (meses)</span>
                      <input type="number" value={c.garantia_prazo_meses ?? ""} onChange={(e) => set("garantia_prazo_meses", e.target.value)} />
                    </label>
                  </>
                )}
                {c.garantia_categoria === "seguro_fianca" && (
                  <label className="vj-f"><span>Valor do seguro-fiança (mensal)</span>
                    <input type="number" step="0.01" value={c.valor_seguro_fianca ?? ""} onChange={(e) => set("valor_seguro_fianca", e.target.value)} />
                  </label>
                )}
              </div>
              {mostraValidadeGarantia && (
                <p className="vj-nota">A vigência da apólice vai no quadro <b>Apólices</b> abaixo — é ela que dispara o alerta de 30 dias.</p>
              )}
            </section>

            {/* Seguro residencial */}
            <section className="vj-card">
              <h2 className="vj-h2">Seguro residencial</h2>
              <div className="vj-grid">
                <label className="vj-f vj-check">
                  <input type="checkbox" checked={seg.tem} onChange={(e) => setSeg({ ...seg, tem: e.target.checked })} />
                  <span>Este contrato tem seguro residencial</span>
                </label>
                {seg.tem && (
                  <>
                    <label className="vj-f"><span>Seguradora</span>
                      <input value={seg.seguradora} onChange={(e) => setSeg({ ...seg, seguradora: e.target.value })} />
                    </label>
                    <label className="vj-f"><span>Nº da apólice</span>
                      <input value={seg.numero_apolice} onChange={(e) => setSeg({ ...seg, numero_apolice: e.target.value })} />
                    </label>
                    <label className="vj-f"><span>Vigência início</span>
                      <input type="date" value={seg.vigencia_inicio} onChange={(e) => setSeg({ ...seg, vigencia_inicio: e.target.value })} />
                    </label>
                    <label className="vj-f"><span>Vigência fim</span>
                      <input type="date" value={seg.vigencia_fim} onChange={(e) => setSeg({ ...seg, vigencia_fim: e.target.value })} />
                      <small>Alerta de vencimento 30 dias antes.</small>
                    </label>
                    <label className="vj-f vj-larga"><span>Como o inquilino paga</span>
                      <select value={seg.cobrar_no_boleto ? "boleto" : "direto"} onChange={(e) => setSeg({ ...seg, cobrar_no_boleto: e.target.value === "boleto" })}>
                        <option value="boleto">Cobrado no boleto do aluguel</option>
                        <option value="direto">Paga direto à seguradora (não entra no boleto)</option>
                      </select>
                    </label>
                    {seg.cobrar_no_boleto && (
                      <>
                        <label className="vj-f"><span>Valor da parcela (R$) *</span>
                          <input type="number" step="0.01" value={seg.valor_mensal} onChange={(e) => setSeg({ ...seg, valor_mensal: e.target.value })} />
                        </label>
                        <label className="vj-f"><span>Qtde. de parcelas a cobrar *</span>
                          <input type="number" min="1" max="120" value={seg.parcelas_total} onChange={(e) => setSeg({ ...seg, parcelas_total: e.target.value })} />
                        </label>
                        <label className="vj-f"><span>1ª cobrança (mês)</span>
                          <input type="month" value={seg.cobranca_inicio || mesPrimeiroAluguel} onChange={(e) => setSeg({ ...seg, cobranca_inicio: e.target.value })} />
                          <small>Padrão: mês do primeiro aluguel. Depois da última parcela, o seguro sai do boleto sozinho.</small>
                        </label>
                      </>
                    )}
                    <label className="vj-f"><span>Prêmio total (R$)</span>
                      <input type="number" step="0.01" value={seg.premio} onChange={(e) => setSeg({ ...seg, premio: e.target.value })} />
                    </label>
                  </>
                )}
              </div>
              {seg.tem && (
                <p className="vj-nota">O PDF da apólice pode ser anexado em <b>Documentos → Apólices</b> abaixo (escolha o tipo “Seguro residencial”); ele fica ligado a este seguro.</p>
              )}
            </section>

            {/* Responsabilidades e taxas */}
            <section className="vj-card">
              <h2 className="vj-h2">Responsabilidades e taxas</h2>
              <div className="vj-grid">
                <label className="vj-f"><span>Tipo de uso</span>
                  <select value={c.tipo_uso ?? ""} onChange={(e) => set("tipo_uso", e.target.value)}>
                    {TIPO_USO.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
                  </select>
                </label>
                <label className="vj-f"><span>Taxa de administração (%)</span>
                  <input type="number" step="0.01" value={c.taxa_administracao ?? ""} onChange={(e) => set("taxa_administracao", e.target.value)} />
                </label>
                <label className="vj-f"><span>IPTU pago por</span>
                  <select value={c.iptu_responsavel ?? ""} onChange={(e) => set("iptu_responsavel", e.target.value)}>
                    <option value="">—</option>
                    {RESPONSAVEL.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
                  </select>
                </label>
                <label className="vj-f"><span>Condomínio pago por</span>
                  <select value={c.condominio_responsavel ?? ""} onChange={(e) => set("condominio_responsavel", e.target.value)}>
                    <option value="">—</option>
                    {RESPONSAVEL.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
                  </select>
                </label>
                <label className="vj-f"><span>Multa (%)</span>
                  <input type="number" step="0.01" value={c.multa_percentual ?? ""} onChange={(e) => set("multa_percentual", e.target.value)} />
                </label>
                <label className="vj-f"><span>Mora ao mês (%)</span>
                  <input type="number" step="0.01" value={c.mora_percentual ?? ""} onChange={(e) => set("mora_percentual", e.target.value)} />
                </label>
              </div>
            </section>

            <DocumentosContrato ref={docsRef} contratoId={null} />

            <div className="vj-foot">
              <button className="vj-btn-salvar" onClick={criar} disabled={salvando}>
                {salvando ? etapa || "Salvando…" : "Criar contrato"}
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
.vj-h3{font-size:13px;margin:18px 0 10px;color:var(--txt);text-transform:uppercase;letter-spacing:.4px}
.vj-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.vj-sub-grid{background:#F8FAFD;border:1px solid var(--linha);border-radius:10px;padding:14px}
.vj-larga{grid-column:1 / -1}
.vj-f{display:flex;flex-direction:column;gap:5px}
.vj-f>span{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px}
.vj-f input,.vj-f select{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff;color:var(--txt)}
.vj-f input:focus,.vj-f select:focus{outline:2px solid var(--azul);outline-offset:1px;border-color:var(--azul)}
.vj-f select:disabled{background:#F1F4F9;color:var(--mut)}
.vj-f small{font-size:11px;color:var(--mut)}
.vj-f small.vj-alerta{color:#7A5B00;background:#FFF8E6;border-radius:6px;padding:4px 8px}
.vj-check{flex-direction:row;align-items:center;gap:8px;grid-column:1 / -1}
.vj-check input{width:auto}
.vj-check>span{text-transform:none;font-weight:500;font-size:14px;color:var(--txt)}
.vj-nota{font-size:13px;color:var(--mut);margin:14px 0 0}
.vj-btn-salvar{background:var(--verm);border:none;color:#fff;font:inherit;font-weight:600;font-size:15px;padding:11px 22px;border-radius:10px;cursor:pointer;white-space:nowrap}
.vj-btn-salvar:hover:not(:disabled){background:#b8121f}
.vj-btn-salvar:disabled{opacity:.5;cursor:not-allowed}
.vj-foot{display:flex;justify-content:flex-end;margin-top:8px}
.vj-erro{border-color:#F5C2C7;background:#FDECEE;color:#8B1A24}
@media (max-width:640px){.vj-grid{grid-template-columns:1fr}.vj-head{flex-direction:column}}
`;

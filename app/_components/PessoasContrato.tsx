"use client";

// Pessoas do contrato de locação no formato da diligência: cada pessoa é um quadro aberto,
// com o documento de identidade (leitura automática) logo no topo, depois os campos, o
// comprovante de endereço e a certidão de estado civil (também com leitura). Fiador tem
// ainda o documento do cônjuge e a matrícula do imóvel dado em garantia.
// Tudo salva sozinho (a cada alteração, com uma pequena espera). Na tela de nova locação,
// se a minuta ainda não existe, ela é criada na primeira ação (obterDono).

import { useCallback, useEffect, useRef, useState } from "react";
import { enviarArquivo } from "@/app/_components/DocumentosContrato";
import { donoQS, type DonoRef } from "@/lib/contrato-dono";
import {
  COM_CONJUGE,
  ESTADOS_CIVIS,
  REGIMES,
  aplicarLeitura,
  rotuloDoc,
  type Divergencia,
  type Papel,
  type Parte,
} from "@/lib/contrato-partes";

type DocParte = { id: number; parte_id: number | null; tipo_documento: string | null; nome: string; url: string | null };
type Leitura = { estado: "enviando" | "lendo" | "ok" | "erro"; msg?: string };
type Card = {
  key: string;
  parte: Parte;
  docsNovos: number[]; // enviados antes de a pessoa ser salva
  leituras: Record<string, Leitura>;
  diverg: Divergencia[];
  status: "salvo" | "salvando" | "pendente" | "erro" | "vazio";
  erro?: string;
  daBase?: boolean; // veio do cadastro / do formulário
};
export type PessoaBase = { nome: string; cpf_cnpj?: string | null; email?: string | null; telefone?: string | null };

const ACEITA = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const TXT: Record<Papel, { um: string; add: string }> = {
  locador: { um: "locador", add: "+ Adicionar locador" },
  locatario: { um: "locatário", add: "+ Adicionar locatário" },
  fiador: { um: "fiador", add: "+ Adicionar fiador" },
};
let seq = 0;
const novaChave = () => `c${Date.now()}-${seq++}`;
const vazia = (papel: Papel): Parte => ({ papel, tipo_pessoa: "PF", nome: "", nacionalidade: "" });

export default function PessoasContrato({
  papel,
  titulo,
  subtitulo,
  dono,
  obterDono,
  base,
  onMudou,
  onDocsMudaram,
}: {
  papel: Papel;
  titulo: string;
  subtitulo?: string;
  dono: DonoRef | null; // contrato ou minuta; null = minuta ainda não criada
  obterDono?: () => Promise<DonoRef | null>;
  base?: PessoaBase | null; // ex.: o locador do imóvel escolhido, para preencher o 1º quadro
  onMudou?: (partes: Parte[]) => void;
  onDocsMudaram?: () => void;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [docs, setDocs] = useState<DocParte[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;
  const donoRef = useRef<DonoRef | null>(dono);
  donoRef.current = dono;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const salvandoRef = useRef<Record<string, boolean>>({});
  const sujoRef = useRef<Record<string, boolean>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const carregadoDe = useRef<string | null>(null);

  const atualizar = (key: string, fn: (c: Card) => Card) =>
    setCards((cs) => cs.map((c) => (c.key === key ? fn(c) : c)));

  // carrega do servidor só quando a tela abre com contrato/minuta (não quando a minuta
  // acabou de ser criada por este próprio quadro, para não apagar o que está na tela)
  const carregar = useCallback(async (d: DonoRef) => {
    try {
      const r = await fetch(`/api/adm/contrato-partes?${donoQS(d)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.error || "Falha ao carregar.");
        return;
      }
      const partes: Parte[] = (j.partes || []).filter((p: Parte) => p.papel === papel);
      const sug: Parte[] = (j.sugestoes || []).filter((p: Parte) => p.papel === papel);
      const lista: Card[] = [
        ...partes.map((p) => ({ key: `p${p.id}`, parte: p, docsNovos: [], leituras: {}, diverg: [], status: "salvo" as const })),
        ...sug.map((p) => ({ key: novaChave(), parte: { ...p, id: null }, docsNovos: [], leituras: {}, diverg: [], status: "pendente" as const, daBase: true })),
      ];
      setDocs((j.documentos || []) as DocParte[]);
      setCards(lista.length || papel === "fiador" ? lista : [{ key: novaChave(), parte: vazia(papel), docsNovos: [], leituras: {}, diverg: [], status: "vazio" }]);
      // na minuta, as pessoas do formulário viram parte salva sem precisar clicar;
      // no contrato já cadastrado, a sugestão espera a pessoa conferir e salvar
      if ("minuta" in d) for (const c of lista) if (c.daBase) agendar(c.key, 50);
    } catch {
      setErro("Erro de rede ao carregar.");
    } finally {
      setCarregado(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papel]);

  useEffect(() => {
    const k = dono ? donoQS(dono) : "";
    if (carregadoDe.current === null) {
      carregadoDe.current = k;
      if (dono) carregar(dono);
      else {
        setCards(papel === "fiador" ? [] : [{ key: novaChave(), parte: vazia(papel), docsNovos: [], leituras: {}, diverg: [], status: "vazio" }]);
        setCarregado(true);
      }
    } else if (k && carregadoDe.current && carregadoDe.current !== k) {
      carregadoDe.current = k;
      carregar(dono!);
    } else if (k) {
      carregadoDe.current = k; // minuta criada agora: mantém a tela como está
    }
  }, [dono, carregar, papel]);

  // pessoa do cadastro (ex.: locador do imóvel escolhido) entra no 1º quadro vazio
  useEffect(() => {
    if (!base?.nome || !carregado) return;
    const cs = cardsRef.current;
    if (cs.some((c) => (c.parte.cpf_cnpj && base.cpf_cnpj && c.parte.cpf_cnpj.replace(/\D/g, "") === base.cpf_cnpj.replace(/\D/g, "")) || c.parte.nome === base.nome)) return;
    const alvo = cs.find((c) => !c.parte.nome && !c.parte.id);
    const parte: Parte = { ...vazia(papel), nome: base.nome, cpf_cnpj: base.cpf_cnpj || null, email: base.email || null, telefone: base.telefone || null };
    parte.tipo_pessoa = (base.cpf_cnpj || "").replace(/\D/g, "").length === 14 ? "PJ" : "PF";
    const key = alvo ? alvo.key : novaChave();
    if (alvo) setCards(cs.map((c) => (c.key === key ? { ...c, parte, status: "pendente", daBase: true } : c)));
    else setCards([...cs, { key, parte, docsNovos: [], leituras: {}, diverg: [], status: "pendente", daBase: true }]);
    agendar(key, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.nome, base?.cpf_cnpj, carregado]);

  // avisa a tela (ex.: para ligar o locador ao cadastro e à conta de repasse)
  useEffect(() => {
    onMudou?.(cards.map((c) => c.parte).filter((p) => p.nome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  async function garantirDono(): Promise<DonoRef | null> {
    if (donoRef.current) return donoRef.current;
    const d = obterDono ? await obterDono() : null;
    if (d) donoRef.current = d;
    return d;
  }

  function agendar(key: string, ms = 1200) {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => salvar(key), ms);
  }

  async function salvar(key: string) {
    const c = cardsRef.current.find((x) => x.key === key);
    if (!c) return;
    if (!c.parte.nome.trim()) {
      atualizar(key, (x) => ({ ...x, status: x.parte.id ? "pendente" : "vazio" }));
      return;
    }
    if (salvandoRef.current[key]) {
      sujoRef.current[key] = true;
      return;
    }
    salvandoRef.current[key] = true;
    sujoRef.current[key] = false;
    atualizar(key, (x) => ({ ...x, status: "salvando", erro: undefined }));
    try {
      const d = await garantirDono();
      if (!d) throw new Error("Salve a minuta primeiro.");
      const atual = cardsRef.current.find((x) => x.key === key) || c;
      const r = await fetch("/api/adm/contrato-partes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvar", ...d, parte: atual.parte, documentos: atual.docsNovos }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Falha ao salvar.");
      const id = j.parte?.id as number;
      const enviados = atual.docsNovos;
      atualizar(key, (x) => ({
        ...x,
        parte: { ...x.parte, id },
        docsNovos: x.docsNovos.filter((n) => !enviados.includes(n)),
        status: sujoRef.current[key] ? "pendente" : "salvo",
        daBase: false,
      }));
      if (enviados.length) setDocs((ds) => ds.map((doc) => (enviados.includes(doc.id) ? { ...doc, parte_id: id } : doc)));
    } catch (e: any) {
      atualizar(key, (x) => ({ ...x, status: "erro", erro: e?.message || "Falha ao salvar." }));
    } finally {
      salvandoRef.current[key] = false;
      if (sujoRef.current[key]) agendar(key, 300);
    }
  }

  function mudar(key: string, fn: (p: Parte) => Parte) {
    atualizar(key, (x) => {
      const np = fn(x.parte);
      return { ...x, parte: np, status: np.nome ? "pendente" : x.status };
    });
    agendar(key);
  }

  async function enviarDoc(key: string, tipo: string, file: File) {
    const c0 = cardsRef.current.find((x) => x.key === key);
    if (!c0) return;
    atualizar(key, (x) => ({ ...x, leituras: { ...x.leituras, [tipo]: { estado: "enviando" } } }));
    let docId: number;
    try {
      const d = await garantirDono();
      if (!d) throw new Error("Não consegui criar a minuta para guardar o arquivo.");
      const r = await enviarArquivo(d, file, "documentos_partes", undefined, {
        parte_id: c0.parte.id || null,
        tipo_documento: tipo,
        descricao: `${rotuloDoc(tipo)} — ${c0.parte.nome || "pessoa em cadastro"}`,
      });
      docId = r.id;
      setDocs((ds) => [...ds, { id: r.id, parte_id: c0.parte.id || null, tipo_documento: tipo, nome: file.name, url: null }]);
      atualizar(key, (x) => ({ ...x, docsNovos: x.parte.id ? x.docsNovos : [...x.docsNovos, r.id] }));
      onDocsMudaram?.();
    } catch (e: any) {
      atualizar(key, (x) => ({ ...x, leituras: { ...x.leituras, [tipo]: { estado: "erro", msg: e?.message || "Falha no envio." } } }));
      return;
    }
    atualizar(key, (x) => ({ ...x, leituras: { ...x.leituras, [tipo]: { estado: "lendo" } } }));
    try {
      const d = donoRef.current!;
      const r = await fetch("/api/adm/contrato-partes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ler", ...d, documento_id: docId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Não consegui ler o documento.");
      const atual = cardsRef.current.find((x) => x.key === key);
      if (!atual) return;
      const res = aplicarLeitura(atual.parte, tipo, j.dados);
      const n = res.preenchidos.length;
      atualizar(key, (x) => ({
        ...x,
        parte: res.parte,
        diverg: [...x.diverg.filter((v) => !res.divergencias.some((y) => y.campo === v.campo)), ...res.divergencias],
        leituras: { ...x.leituras, [tipo]: { estado: "ok", msg: n ? `${n} campo${n > 1 ? "s" : ""} preenchido${n > 1 ? "s" : ""}` : "lido — confira os campos" } },
        status: "pendente",
      }));
      agendar(key, 200);
    } catch (e: any) {
      atualizar(key, (x) => ({
        ...x,
        leituras: { ...x.leituras, [tipo]: { estado: "erro", msg: (e?.message || "Não consegui ler.") + " O arquivo ficou salvo; preencha à mão." } },
      }));
    }
  }

  async function remover(key: string) {
    const c = cardsRef.current.find((x) => x.key === key);
    if (!c) return;
    if (c.parte.id) {
      if (!window.confirm(`Tirar ${c.parte.nome || "esta pessoa"} do contrato? Os documentos continuam guardados.`)) return;
      const d = donoRef.current;
      if (!d) return;
      const r = await fetch(`/api/adm/contrato-partes?id=${c.parte.id}&${donoQS(d)}`, { method: "DELETE" });
      if (!r.ok) {
        atualizar(key, (x) => ({ ...x, status: "erro", erro: "Falha ao remover." }));
        return;
      }
    }
    clearTimeout(timers.current[key]);
    setCards((cs) => cs.filter((x) => x.key !== key));
  }

  function adicionar() {
    setCards((cs) => [...cs, { key: novaChave(), parte: vazia(papel), docsNovos: [], leituras: {}, diverg: [], status: "vazio" }]);
  }

  // ---------- um campo de arquivo com leitura automática ----------
  function arquivo(c: Card, tipo: string, rotulo: string, dica?: string) {
    const meus = docs.filter((d) => d.tipo_documento === tipo && (c.parte.id ? d.parte_id === c.parte.id : c.docsNovos.includes(d.id)));
    const l = c.leituras[tipo];
    const ocupado = l?.estado === "enviando" || l?.estado === "lendo";
    const ik = `${c.key}-${tipo}`;
    return (
      <div className="vj-ps-arq">
        <div className="vj-ps-arq-rot">
          {rotulo} <span className="vj-ps-badge">Leitura automática</span>
        </div>
        <div className="vj-ps-arq-linha">
          <input
            type="file"
            accept={ACEITA}
            hidden
            ref={(el) => {
              inputs.current[ik] = el;
            }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) enviarDoc(c.key, tipo, f);
            }}
          />
          <button type="button" className="vj-ps-arq-btn" disabled={ocupado} onClick={() => inputs.current[ik]?.click()}>
            {ocupado ? "Aguarde…" : meus.length ? "Enviar outro" : "Escolher arquivo"}
          </button>
          {meus.map((d) => (
            <a key={d.id} className="vj-ps-arq-nome" href={d.url || undefined} target="_blank" rel="noreferrer" title={d.nome}>
              {d.nome}
            </a>
          ))}
          {l && (
            <span className={"vj-ps-st st-" + l.estado}>
              {l.estado === "enviando" ? "Enviando…" : l.estado === "lendo" ? "Lendo o documento…" : l.estado === "ok" ? "✓ " + (l.msg || "lido") : l.msg}
            </span>
          )}
        </div>
        {dica && !meus.length && !l && <small className="vj-ps-dica">{dica}</small>}
      </div>
    );
  }

  // ---------- quadro de uma pessoa (função, não componente: os campos não perdem o foco) ----------
  function quadro(c: Card, i: number) {
    const p = c.parte;
    const pj = p.tipo_pessoa === "PJ";
    const casado = !pj && !!p.estado_civil && COM_CONJUGE.has(p.estado_civil);
    const set = (k: keyof Parte, v: any) => mudar(c.key, (x) => ({ ...x, [k]: v }));
    const setConj = (k: string, v: string) => mudar(c.key, (x) => ({ ...x, conjuge: { ...(x.conjuge || {}), [k]: v } }));
    const setIm = (j: number, k: string, v: string) =>
      mudar(c.key, (x) => ({ ...x, imoveis: (x.imoveis || []).map((m, n) => (n === j ? { ...m, [k]: v } : m)) }));
    return (
      <div key={c.key} className="vj-ps-quadro">
        <div className="vj-ps-cab">
          <b>
            {TXT[papel].um.charAt(0).toUpperCase() + TXT[papel].um.slice(1)} {i + 1}
          </b>
          <div className="vj-ps-seg" role="group" aria-label="Tipo de pessoa">
            <button type="button" className={!pj ? "on" : ""} onClick={() => set("tipo_pessoa", "PF")}>Pessoa física</button>
            <button type="button" className={pj ? "on" : ""} onClick={() => set("tipo_pessoa", "PJ")}>Empresa</button>
          </div>
          <span className={"vj-ps-salvo s-" + c.status}>
            {c.status === "salvo"
              ? "Salvo"
              : c.status === "salvando"
                ? "Salvando…"
                : c.status === "erro"
                  ? c.erro
                  : c.status === "vazio"
                    ? ""
                    : !p.nome
                      ? "Preencha o nome"
                      : c.daBase
                        ? "Veio do cadastro · confira e salve"
                        : "Alterações não salvas"}
          </span>
          {(c.status === "pendente" || c.status === "erro") && p.nome && (
            <button type="button" className="vj-ps-salvar" onClick={() => salvar(c.key)}>Salvar</button>
          )}
          <button type="button" className="vj-ps-x" title={`Remover ${TXT[papel].um}`} onClick={() => remover(c.key)}>×</button>
        </div>

        {pj
          ? arquivo(c, "contrato_social", "Contrato social ou cartão CNPJ", "Preenche razão social, CNPJ, sede e representante.")
          : arquivo(c, "identidade", "Documento de identidade (RG ou CNH)", "Preenche nome, CPF, RG, gênero e nacionalidade.")}

        {c.diverg.length > 0 && (
          <div className="vj-ps-diverg">
            <b>O documento traz dados diferentes do que está preenchido:</b>
            {c.diverg.map((d) => (
              <div key={d.campo} className="vj-ps-diverg-l">
                <span>
                  {d.rotulo}: <s>{d.atual}</s> → <b>{d.lido}</b>
                </span>
                <span className="vj-ps-diverg-ac">
                  <button type="button" onClick={() => { mudar(c.key, (x) => d.aplicar(x)); atualizar(c.key, (x) => ({ ...x, diverg: x.diverg.filter((y) => y.campo !== d.campo) })); }}>Usar o do documento</button>
                  <button type="button" onClick={() => atualizar(c.key, (x) => ({ ...x, diverg: x.diverg.filter((y) => y.campo !== d.campo) }))}>Manter</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="vj-grid">
          <label className="vj-f vj-ps-larga">
            <span>{pj ? "Razão social *" : "Nome completo *"}</span>
            <input value={p.nome || ""} placeholder="Preenchido pela leitura do documento" onChange={(e) => set("nome", e.target.value)} />
          </label>
          <label className="vj-f">
            <span>{pj ? "CNPJ" : "CPF"}</span>
            <input value={p.cpf_cnpj || ""} inputMode="numeric" onChange={(e) => set("cpf_cnpj", e.target.value)} />
          </label>
          {!pj && (
            <>
              <label className="vj-f">
                <span>RG (com órgão emissor)</span>
                <input value={p.rg || ""} onChange={(e) => set("rg", e.target.value)} />
              </label>
              <label className="vj-f">
                <span>Gênero</span>
                <select value={p.genero || ""} onChange={(e) => set("genero", e.target.value || null)}>
                  <option value="">—</option>
                  <option value="F">Feminino</option>
                  <option value="M">Masculino</option>
                </select>
              </label>
              <label className="vj-f">
                <span>Nacionalidade</span>
                <input value={p.nacionalidade || ""} placeholder="brasileira / brasileiro" onChange={(e) => set("nacionalidade", e.target.value)} />
              </label>
              <label className="vj-f">
                <span>Profissão</span>
                <input value={p.profissao || ""} onChange={(e) => set("profissao", e.target.value)} />
              </label>
            </>
          )}
          <label className="vj-f">
            <span>E-mail</span>
            <input type="email" value={p.email || ""} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label className="vj-f">
            <span>Telefone</span>
            <input value={p.telefone || ""} onChange={(e) => set("telefone", e.target.value)} />
          </label>
          <label className="vj-f vj-ps-larga">
            <span>{pj ? "Endereço da sede" : "Endereço (residência)"}</span>
            <input value={p.endereco || ""} placeholder="Rua, número, complemento, bairro, cidade/UF, CEP" onChange={(e) => set("endereco", e.target.value)} />
          </label>
        </div>

        {!pj && arquivo(c, "comprovante_endereco", "Comprovante de endereço", "Preenche o endereço.")}

        {pj ? (
          <>
            <label className="vj-f vj-ps-larga">
              <span>Representação</span>
              <textarea rows={3} value={p.representacao || ""} onChange={(e) => set("representacao", e.target.value)} placeholder="neste ato representada por seu sócio administrador Fulano de Tal, brasileiro, casado, empresário, RG …, CPF …" />
            </label>
            {arquivo(c, "identidade", "RG ou CNH do representante", "Preenche a representação.")}
          </>
        ) : (
          <>
            <div className="vj-grid">
              <label className="vj-f">
                <span>Estado civil</span>
                <select value={p.estado_civil || ""} onChange={(e) => set("estado_civil", e.target.value || null)}>
                  <option value="">Selecione…</option>
                  {ESTADOS_CIVIS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                </select>
              </label>
              <label className="vj-f">
                <span>Regime de bens</span>
                <select value={p.regime_bens || ""} disabled={!casado} onChange={(e) => set("regime_bens", e.target.value || null)}>
                  <option value="">—</option>
                  {REGIMES.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                </select>
              </label>
            </div>
            {arquivo(c, "certidao_estado_civil", "Certidão de casamento ou nascimento", "Preenche estado civil, regime e o nome do cônjuge.")}
          </>
        )}

        {casado && (
          <div className="vj-ps-conj">
            <div className="vj-ps-conj-tit">
              Dados do cônjuge <small>{papel === "fiador" ? "assina dando a outorga da fiança" : "opcional"}</small>
            </div>
            {arquivo(c, "identidade_conjuge", "Documento do cônjuge (RG ou CNH)")}
            <div className="vj-grid">
              <label className="vj-f vj-ps-larga"><span>Nome do cônjuge</span><input value={p.conjuge?.nome || ""} onChange={(e) => setConj("nome", e.target.value)} /></label>
              <label className="vj-f"><span>CPF do cônjuge</span><input value={p.conjuge?.cpf || ""} onChange={(e) => setConj("cpf", e.target.value)} /></label>
              <label className="vj-f"><span>RG</span><input value={p.conjuge?.rg || ""} onChange={(e) => setConj("rg", e.target.value)} /></label>
              <label className="vj-f"><span>Nacionalidade</span><input value={p.conjuge?.nacionalidade || ""} onChange={(e) => setConj("nacionalidade", e.target.value)} /></label>
              <label className="vj-f"><span>Profissão</span><input value={p.conjuge?.profissao || ""} onChange={(e) => setConj("profissao", e.target.value)} /></label>
            </div>
          </div>
        )}

        {papel === "fiador" && (
          <div className="vj-ps-conj">
            <div className="vj-ps-conj-tit">Imóvel dado em garantia <small>se o casal for fiador, basta em um dos dois</small></div>
            {arquivo(c, "matricula_fiador", "Matrícula do imóvel", "Preenche cartório, nº da matrícula e descrição.")}
            {(p.imoveis || []).map((im, j) => (
              <div key={j} className="vj-ps-imovel">
                <div className="vj-grid">
                  <label className="vj-f vj-ps-larga"><span>Cartório de registro de imóveis</span><input value={im.cartorio || ""} onChange={(e) => setIm(j, "cartorio", e.target.value)} /></label>
                  <label className="vj-f"><span>Matrícula</span><input value={im.matricula || ""} onChange={(e) => setIm(j, "matricula", e.target.value)} /></label>
                  <label className="vj-f vj-ps-larga"><span>Descrição do imóvel</span><textarea rows={4} value={im.descricao || ""} onChange={(e) => setIm(j, "descricao", e.target.value)} /></label>
                </div>
                <button type="button" className="vj-ps-link" onClick={() => mudar(c.key, (x) => ({ ...x, imoveis: (x.imoveis || []).filter((_, n) => n !== j) }))}>Tirar este imóvel</button>
              </div>
            ))}
            <button type="button" className="vj-ps-link" onClick={() => mudar(c.key, (x) => ({ ...x, imoveis: [...(x.imoveis || []), { cartorio: "", matricula: "", descricao: "" }] }))}>
              + Adicionar imóvel à mão
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="vj-card vj-ps" id={papel === "locador" ? "partes-contrato" : undefined}>
      <h2 className="vj-h2" style={{ marginBottom: subtitulo ? 4 : 16 }}>{titulo}</h2>
      {subtitulo && <p className="vj-ps-sub">{subtitulo}</p>}
      {erro && <div className="vj-ps-erro">{erro}</div>}
      {!carregado ? <p className="vj-ps-sub">Carregando…</p> : cards.map((c, i) => quadro(c, i))}
      <button type="button" className="vj-ps-add" onClick={adicionar}>{TXT[papel].add}</button>
      <style dangerouslySetInnerHTML={{ __html: CSS_PS }} />
    </section>
  );
}

const CSS_PS = `
.vj-ps-sub{color:var(--mut,#5A6B85);font-size:13px;margin:0 0 14px}
.vj-ps-erro{border:1px solid #F5C2C7;background:#FDECEE;color:#8B1A24;border-radius:10px;padding:9px 12px;margin:0 0 12px;font-size:13px}
.vj-ps-quadro{position:relative;border:1px solid var(--linha,#E4E9F2);border-radius:12px;background:#F8FAFD;padding:16px;margin-bottom:14px;display:flex;flex-direction:column;gap:14px}
.vj-ps-cab{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.vj-ps-cab b{font-size:14px}
.vj-ps-seg{display:inline-flex;border:1px solid var(--linha,#E4E9F2);border-radius:8px;overflow:hidden;background:#fff}
.vj-ps-seg button{border:none;background:#fff;font:inherit;font-size:12px;padding:5px 11px;cursor:pointer;color:var(--mut,#5A6B85)}
.vj-ps-seg button.on{background:var(--azul,#003DA5);color:#fff;font-weight:600}
.vj-ps-salvo{font-size:12px;color:var(--mut,#5A6B85);margin-left:auto}
.vj-ps-salvo.s-salvo{color:var(--ok,#0F7B4F)}
.vj-ps-salvo.s-erro{color:#8B1A24}
.vj-ps-salvar{background:var(--azul,#003DA5);color:#fff;border:none;border-radius:7px;padding:5px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.vj-ps-x{border:none;background:none;font-size:20px;line-height:1;color:var(--mut,#5A6B85);cursor:pointer;padding:0 4px}
.vj-ps-x:hover{color:#8B1A24}
.vj-ps-arq{border:1px dashed #B9C6DD;border-radius:10px;background:#fff;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.vj-ps-arq-rot{font-size:12px;font-weight:600;color:var(--mut,#5A6B85);text-transform:uppercase;letter-spacing:.4px}
.vj-ps-badge{display:inline-block;margin-left:6px;font-size:10px;font-weight:700;letter-spacing:.3px;color:#fff;background:var(--verm,#DC1C2E);border-radius:4px;padding:2px 6px;vertical-align:1px}
.vj-ps-arq-linha{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
.vj-ps-arq-btn{background:#fff;color:var(--azul,#003DA5);border:1px solid var(--azul,#003DA5);border-radius:7px;padding:6px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.vj-ps-arq-btn:disabled{opacity:.5;cursor:wait}
.vj-ps-arq-nome{font-size:13px;color:var(--azul,#003DA5);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.vj-ps-arq-nome:hover{text-decoration:underline}
.vj-ps-st{font-size:12px}
.vj-ps-st.st-enviando,.vj-ps-st.st-lendo{color:var(--azul,#003DA5)}
.vj-ps-st.st-ok{color:var(--ok,#0F7B4F);font-weight:600}
.vj-ps-st.st-erro{color:#8B1A24}
.vj-ps-dica{font-size:11px;color:var(--mut,#5A6B85)}
.vj-ps-larga{grid-column:1 / -1}
.vj-ps textarea{font:inherit;padding:9px 11px;border:1px solid var(--linha,#E4E9F2);border-radius:8px;background:#fff;color:var(--txt,#16233B);resize:vertical}
.vj-ps select:disabled{background:#F1F4F9;color:var(--mut,#5A6B85)}
.vj-ps-diverg{border:1px solid #F1D48A;background:#FFF8E6;border-radius:10px;padding:10px 12px;font-size:13px;display:flex;flex-direction:column;gap:6px}
.vj-ps-diverg-l{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}
.vj-ps-diverg-l s{color:var(--mut,#5A6B85)}
.vj-ps-diverg-ac{display:flex;gap:10px}
.vj-ps-diverg-ac button{border:none;background:none;color:var(--azul,#003DA5);text-decoration:underline;cursor:pointer;font:inherit;font-size:12px;padding:0}
.vj-ps-conj{border:1px dashed #d0a0a8;border-radius:10px;background:#fff;padding:12px;display:flex;flex-direction:column;gap:12px}
.vj-ps-conj-tit{font-weight:600;font-size:13px;color:var(--verm,#C8102E)}
.vj-ps-conj-tit small{font-weight:400;color:var(--mut,#5A6B85);margin-left:4px}
.vj-ps-imovel{border:1px solid var(--linha,#E4E9F2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
.vj-ps-link{border:none;background:none;color:var(--azul,#003DA5);cursor:pointer;font:inherit;font-size:13px;padding:0;text-decoration:underline;align-self:flex-start}
.vj-ps-add{background:#fff;color:var(--azul,#003DA5);border:1px dashed var(--azul,#003DA5);border-radius:8px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
@media (max-width:640px){.vj-ps-salvo{margin-left:0;flex-basis:100%}}
`;

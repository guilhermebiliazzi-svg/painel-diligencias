"use client";

// Partes do contrato (locadores, locatários e fiadores) com a qualificação que vai no
// texto do contrato. Cada parte recebe os documentos (RG/CNH, comprovante, certidão,
// contrato social, matrícula do imóvel do fiador): o arquivo vai para a pasta do
// contrato (categoria "Documentos das partes") e a leitura automática preenche os
// campos vazios. O que o documento traz de diferente aparece como sugestão.

import { useCallback, useEffect, useRef, useState } from "react";
import { enviarArquivo } from "@/app/_components/DocumentosContrato";
import { donoQS, type DonoRef } from "@/lib/contrato-dono";
import {
  COM_CONJUGE,
  ESTADOS_CIVIS,
  PAPEIS,
  REGIMES,
  aplicarLeitura,
  pendencias,
  resumoParte,
  rotuloDoc,
  slotsDocs,
  type Divergencia,
  type Papel,
  type Parte,
} from "@/lib/contrato-partes";

type DocParte = {
  id: number;
  parte_id: number | null;
  tipo_documento: string | null;
  nome: string;
  criado_em: string;
  lido: boolean;
  url: string | null;
};
type Item = Parte & { _key: string; _sugestao?: boolean };
type Leitura = { estado: "enviando" | "lendo" | "ok" | "erro"; msg?: string };

const vazio = (papel: Papel): Parte => ({ papel, tipo_pessoa: "PF", nome: "" });
const chave = (p: Parte, i: number) => (p.id ? `p${p.id}` : `s-${p.papel}-${i}`);
const ACEITA = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

export default function PartesContrato({
  contratoId,
  minutaId,
  onDocsMudaram,
}: {
  contratoId?: number | null;
  minutaId?: number | null; // locação ainda não assinada
  onDocsMudaram?: () => void;
}) {
  const dono: DonoRef = contratoId ? { contrato: contratoId } : { minuta: Number(minutaId) };
  const donoKey = donoQS(dono);
  const [itens, setItens] = useState<Item[]>([]);
  const [docs, setDocs] = useState<DocParte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // edição (uma parte por vez)
  const [aberta, setAberta] = useState<string | null>(null);
  const [form, setForm] = useState<Parte | null>(null);
  const [docsNovos, setDocsNovos] = useState<number[]>([]);
  const [leituras, setLeituras] = useState<Record<string, Leitura>>({});
  const [diverg, setDiverg] = useState<Divergencia[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const formRef = useRef<Parte | null>(null);
  formRef.current = form;

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/adm/contrato-partes?${donoKey}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setErro(d?.error || "Falha ao carregar as partes.");
        return;
      }
      const partes: Item[] = (d.partes || []).map((p: Parte, i: number) => ({ ...p, _key: chave(p, i) }));
      const sug: Item[] = (d.sugestoes || []).map((p: Parte, i: number) => ({ ...p, _key: chave(p, i), _sugestao: true }));
      setItens([...partes, ...sug]);
      setDocs(d.documentos || []);
      setErro(null);
    } catch {
      setErro("Erro de rede ao carregar as partes.");
    } finally {
      setCarregando(false);
    }
  }, [donoKey]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrir(it: Item | null, papel?: Papel) {
    if (form && salvando) return;
    const base: Parte = it ? { ...it } : vazio(papel || "locatario");
    delete (base as any)._key;
    delete (base as any)._sugestao;
    setForm(base);
    setAberta(it ? it._key : `novo-${papel}`);
    setDocsNovos([]);
    setLeituras({});
    setDiverg([]);
    setErroForm(null);
  }

  function fechar() {
    setAberta(null);
    setForm(null);
    setDiverg([]);
    setLeituras({});
    setErroForm(null);
  }

  const set = (campo: keyof Parte, valor: any) => setForm((f) => (f ? { ...f, [campo]: valor } : f));
  const setConj = (campo: string, valor: string) =>
    setForm((f) => (f ? { ...f, conjuge: { ...(f.conjuge || {}), [campo]: valor } } : f));
  const setImovel = (i: number, campo: string, valor: string) =>
    setForm((f) => (f ? { ...f, imoveis: (f.imoveis || []).map((x, j) => (j === i ? { ...x, [campo]: valor } : x)) } : f));

  async function enviarDoc(tipo: string, file: File) {
    if (!form) return;
    setLeituras((l) => ({ ...l, [tipo]: { estado: "enviando" } }));
    let docId: number;
    try {
      const r = await enviarArquivo(dono, file, "documentos_partes", undefined, {
        parte_id: form.id || null,
        tipo_documento: tipo,
        descricao: `${rotuloDoc(tipo)} — ${form.nome || "parte em cadastro"}`,
      });
      docId = r.id;
      if (!form.id) setDocsNovos((d) => [...d, r.id]);
    } catch (e: any) {
      setLeituras((l) => ({ ...l, [tipo]: { estado: "erro", msg: e?.message || "Falha no envio." } }));
      return;
    }
    await carregar();
    onDocsMudaram?.();

    setLeituras((l) => ({ ...l, [tipo]: { estado: "lendo" } }));
    try {
      const r = await fetch("/api/adm/contrato-partes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ler", ...dono, documento_id: docId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Não consegui ler o documento.");
      const atual = formRef.current;
      if (!atual) return; // formulário fechado enquanto lia: o arquivo ficou salvo
      const res = aplicarLeitura(atual, tipo, d.dados);
      const n = res.preenchidos.length;
      setForm(res.parte);
      setDiverg((old) => [...old.filter((x) => !res.divergencias.some((y) => y.campo === x.campo)), ...res.divergencias]);
      setLeituras((l) => ({
        ...l,
        [tipo]: { estado: "ok", msg: n ? `${n} campo${n > 1 ? "s" : ""} preenchido${n > 1 ? "s" : ""}` : "lido — confira os campos" },
      }));
      setDocs((ds) => ds.map((x) => (x.id === docId ? { ...x, lido: true } : x)));
    } catch (e: any) {
      setLeituras((l) => ({
        ...l,
        [tipo]: { estado: "erro", msg: (e?.message || "Não consegui ler o documento.") + " O arquivo ficou salvo; preencha à mão." },
      }));
    }
  }

  async function salvar() {
    if (!form || salvando) return;
    setSalvando(true);
    setErroForm(null);
    try {
      const r = await fetch("/api/adm/contrato-partes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvar", ...dono, parte: form, documentos: docsNovos }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErroForm(d?.error || "Falha ao salvar.");
        return;
      }
      fechar();
      await carregar();
      onDocsMudaram?.();
    } catch {
      setErroForm("Erro de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (!form?.id) return;
    if (!window.confirm(`Remover ${form.nome} das partes do contrato? Os documentos continuam na pasta do contrato.`)) return;
    const r = await fetch(`/api/adm/contrato-partes?id=${form.id}&${donoKey}`, { method: "DELETE" });
    if (!r.ok) {
      setErroForm((await r.json().catch(() => ({})))?.error || "Falha ao remover.");
      return;
    }
    fechar();
    await carregar();
    onDocsMudaram?.();
  }

  const docsDaParte = (p: Parte | null) =>
    docs.filter((d) => (p?.id ? d.parte_id === p.id : docsNovos.includes(d.id)));
  const fiadoresSemImovel =
    itens.some((i) => i.papel === "fiador" && !i._sugestao) &&
    !itens.some((i) => i.papel === "fiador" && (i.imoveis || []).length);

  // ---------- cartão fechado ----------
  function cartao(it: Item) {
    const ds = it.id ? docs.filter((d) => d.parte_id === it.id) : [];
    const falta = pendencias(it);
    return (
      <div key={it._key} className={"vj-pt-cartao" + (it._sugestao ? " vj-pt-sug" : "")}>
        <div className="vj-pt-cartao-txt">
          <div className="vj-pt-nome">
            {it.nome || "—"}
            <span className="vj-pt-tag">{it.tipo_pessoa === "PJ" ? "Empresa" : "Pessoa física"}</span>
          </div>
          <div className="vj-pt-resumo">{resumoParte(it) || "Sem qualificação"}</div>
          {it._sugestao ? (
            <div className="vj-pt-aviso">Veio do cadastro · complete a qualificação e salve</div>
          ) : falta.length ? (
            <div className="vj-pt-aviso">Falta: {falta.join(", ")}</div>
          ) : (
            <div className="vj-pt-okline">Qualificação completa</div>
          )}
          {ds.length > 0 && (
            <div className="vj-pt-chips">
              {ds.map((d) => (
                <a key={d.id} className="vj-pt-chip" href={d.url || undefined} target="_blank" rel="noreferrer">
                  {rotuloDoc(d.tipo_documento, true)}
                </a>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="vj-pt-btn vj-pt-btn-sec" onClick={() => abrir(it)}>
          {it._sugestao ? "Completar" : "Editar"}
        </button>
      </div>
    );
  }

  // ---------- formulário ----------
  // chamado como função (não como <Componente/>) para os campos não perderem o foco
  function formulario(key: string) {
    if (!form) return null;
    const f = form;
    const pj = f.tipo_pessoa === "PJ";
    const ds = docsDaParte(f);
    const slots = slotsDocs(f.papel, f.tipo_pessoa);
    const papelTxt = PAPEIS.find((p) => p.v === f.papel)?.t || "";
    const casado = !pj && !!f.estado_civil && COM_CONJUGE.has(f.estado_civil);
    return (
      <div key={key} className="vj-pt-form">
        <div className="vj-pt-form-cab">
          <b>{f.id ? `Editar ${papelTxt.toLowerCase()}` : `Novo ${papelTxt.toLowerCase()}`}</b>
          <div className="vj-pt-seg" role="group" aria-label="Tipo de pessoa">
            <button type="button" className={!pj ? "on" : ""} onClick={() => set("tipo_pessoa", "PF")}>Pessoa física</button>
            <button type="button" className={pj ? "on" : ""} onClick={() => set("tipo_pessoa", "PJ")}>Empresa</button>
          </div>
        </div>

        <div className="vj-pt-docs">
          <div className="vj-pt-docs-tit">
            Documentos <small>Envie PDF ou foto: os campos abaixo se preenchem sozinhos.</small>
          </div>
          <div className="vj-pt-slots">
            {slots.map((s) => {
              const enviados = ds.filter((d) => d.tipo_documento === s.tipo);
              const l = leituras[s.tipo];
              const ocupado = l?.estado === "enviando" || l?.estado === "lendo";
              return (
                <div key={s.tipo} className={"vj-pt-slot" + (enviados.length ? " tem" : "")}>
                  <div className="vj-pt-slot-rot">{s.rotulo}</div>
                  {enviados.map((d) => (
                    <a key={d.id} className="vj-pt-slot-arq" href={d.url || undefined} target="_blank" rel="noreferrer" title={d.nome}>
                      {d.nome}
                    </a>
                  ))}
                  {l && (
                    <div className={"vj-pt-slot-st st-" + l.estado}>
                      {l.estado === "enviando" ? "Enviando…" : l.estado === "lendo" ? "Lendo o documento…" : l.estado === "ok" ? "✓ " + (l.msg || "lido") : l.msg}
                    </div>
                  )}
                  <input
                    type="file"
                    accept={ACEITA}
                    hidden
                    ref={(el) => {
                      inputs.current[s.tipo] = el;
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) enviarDoc(s.tipo, file);
                    }}
                  />
                  <button type="button" className="vj-pt-slot-btn" disabled={ocupado} onClick={() => inputs.current[s.tipo]?.click()}>
                    {ocupado ? "Aguarde…" : enviados.length ? "Enviar outro" : "Enviar"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {diverg.length > 0 && (
          <div className="vj-pt-diverg">
            <b>O documento traz dados diferentes do que está preenchido:</b>
            {diverg.map((d) => (
              <div key={d.campo} className="vj-pt-diverg-l">
                <span>
                  {d.rotulo}: <s>{d.atual}</s> → <b>{d.lido}</b>
                </span>
                <span className="vj-pt-diverg-ac">
                  <button type="button" onClick={() => { setForm((x) => (x ? d.aplicar(x) : x)); setDiverg((v) => v.filter((y) => y.campo !== d.campo)); }}>Usar o do documento</button>
                  <button type="button" onClick={() => setDiverg((v) => v.filter((y) => y.campo !== d.campo))}>Manter</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="vj-grid">
          <label className="vj-f vj-pt-larga">
            <span>{pj ? "Razão social" : "Nome completo"}</span>
            <input value={f.nome || ""} onChange={(e) => set("nome", e.target.value)} />
          </label>
          <label className="vj-f">
            <span>{pj ? "CNPJ" : "CPF"}</span>
            <input value={f.cpf_cnpj || ""} onChange={(e) => set("cpf_cnpj", e.target.value)} inputMode="numeric" />
          </label>
          {!pj && (
            <>
              <label className="vj-f">
                <span>RG (com órgão emissor)</span>
                <input value={f.rg || ""} onChange={(e) => set("rg", e.target.value)} placeholder="ex.: 12.345.678-9 SSP/SP" />
              </label>
              <label className="vj-f">
                <span>Gênero</span>
                <select value={f.genero || ""} onChange={(e) => set("genero", e.target.value || null)}>
                  <option value="">—</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
                <small>Para o texto sair “o locatário” ou “a locatária”.</small>
              </label>
              <label className="vj-f">
                <span>Nacionalidade</span>
                <input value={f.nacionalidade || ""} onChange={(e) => set("nacionalidade", e.target.value)} placeholder="ex.: brasileira" />
              </label>
              <label className="vj-f">
                <span>Estado civil</span>
                <select value={f.estado_civil || ""} onChange={(e) => set("estado_civil", e.target.value || null)}>
                  <option value="">—</option>
                  {ESTADOS_CIVIS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                </select>
              </label>
              {casado && (
                <label className="vj-f">
                  <span>Regime de bens</span>
                  <select value={f.regime_bens || ""} onChange={(e) => set("regime_bens", e.target.value || null)}>
                    <option value="">—</option>
                    {REGIMES.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                  </select>
                </label>
              )}
              <label className="vj-f">
                <span>Profissão</span>
                <input value={f.profissao || ""} onChange={(e) => set("profissao", e.target.value)} />
              </label>
            </>
          )}
          <label className="vj-f">
            <span>E-mail</span>
            <input type="email" value={f.email || ""} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label className="vj-f">
            <span>Telefone</span>
            <input value={f.telefone || ""} onChange={(e) => set("telefone", e.target.value)} />
          </label>
          <label className="vj-f vj-pt-larga">
            <span>{pj ? "Endereço da sede" : "Endereço completo"}</span>
            <input value={f.endereco || ""} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua, número, complemento, bairro, cidade/UF, CEP" />
          </label>
          {pj && (
            <label className="vj-f vj-pt-larga">
              <span>Representação</span>
              <textarea rows={3} value={f.representacao || ""} onChange={(e) => set("representacao", e.target.value)} placeholder="neste ato representada por seu sócio administrador Fulano de Tal, brasileiro, casado, empresário, RG …, CPF …" />
              <small>Sai no contrato logo depois da qualificação da empresa.</small>
            </label>
          )}
        </div>

        {casado && (
          <div className="vj-pt-sub">
            <div className="vj-pt-sub-tit">
              Cônjuge{" "}
              <small>{f.papel === "fiador" ? "Assina o contrato dando a outorga da fiança." : "Opcional para locador e locatário."}</small>
            </div>
            <div className="vj-grid">
              <label className="vj-f vj-pt-larga">
                <span>Nome completo</span>
                <input value={f.conjuge?.nome || ""} onChange={(e) => setConj("nome", e.target.value)} />
              </label>
              <label className="vj-f"><span>CPF</span><input value={f.conjuge?.cpf || ""} onChange={(e) => setConj("cpf", e.target.value)} /></label>
              <label className="vj-f"><span>RG</span><input value={f.conjuge?.rg || ""} onChange={(e) => setConj("rg", e.target.value)} /></label>
              <label className="vj-f"><span>Nacionalidade</span><input value={f.conjuge?.nacionalidade || ""} onChange={(e) => setConj("nacionalidade", e.target.value)} /></label>
              <label className="vj-f"><span>Profissão</span><input value={f.conjuge?.profissao || ""} onChange={(e) => setConj("profissao", e.target.value)} /></label>
            </div>
          </div>
        )}

        {f.papel === "fiador" && (
          <div className="vj-pt-sub">
            <div className="vj-pt-sub-tit">
              Imóvel dado em garantia <small>Vem da matrícula enviada acima. Se o casal for fiador, basta em um dos dois.</small>
            </div>
            {(f.imoveis || []).map((im, i) => (
              <div key={i} className="vj-pt-imovel">
                <div className="vj-grid">
                  <label className="vj-f vj-pt-larga"><span>Cartório de registro de imóveis</span><input value={im.cartorio || ""} onChange={(e) => setImovel(i, "cartorio", e.target.value)} /></label>
                  <label className="vj-f"><span>Matrícula</span><input value={im.matricula || ""} onChange={(e) => setImovel(i, "matricula", e.target.value)} /></label>
                  <label className="vj-f vj-pt-larga">
                    <span>Descrição do imóvel</span>
                    <textarea rows={4} value={im.descricao || ""} onChange={(e) => setImovel(i, "descricao", e.target.value)} />
                  </label>
                </div>
                <button type="button" className="vj-pt-link" onClick={() => set("imoveis", (f.imoveis || []).filter((_, j) => j !== i))}>Tirar este imóvel</button>
              </div>
            ))}
            <button type="button" className="vj-pt-link" onClick={() => set("imoveis", [...(f.imoveis || []), { cartorio: "", matricula: "", descricao: "" }])}>
              + Adicionar imóvel à mão
            </button>
          </div>
        )}

        {erroForm && <div className="vj-pt-erro">{erroForm}</div>}
        <div className="vj-pt-form-acoes">
          <button type="button" className="vj-pt-btn" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : f.id ? "Salvar" : `Salvar ${papelTxt.toLowerCase()}`}
          </button>
          <button type="button" className="vj-pt-link" onClick={fechar} disabled={salvando}>Cancelar</button>
          {f.id && (
            <button type="button" className="vj-pt-link vj-pt-perigo" onClick={remover} disabled={salvando}>
              Remover do contrato
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="vj-card vj-pt" id="partes-contrato">
      <div className="vj-pt-cab">
        <h2 className="vj-h2" style={{ margin: 0 }}>Partes do contrato</h2>
        {carregando && <small className="vj-pt-mut">carregando…</small>}
      </div>
      <p className="vj-pt-mut vj-pt-intro">
        Qualificação de quem assina o contrato de locação. Envie os documentos de cada pessoa e os campos se preenchem
        sozinhos; os arquivos ficam em Documentos do contrato.
      </p>
      {erro && <div className="vj-pt-erro">{erro}</div>}

      {PAPEIS.map((p) => {
        const lista = itens.filter((i) => i.papel === p.v);
        const novoAberto = aberta === `novo-${p.v}`;
        return (
          <div key={p.v} className="vj-pt-grupo">
            <div className="vj-pt-grupo-tit">
              {p.plural}
              {p.v === "fiador" && <small> · só quando a garantia for fiança</small>}
            </div>
            {lista.map((it) => (aberta === it._key ? formulario(it._key) : cartao(it)))}
            {novoAberto ? (
              formulario(`novo-${p.v}`)
            ) : (
              <button type="button" className="vj-pt-add" onClick={() => abrir(null, p.v)} disabled={!!aberta && salvando}>
                {p.novo}
              </button>
            )}
            {p.v === "fiador" && fiadoresSemImovel && <div className="vj-pt-aviso">Nenhum fiador tem imóvel em garantia: envie a matrícula.</div>}
          </div>
        );
      })}
      <style dangerouslySetInnerHTML={{ __html: CSS_PT }} />
    </section>
  );
}

const CSS_PT = `
.vj-pt-cab{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.vj-pt-intro{margin:6px 0 16px;font-size:13px}
.vj-pt-mut{color:var(--mut,#5A6B85)}
.vj-pt-erro{border:1px solid #F5C2C7;background:#FDECEE;color:#8B1A24;border-radius:10px;padding:9px 12px;margin:10px 0;font-size:13px}
.vj-pt-grupo{border-top:1px solid var(--linha,#E4E9F2);padding:14px 0 6px;display:flex;flex-direction:column;gap:8px}
.vj-pt-grupo:first-of-type{border-top:none;padding-top:0}
.vj-pt-grupo-tit{font-size:12px;font-weight:700;color:var(--mut,#5A6B85);text-transform:uppercase;letter-spacing:.5px}
.vj-pt-grupo-tit small{font-weight:500;text-transform:none;letter-spacing:0}
.vj-pt-cartao{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--linha,#E4E9F2);border-radius:12px;padding:12px 14px;background:#fff}
.vj-pt-sug{border-style:dashed;background:#FBFCFE}
.vj-pt-cartao-txt{min-width:0;display:flex;flex-direction:column;gap:3px}
.vj-pt-nome{font-weight:600;font-size:15px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vj-pt-tag{font-size:11px;font-weight:600;color:var(--azul,#003DA5);background:#EEF3FC;border-radius:20px;padding:2px 8px}
.vj-pt-resumo{font-size:13px;color:var(--mut,#5A6B85);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vj-pt-aviso{font-size:12px;color:#7A5B00}
.vj-pt-okline{font-size:12px;color:var(--ok,#0F7B4F)}
.vj-pt-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.vj-pt-chip{font-size:11px;font-weight:600;color:var(--ok,#0F7B4F);background:#EAF7F0;border-radius:6px;padding:3px 8px;text-decoration:none}
.vj-pt-chip:hover{text-decoration:underline}
.vj-pt-btn{background:var(--azul,#003DA5);color:#fff;border:none;border-radius:8px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.vj-pt-btn:disabled{opacity:.5;cursor:not-allowed}
.vj-pt-btn-sec{background:#fff;color:var(--azul,#003DA5);border:1px solid var(--azul,#003DA5)}
.vj-pt-add{align-self:flex-start;background:#fff;color:var(--azul,#003DA5);border:1px dashed var(--azul,#003DA5);border-radius:8px;padding:7px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.vj-pt-add:disabled{opacity:.5;cursor:not-allowed}
.vj-pt-link{border:none;background:none;color:var(--azul,#003DA5);cursor:pointer;font:inherit;font-size:13px;padding:0;text-decoration:underline;align-self:flex-start}
.vj-pt-perigo{color:#8B1A24;margin-left:auto}
.vj-pt-form{border:1px solid var(--azul,#003DA5);border-radius:12px;padding:16px;background:#fff;display:flex;flex-direction:column;gap:14px;box-shadow:0 2px 10px rgba(0,61,165,.06)}
.vj-pt-form-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.vj-pt-seg{display:inline-flex;border:1px solid var(--linha,#E4E9F2);border-radius:8px;overflow:hidden}
.vj-pt-seg button{border:none;background:#fff;font:inherit;font-size:13px;padding:6px 12px;cursor:pointer;color:var(--mut,#5A6B85)}
.vj-pt-seg button.on{background:var(--azul,#003DA5);color:#fff;font-weight:600}
.vj-pt-docs{background:#F7FAFF;border:1px solid var(--linha,#E4E9F2);border-radius:10px;padding:12px}
.vj-pt-docs-tit{font-size:13px;font-weight:600;margin-bottom:10px}
.vj-pt-docs-tit small{font-weight:400;color:var(--mut,#5A6B85);margin-left:6px}
.vj-pt-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.vj-pt-slot{border:1px dashed #B9C6DD;border-radius:9px;background:#fff;padding:10px;display:flex;flex-direction:column;gap:6px;min-width:0}
.vj-pt-slot.tem{border-style:solid;border-color:#BCE3D0}
.vj-pt-slot-rot{font-size:12px;font-weight:600}
.vj-pt-slot-arq{font-size:12px;color:var(--azul,#003DA5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.vj-pt-slot-arq:hover{text-decoration:underline}
.vj-pt-slot-st{font-size:12px}
.vj-pt-slot-st.st-enviando,.vj-pt-slot-st.st-lendo{color:var(--azul,#003DA5)}
.vj-pt-slot-st.st-ok{color:var(--ok,#0F7B4F);font-weight:600}
.vj-pt-slot-st.st-erro{color:#8B1A24}
.vj-pt-slot-btn{align-self:flex-start;background:#fff;color:var(--azul,#003DA5);border:1px solid var(--azul,#003DA5);border-radius:7px;padding:4px 10px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.vj-pt-slot-btn:disabled{opacity:.5;cursor:wait}
.vj-pt-diverg{border:1px solid #F1D48A;background:#FFF8E6;border-radius:10px;padding:10px 12px;font-size:13px;display:flex;flex-direction:column;gap:6px}
.vj-pt-diverg-l{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}
.vj-pt-diverg-l s{color:var(--mut,#5A6B85)}
.vj-pt-diverg-ac{display:flex;gap:10px}
.vj-pt-diverg-ac button{border:none;background:none;color:var(--azul,#003DA5);text-decoration:underline;cursor:pointer;font:inherit;font-size:12px;padding:0}
.vj-pt-larga{grid-column:1 / -1}
.vj-pt-form textarea{font:inherit;padding:9px 11px;border:1px solid var(--linha,#E4E9F2);border-radius:8px;background:#fff;color:var(--txt,#16233B);resize:vertical}
.vj-pt-form textarea:focus{outline:2px solid var(--azul,#003DA5);outline-offset:1px;border-color:var(--azul,#003DA5)}
.vj-pt-sub{border-top:1px solid var(--linha,#E4E9F2);padding-top:12px;display:flex;flex-direction:column;gap:10px}
.vj-pt-sub-tit{font-size:13px;font-weight:600}
.vj-pt-sub-tit small{font-weight:400;color:var(--mut,#5A6B85);margin-left:4px}
.vj-pt-imovel{border:1px solid var(--linha,#E4E9F2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
.vj-pt-form-acoes{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
@media (max-width:640px){.vj-pt-cartao{flex-direction:column;align-items:stretch}.vj-pt-perigo{margin-left:0}}
`;

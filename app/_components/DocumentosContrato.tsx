"use client";

// Pasta de documentos do contrato de locação (uso interno).
// - Com contratoId: lista/abre/renomeia/exclui e envia na hora.
// - Sem contratoId (tela "Novo contrato"): guarda os arquivos numa fila; a tela chama
//   ref.enviarFila(id) depois de criar o contrato.
// O arquivo vai DIRETO do navegador para o Storage (URL assinada) — sem limite da Vercel.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CATEGORIAS_DOC, TIPOS_SEGURO, nomeTipoSeguro, ALERTA_APOLICE_DIAS, mesCurto } from "@/lib/contrato-documentos";

type Doc = {
  id: number;
  categoria: string;
  seguro_id: number | null;
  descricao: string | null;
  nome: string;
  tamanho: number | null;
  mime: string | null;
  enviado_por: string | null;
  criado_em: string;
  url: string | null;
};
type Seguro = {
  id: number;
  tipo: string;
  seguradora: string | null;
  numero_apolice: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
  dias: number | null;
  cobrar_no_boleto?: boolean;
  valor_mensal?: number | string | null;
  parcelas_total?: number | string | null;
  cobranca_inicio?: string | null;
  premio?: number | string | null;
};
type Apolice = {
  seguro_id?: number | null;
  tipo?: string;
  seguradora?: string;
  numero_apolice?: string;
  vigencia_inicio?: string;
  vigencia_fim?: string;
};
type ItemFila = { key: string; file: File; categoria: string; apolice?: Apolice };

export type DocumentosContratoHandle = {
  temFila: () => boolean;
  // vinculos: apólice nova da fila desse tipo vai para o seguro já criado (ex.: { residencial: 12 })
  enviarFila: (contratoId: number, vinculos?: Record<string, number>) => Promise<{ enviados: number; falhas: string[] }>;
};

const LIMITE_BYTES = 50 * 1024 * 1024; // limite padrão do Supabase Storage

const fmtData = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
const fmtTam = (n: number | null) =>
  n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

async function enviarArquivo(contratoId: number, file: File, categoria: string, apolice?: Apolice) {
  if (file.size > LIMITE_BYTES) throw new Error(`${file.name}: arquivo acima de 50 MB.`);
  const r1 = await fetch("/api/adm/contrato-documentos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "upload-url", contrato: contratoId, categoria, nome: file.name }),
  });
  const d1 = await r1.json().catch(() => ({}));
  if (!r1.ok) throw new Error(d1?.error || "Falha ao preparar o envio.");

  const r2 = await fetch(d1.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!r2.ok) throw new Error(`${file.name}: falha no envio do arquivo (HTTP ${r2.status}).`);

  const r3 = await fetch("/api/adm/contrato-documentos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      acao: "registrar",
      contrato: contratoId,
      categoria,
      path: d1.path,
      nome: file.name,
      tamanho: file.size,
      mime: file.type || null,
      apolice: categoria === "apolice" ? apolice || {} : undefined,
    }),
  });
  const d3 = await r3.json().catch(() => ({}));
  if (!r3.ok) throw new Error(d3?.error || "Falha ao registrar o documento.");
  return d3 as { id: number; seguro_id: number | null };
}

function Selo({ s }: { s: Seguro }) {
  if (!s.ativo) return <span className="vj-dc-selo vj-dc-selo-off">Encerrada</span>;
  if (s.dias == null) return <span className="vj-dc-selo vj-dc-selo-cinza">Sem vigência</span>;
  if (s.dias < 0) return <span className="vj-dc-selo vj-dc-selo-verm">Vencida há {-s.dias} d</span>;
  if (s.dias <= 7) return <span className="vj-dc-selo vj-dc-selo-verm">Vence em {s.dias} d</span>;
  if (s.dias <= ALERTA_APOLICE_DIAS) return <span className="vj-dc-selo vj-dc-selo-amar">Vence em {s.dias} d</span>;
  return <span className="vj-dc-selo vj-dc-selo-ok">Em dia</span>;
}

function resumoCobranca(s: Seguro): string {
  const brl = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;
  };
  if (!s.cobrar_no_boleto) return "Inquilino paga direto à seguradora";
  const v = brl(s.valor_mensal);
  if (!v) return "No boleto — falta o valor da parcela";
  if (s.parcelas_total) return `No boleto: ${s.parcelas_total}× de ${v}, a partir de ${mesCurto(s.cobranca_inicio || null)}`;
  return `No boleto: ${v} por mês`;
}

const DocumentosContrato = forwardRef<DocumentosContratoHandle, { contratoId: number | null }>(
  function DocumentosContrato({ contratoId }, ref) {
    const [docs, setDocs] = useState<Doc[]>([]);
    const [seguros, setSeguros] = useState<Seguro[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null); // categoria enviando
    const [fila, setFila] = useState<ItemFila[]>([]);
    const filaRef = useRef<ItemFila[]>([]);
    filaRef.current = fila;

    // formulário de apólice
    const [apAberta, setApAberta] = useState(false);
    const [ap, setAp] = useState<Apolice>({ seguro_id: null, tipo: "" });
    const [apArquivos, setApArquivos] = useState<File[]>([]);
    // edição de vigência de apólice existente
    const [editSeg, setEditSeg] = useState<Seguro | null>(null);

    const inputs = useRef<Record<string, HTMLInputElement | null>>({});

    const carregar = useCallback(async () => {
      if (!contratoId) return;
      setCarregando(true);
      try {
        const r = await fetch(`/api/adm/contrato-documentos?contrato=${contratoId}`, { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) setErro(d?.error || "Falha ao carregar documentos.");
        else {
          setDocs(d.documentos || []);
          setSeguros(d.seguros || []);
        }
      } catch {
        setErro("Erro de rede ao carregar documentos.");
      } finally {
        setCarregando(false);
      }
    }, [contratoId]);

    useEffect(() => {
      carregar();
    }, [carregar]);

    useImperativeHandle(
      ref,
      () => ({
        temFila: () => filaRef.current.length > 0,
        enviarFila: async (id: number, vinculos?: Record<string, number>) => {
          const falhas: string[] = [];
          let enviados = 0;
          // vários arquivos da MESMA apólice nova -> uma apólice só
          const criadas = new Map<Apolice, number>();
          for (const it of filaRef.current) {
            try {
              const vinc = it.apolice && !it.apolice.seguro_id && it.apolice.tipo ? vinculos?.[it.apolice.tipo] : undefined;
              const jaCriada = it.apolice ? criadas.get(it.apolice) ?? vinc : undefined;
              const r = await enviarArquivo(id, it.file, it.categoria, jaCriada ? { seguro_id: jaCriada } : it.apolice);
              if (it.apolice && r.seguro_id) criadas.set(it.apolice, r.seguro_id);
              enviados++;
            } catch (e: any) {
              falhas.push(e?.message || it.file.name);
            }
          }
          setFila([]);
          return { enviados, falhas };
        },
      }),
      []
    );

    async function adicionar(categoria: string, files: File[], apolice?: Apolice) {
      if (!files.length) return;
      setErro(null);
      const grandes = files.filter((f) => f.size > LIMITE_BYTES);
      if (grandes.length) {
        setErro(`Acima de 50 MB: ${grandes.map((f) => f.name).join(", ")}`);
        files = files.filter((f) => f.size <= LIMITE_BYTES);
        if (!files.length) return;
      }
      if (!contratoId) {
        setFila((q) => [
          ...q,
          ...files.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, categoria, apolice })),
        ]);
        return;
      }
      setOcupado(categoria);
      const falhas: string[] = [];
      let ap2 = apolice;
      for (const f of files) {
        try {
          const r = await enviarArquivo(contratoId, f, categoria, ap2);
          // 2º arquivo da mesma apólice nova vai pra MESMA apólice (não cria outra)
          if (categoria === "apolice" && r.seguro_id) ap2 = { seguro_id: r.seguro_id };
        } catch (e: any) {
          falhas.push(e?.message || f.name);
        }
      }
      setOcupado(null);
      if (falhas.length) setErro(falhas.join(" · "));
      await carregar();
    }

    async function renomear(d: Doc) {
      const desc = window.prompt("Descrição do documento (ex.: 1º aditivo, notificação de atraso jan/26):", d.descricao || "");
      if (desc == null) return;
      const r = await fetch(`/api/adm/contrato-documentos?id=${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: desc }),
      });
      if (!r.ok) setErro((await r.json().catch(() => ({})))?.error || "Falha ao salvar.");
      await carregar();
    }

    async function excluir(d: Doc) {
      if (!window.confirm(`Tirar "${d.nome}" da pasta do contrato?`)) return;
      const r = await fetch(`/api/adm/contrato-documentos?id=${d.id}`, { method: "DELETE" });
      if (!r.ok) setErro((await r.json().catch(() => ({})))?.error || "Falha ao excluir.");
      await carregar();
    }

    async function salvarSeguro(s: Seguro, extra?: { ativo?: boolean }, comCobranca = false) {
      if (!contratoId) return;
      const r = await fetch("/api/adm/contrato-documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "seguro",
          contrato: contratoId,
          seguro_id: s.id,
          seguradora: s.seguradora,
          numero_apolice: s.numero_apolice,
          vigencia_inicio: s.vigencia_inicio,
          vigencia_fim: s.vigencia_fim,
          ...(comCobranca
            ? {
                cobrar_no_boleto: !!s.cobrar_no_boleto,
                valor_mensal: s.valor_mensal ?? "",
                parcelas_total: s.parcelas_total ?? "",
                cobranca_inicio: s.cobranca_inicio ? String(s.cobranca_inicio).slice(0, 7) : "",
                premio: s.premio ?? "",
              }
            : {}),
          ...extra,
        }),
      });
      if (!r.ok) {
        setErro((await r.json().catch(() => ({})))?.error || "Falha ao salvar a apólice.");
        return; // mantém o formulário aberto para corrigir
      }
      setErro(null);
      setEditSeg(null);
      await carregar();
    }

    async function enviarApolice() {
      if (!apArquivos.length) {
        setErro("Escolha o arquivo da apólice.");
        return;
      }
      if (!ap.seguro_id && !ap.tipo) {
        setErro("Informe o tipo da apólice.");
        return;
      }
      await adicionar("apolice", apArquivos, ap);
      setApAberta(false);
      setAp({ seguro_id: null, tipo: "" });
      setApArquivos([]);
    }

    const soltar = (categoria: string) => (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files || []);
      if (categoria === "apolice") {
        setApArquivos(files);
        setApAberta(true);
      } else adicionar(categoria, files);
    };

    function LinhaDoc({ d }: { d: Doc }) {
      return (
        <li className="vj-dc-doc">
          <div className="vj-dc-doc-nome">
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer">{d.descricao || d.nome}</a>
            ) : (
              <span>{d.descricao || d.nome}</span>
            )}
            <small>
              {d.descricao ? d.nome + " · " : ""}
              {fmtData(d.criado_em)}
              {d.tamanho ? " · " + fmtTam(d.tamanho) : ""}
              {d.enviado_por ? " · " + d.enviado_por.split("@")[0] : ""}
            </small>
          </div>
          <div className="vj-dc-doc-acoes">
            <button type="button" onClick={() => renomear(d)} title="Descrição">✎</button>
            <button type="button" onClick={() => excluir(d)} title="Excluir">✕</button>
          </div>
        </li>
      );
    }

    function LinhaFila({ it }: { it: ItemFila }) {
      return (
        <li className="vj-dc-doc vj-dc-doc-fila">
          <div className="vj-dc-doc-nome">
            <span>{it.file.name}</span>
            <small>
              {fmtTam(it.file.size)} · será enviado ao criar o contrato
              {it.apolice?.tipo ? " · " + nomeTipoSeguro(it.apolice.tipo) : ""}
            </small>
          </div>
          <div className="vj-dc-doc-acoes">
            <button type="button" onClick={() => setFila((q) => q.filter((x) => x.key !== it.key))} title="Remover">✕</button>
          </div>
        </li>
      );
    }

    const docsDe = (cat: string) => docs.filter((d) => d.categoria === cat);
    const filaDe = (cat: string) => fila.filter((x) => x.categoria === cat);
    const segurosVisiveis = seguros.filter((s) => s.ativo || docs.some((d) => d.seguro_id === s.id));

    return (
      <section className="vj-card vj-dc">
        <div className="vj-dc-cab">
          <h2 className="vj-h2" style={{ margin: 0 }}>Documentos do contrato</h2>
          {carregando && <small className="vj-dc-mut">carregando…</small>}
        </div>
        <p className="vj-dc-mut vj-dc-intro">
          Uso interno. Clique em “Anexar” ou arraste o arquivo para o quadro. Pode anexar vários por categoria.
        </p>
        {erro && <div className="vj-dc-erro">{erro}</div>}

        <div className="vj-dc-grid">
          {CATEGORIAS_DOC.map((cat) => {
            const lista = docsDe(cat.v);
            const pend = filaDe(cat.v);
            const isAp = cat.v === "apolice";
            return (
              <div
                key={cat.v}
                className={"vj-dc-cat" + (isAp ? " vj-dc-cat-ap" : "")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={soltar(cat.v)}
              >
                <div className="vj-dc-cat-cab">
                  <div>
                    <b>{cat.t}</b>
                    {cat.dica && <small className="vj-dc-mut"> · {cat.dica}</small>}
                  </div>
                  <span className="vj-dc-conta">{lista.length + pend.length || ""}</span>
                </div>

                {isAp && (
                  <>
                    {segurosVisiveis.map((s) => (
                      <div key={s.id} className="vj-dc-seg">
                        <div className="vj-dc-seg-cab">
                          <div>
                            <b>{nomeTipoSeguro(s.tipo)}</b>
                            {s.seguradora ? ` · ${s.seguradora}` : ""}
                            {s.numero_apolice ? ` · nº ${s.numero_apolice}` : ""}
                            <small className="vj-dc-mut">
                              {" "}
                              — vigência {fmtData(s.vigencia_inicio)} → {fmtData(s.vigencia_fim)}
                            </small>
                            <div className="vj-dc-cob">{resumoCobranca(s)}</div>
                          </div>
                          <Selo s={s} />
                        </div>
                        {editSeg?.id === s.id ? (
                          <div className="vj-dc-form">
                            <label>Seguradora<input value={editSeg.seguradora ?? ""} onChange={(e) => setEditSeg({ ...editSeg, seguradora: e.target.value })} /></label>
                            <label>Nº apólice<input value={editSeg.numero_apolice ?? ""} onChange={(e) => setEditSeg({ ...editSeg, numero_apolice: e.target.value })} /></label>
                            <label>Início<input type="date" value={editSeg.vigencia_inicio ?? ""} onChange={(e) => setEditSeg({ ...editSeg, vigencia_inicio: e.target.value })} /></label>
                            <label>Fim<input type="date" value={editSeg.vigencia_fim ?? ""} onChange={(e) => setEditSeg({ ...editSeg, vigencia_fim: e.target.value })} /></label>
                            <label className="vj-dc-form-larga">
                              Como o inquilino paga
                              <select
                                value={editSeg.cobrar_no_boleto ? "boleto" : "direto"}
                                onChange={(e) => setEditSeg({ ...editSeg, cobrar_no_boleto: e.target.value === "boleto" })}
                              >
                                <option value="boleto">Cobrado no boleto do aluguel</option>
                                <option value="direto">Paga direto à seguradora (não entra no boleto)</option>
                              </select>
                            </label>
                            {editSeg.cobrar_no_boleto && (
                              <>
                                <label>Valor da parcela (R$)<input type="number" step="0.01" value={editSeg.valor_mensal ?? ""} onChange={(e) => setEditSeg({ ...editSeg, valor_mensal: e.target.value })} /></label>
                                <label>
                                  Qtde. de parcelas
                                  <input type="number" min="1" max="120" value={editSeg.parcelas_total ?? ""} onChange={(e) => setEditSeg({ ...editSeg, parcelas_total: e.target.value })} />
                                  <small className="vj-dc-mut">Em branco = todo mês (ex.: fiança).</small>
                                </label>
                                <label>1ª cobrança (mês)<input type="month" value={editSeg.cobranca_inicio ? String(editSeg.cobranca_inicio).slice(0, 7) : ""} onChange={(e) => setEditSeg({ ...editSeg, cobranca_inicio: e.target.value })} /></label>
                              </>
                            )}
                            <label>Prêmio total (R$)<input type="number" step="0.01" value={editSeg.premio ?? ""} onChange={(e) => setEditSeg({ ...editSeg, premio: e.target.value })} /></label>
                            <div className="vj-dc-form-acoes">
                              <button type="button" className="vj-dc-btn" onClick={() => salvarSeguro(editSeg, undefined, true)}>Salvar</button>
                              <button type="button" className="vj-dc-link" onClick={() => setEditSeg(null)}>Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="vj-dc-seg-acoes">
                            <button type="button" className="vj-dc-link" onClick={() => setEditSeg(s)}>Editar</button>
                            {s.ativo ? (
                              <button type="button" className="vj-dc-link" onClick={() => window.confirm("Encerrar esta apólice? Ela sai dos alertas de vencimento.") && salvarSeguro(s, { ativo: false })}>Encerrar</button>
                            ) : (
                              <button type="button" className="vj-dc-link" onClick={() => salvarSeguro(s, { ativo: true })}>Reativar</button>
                            )}
                          </div>
                        )}
                        <ul className="vj-dc-lista">
                          {lista.filter((d) => d.seguro_id === s.id).map((d) => <LinhaDoc key={d.id} d={d} />)}
                        </ul>
                      </div>
                    ))}
                    <ul className="vj-dc-lista">
                      {lista
                        .filter((d) => !d.seguro_id || !segurosVisiveis.some((s) => s.id === d.seguro_id))
                        .map((d) => <LinhaDoc key={d.id} d={d} />)}
                      {pend.map((it) => <LinhaFila key={it.key} it={it} />)}
                    </ul>

                    {apAberta ? (
                      <div className="vj-dc-form">
                        <label className="vj-dc-form-larga">
                          Apólice
                          <select
                            value={ap.seguro_id ? String(ap.seguro_id) : ""}
                            onChange={(e) => setAp({ ...ap, seguro_id: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">Nova apólice</option>
                            {seguros.filter((s) => s.ativo).map((s) => (
                              <option key={s.id} value={s.id}>
                                Anexar a: {nomeTipoSeguro(s.tipo)}{s.seguradora ? " · " + s.seguradora : ""} (vence {fmtData(s.vigencia_fim)})
                              </option>
                            ))}
                          </select>
                        </label>
                        {!ap.seguro_id && (
                          <label>
                            Tipo
                            <select value={ap.tipo || ""} onChange={(e) => setAp({ ...ap, tipo: e.target.value })}>
                              <option value="">—</option>
                              {TIPOS_SEGURO.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
                            </select>
                          </label>
                        )}
                        <label>Seguradora<input value={ap.seguradora || ""} onChange={(e) => setAp({ ...ap, seguradora: e.target.value })} /></label>
                        <label>Nº apólice<input value={ap.numero_apolice || ""} onChange={(e) => setAp({ ...ap, numero_apolice: e.target.value })} /></label>
                        <label>Vigência início<input type="date" value={ap.vigencia_inicio || ""} onChange={(e) => setAp({ ...ap, vigencia_inicio: e.target.value })} /></label>
                        <label>
                          Vigência fim
                          <input type="date" value={ap.vigencia_fim || ""} onChange={(e) => setAp({ ...ap, vigencia_fim: e.target.value })} />
                          <small className="vj-dc-mut">Alerta {ALERTA_APOLICE_DIAS} dias antes.</small>
                        </label>
                        <label className="vj-dc-form-larga">
                          Arquivo(s)
                          <input type="file" multiple onChange={(e) => setApArquivos(Array.from(e.target.files || []))} />
                          {apArquivos.length > 0 && <small className="vj-dc-mut">{apArquivos.map((f) => f.name).join(", ")}</small>}
                        </label>
                        <div className="vj-dc-form-acoes">
                          <button type="button" className="vj-dc-btn" onClick={enviarApolice} disabled={ocupado === "apolice"}>
                            {ocupado === "apolice" ? "Enviando…" : contratoId ? "Enviar apólice" : "Adicionar"}
                          </button>
                          <button type="button" className="vj-dc-link" onClick={() => { setApAberta(false); setApArquivos([]); }}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="vj-dc-btn vj-dc-btn-sec" onClick={() => setApAberta(true)}>
                        + Anexar apólice
                      </button>
                    )}
                  </>
                )}

                {!isAp && (
                  <>
                    <ul className="vj-dc-lista">
                      {lista.map((d) => <LinhaDoc key={d.id} d={d} />)}
                      {pend.map((it) => <LinhaFila key={it.key} it={it} />)}
                    </ul>
                    <input
                      type="file"
                      multiple
                      hidden
                      ref={(el) => { inputs.current[cat.v] = el; }}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = "";
                        adicionar(cat.v, files);
                      }}
                    />
                    <button
                      type="button"
                      className="vj-dc-btn vj-dc-btn-sec"
                      disabled={ocupado === cat.v}
                      onClick={() => inputs.current[cat.v]?.click()}
                    >
                      {ocupado === cat.v ? "Enviando…" : "+ Anexar"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <style dangerouslySetInnerHTML={{ __html: CSS_DC }} />
      </section>
    );
  }
);

export default DocumentosContrato;

const CSS_DC = `
.vj-dc-cab{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.vj-dc-intro{margin:6px 0 14px;font-size:13px}
.vj-dc-mut{color:var(--mut,#5A6B85)}
.vj-dc-erro{border:1px solid #F5C2C7;background:#FDECEE;color:#8B1A24;border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:13px}
.vj-dc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.vj-dc-cat{border:1px solid var(--linha,#E4E9F2);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:#FBFCFE;min-width:0}
.vj-dc-cat-ap{grid-column:1 / -1;background:#F7FAFF}
.vj-dc-cat-cab{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:14px}
.vj-dc-conta{font-size:12px;font-weight:700;color:var(--azul,#003DA5)}
.vj-dc-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.vj-dc-doc{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#fff;border:1px solid var(--linha,#E4E9F2)}
.vj-dc-doc-fila{border-style:dashed;background:#FFFDF5}
.vj-dc-doc-nome{display:flex;flex-direction:column;min-width:0}
.vj-dc-doc-nome a,.vj-dc-doc-nome span{font-size:13px;font-weight:600;color:var(--azul,#003DA5);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vj-dc-doc-nome a:hover{text-decoration:underline}
.vj-dc-doc-nome small{font-size:11px;color:var(--mut,#5A6B85)}
.vj-dc-doc-acoes{display:flex;gap:4px;flex-shrink:0}
.vj-dc-doc-acoes button{border:none;background:transparent;cursor:pointer;color:var(--mut,#5A6B85);font-size:13px;padding:2px 6px;border-radius:6px}
.vj-dc-doc-acoes button:hover{background:#EEF2F8;color:var(--txt,#16233B)}
.vj-dc-btn{align-self:flex-start;background:var(--azul,#003DA5);color:#fff;border:none;border-radius:8px;padding:7px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.vj-dc-btn:disabled{opacity:.5;cursor:not-allowed}
.vj-dc-btn-sec{background:#fff;color:var(--azul,#003DA5);border:1px dashed var(--azul,#003DA5)}
.vj-dc-link{border:none;background:none;color:var(--azul,#003DA5);cursor:pointer;font:inherit;font-size:12px;padding:0;text-decoration:underline}
.vj-dc-seg{border:1px solid var(--linha,#E4E9F2);background:#fff;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.vj-dc-seg-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px}
.vj-dc-seg-acoes{display:flex;gap:14px}
.vj-dc-cob{font-size:12px;color:var(--txt,#16233B);margin-top:2px}
.vj-dc-selo{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
.vj-dc-selo-ok{background:#EAF7F0;color:#0F7B4F}
.vj-dc-selo-amar{background:#FFF8E6;color:#7A5B00}
.vj-dc-selo-verm{background:#FDECEE;color:#8B1A24}
.vj-dc-selo-cinza{background:#EEF2F8;color:#5A6B85}
.vj-dc-selo-off{background:#F1F1F1;color:#888}
.vj-dc-form{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;background:#fff;border:1px solid var(--linha,#E4E9F2);border-radius:10px;padding:12px}
.vj-dc-form label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:600;color:var(--mut,#5A6B85);text-transform:uppercase;letter-spacing:.3px}
.vj-dc-form input,.vj-dc-form select{font:inherit;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;padding:7px 9px;border:1px solid var(--linha,#E4E9F2);border-radius:7px;background:#fff;color:var(--txt,#16233B)}
.vj-dc-form small{text-transform:none;font-weight:400;letter-spacing:0}
.vj-dc-form-larga{grid-column:1 / -1}
.vj-dc-form-acoes{grid-column:1 / -1;display:flex;gap:14px;align-items:center}
@media (max-width:640px){.vj-dc-grid,.vj-dc-form{grid-template-columns:1fr}}
`;

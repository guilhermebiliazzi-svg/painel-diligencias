"use client";

// Peças do Editar contrato que alimentam o texto dos contratos gerados pelo painel:
//  - GarantiaDetalhes: seguradora e coberturas, título de capitalização, caução
//    (vão para adm_contratos.minuta.garantia; a cláusula sai do texto oficial de cada uma)
//  - CondicoesContrato: assinatura, testemunhas, multa rescisória, administração, pasta no Drive
//  - GerarContratos: pendências + botões "Contrato de locação" e "Contrato de administração"

import { useCallback, useEffect, useState } from "react";
import { CAPITALIZADORAS, COBERTURAS, SEGURADORAS, coberturasDe, type Seguradora } from "@/lib/clausulas-garantia";

type C = Record<string, any>;
type SetMin = (secao: "garantia" | "condicoes" | "administracao", campo: string, valor: any) => void;

const min = (c: C, secao: string) => ((c.minuta || {})[secao] || {}) as Record<string, any>;
const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function GarantiaDetalhes({ c, setMin }: { c: C; setMin: SetMin }) {
  const g = min(c, "garantia");
  const cat = c.garantia_categoria;
  const aluguel = num(c.valor_atual_aluguel) || num(c.valor_primeiro_aluguel);

  if (cat === "seguro_fianca") {
    const seg = (g.seguradora || "") as Seguradora | "";
    const disp = coberturasDe(seg || null);
    const cob: string[] = g.coberturas || [];
    return (
      <div className="vj-mc">
        <div className="vj-mc-tit">Para o texto do contrato <small>A cláusula sai com o texto oficial da seguradora.</small></div>
        <div className="vj-grid">
          <label className="vj-f">
            <span>Seguradora da cláusula</span>
            <select value={seg} onChange={(e) => setMin("garantia", "seguradora", e.target.value || null)}>
              <option value="">—</option>
              {SEGURADORAS.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
            </select>
          </label>
          {seg === "too" && (
            <label className="vj-f vj-check">
              <input type="checkbox" checked={g.quitacao_ville !== false} onChange={(e) => setMin("garantia", "quitacao_ville", e.target.checked)} />
              <span>Ville recebe e dá quitação das indenizações</span>
            </label>
          )}
        </div>
        {seg && (
          <div className="vj-mc-cob">
            <span className="vj-mc-rot">Coberturas adicionais contratadas</span>
            <div className="vj-mc-chips">
              {COBERTURAS.filter((x) => disp.includes(x.v)).map((x) => (
                <label key={x.v} className={"vj-mc-chip" + (cob.includes(x.v) ? " on" : "")}>
                  <input
                    type="checkbox"
                    checked={cob.includes(x.v)}
                    onChange={(e) => setMin("garantia", "coberturas", e.target.checked ? [...cob, x.v] : cob.filter((y) => y !== x.v))}
                  />
                  {x.t}
                </label>
              ))}
            </div>
            {cob.includes("pintura_externa") && <small className="vj-mc-aviso">Pintura externa: só vale para casa, com o locatário ocupando o imóvel todo.</small>}
            {cob.some((x) => x !== "multa_rescisoria") && <small className="vj-mc-mut">Danos e pintura exigem laudo de vistoria inicial assinado por locador e locatário.</small>}
          </div>
        )}
      </div>
    );
  }
  if (cat === "capitalizacao") {
    const k = g.capitalizacao || {};
    const set = (campo: string, v: any) => setMin("garantia", "capitalizacao", { ...k, [campo]: v });
    return (
      <div className="vj-mc">
        <div className="vj-mc-tit">Para o texto do contrato</div>
        <div className="vj-grid">
          <label className="vj-f">
            <span>Empresa do título</span>
            <select value={k.empresa || ""} onChange={(e) => set("empresa", e.target.value || null)}>
              <option value="">—</option>
              {CAPITALIZADORAS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
            </select>
          </label>
          <label className="vj-f">
            <span>Valor do título (R$)</span>
            <input type="number" step="0.01" value={k.valor ?? ""} onChange={(e) => set("valor", e.target.value)} />
          </label>
          <label className="vj-f">
            <span>Nº da proposta / formulário</span>
            <input value={k.proposta || ""} onChange={(e) => set("proposta", e.target.value)} />
          </label>
          {k.empresa === "porto" && (
            <label className="vj-f">
              <span>Titular, se não for o locatário</span>
              <input value={k.titular_terceiro || ""} onChange={(e) => set("titular_terceiro", e.target.value)} placeholder="deixe em branco se for o locatário" />
            </label>
          )}
        </div>
      </div>
    );
  }
  if (cat === "caucao") {
    const v = num(g.caucao?.valor);
    return (
      <div className="vj-mc">
        <div className="vj-mc-tit">Para o texto do contrato</div>
        <div className="vj-grid">
          <label className="vj-f">
            <span>Valor da caução (R$)</span>
            <input type="number" step="0.01" value={g.caucao?.valor ?? ""} onChange={(e) => setMin("garantia", "caucao", { valor: e.target.value })} />
            {aluguel ? <small>Até 3 aluguéis: {brl(aluguel * 3)}.</small> : null}
          </label>
        </div>
        {v && aluguel && v > aluguel * 3 + 0.01 ? (
          <small className="vj-mc-aviso">Acima de 3 aluguéis: a Lei 8.245/91 (art. 38, § 2º) limita a caução em dinheiro a 3 meses de aluguel.</small>
        ) : null}
      </div>
    );
  }
  if (cat === "fiador") {
    return (
      <div className="vj-mc">
        <small className="vj-mc-mut">Fiador e imóvel dado em garantia vêm de <a href="#partes-contrato">Partes do contrato</a>.</small>
      </div>
    );
  }
  if (cat === "fianca_remax_ville" || cat === "fianca_bancaria") {
    return (
      <div className="vj-mc">
        <small className="vj-mc-aviso">Esta garantia não tem cláusula no contrato gerado pelo painel.</small>
      </div>
    );
  }
  return null;
}

export function CondicoesContrato({ c, setMin, contratoId }: { c: C; setMin: SetMin; contratoId: number }) {
  const cd = min(c, "condicoes");
  const ad = min(c, "administracao");
  const test: { nome?: string; cpf?: string }[] = cd.testemunhas || [];
  const setTest = (i: number, campo: string, v: string) => {
    const l = [0, 1].map((j) => ({ ...(test[j] || {}) }));
    (l[i] as any)[campo] = v;
    setMin("condicoes", "testemunhas", l);
  };
  const [pasta, setPasta] = useState<string>("");
  const [pastaAtual, setPastaAtual] = useState<string | null>(null);
  const [pastaMsg, setPastaMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/adm/contrato-minuta?contrato=${contratoId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPastaAtual(d?.pasta_drive || null))
      .catch(() => {});
  }, [contratoId]);
  async function salvarPasta() {
    setPastaMsg(null);
    const r = await fetch("/api/adm/contrato-minuta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrato: contratoId, acao: "pasta", pasta }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setPastaMsg(d?.error || "Falha ao salvar.");
    else {
      setPastaAtual(d.pasta_drive);
      setPasta("");
      setPastaMsg(d.pasta_drive ? "Pasta salva." : "Pasta removida: o painel cria uma em Administrações.");
    }
  }

  return (
    <section className="vj-card">
      <h2 className="vj-h2">Condições do contrato</h2>
      <div className="vj-grid">
        <label className="vj-f">
          <span>Data da assinatura</span>
          <input type="date" value={cd.data_assinatura || ""} onChange={(e) => setMin("condicoes", "data_assinatura", e.target.value || null)} />
          <small>Em branco = data em que o contrato for gerado.</small>
        </label>
        <label className="vj-f">
          <span>Cidade da assinatura</span>
          <input value={cd.cidade_assinatura || ""} placeholder="São Paulo" onChange={(e) => setMin("condicoes", "cidade_assinatura", e.target.value)} />
        </label>
        <label className="vj-f">
          <span>Multa rescisória (em aluguéis)</span>
          <input type="number" min="0" value={cd.multa_rescisoria_alugueis ?? ""} placeholder="3" onChange={(e) => setMin("condicoes", "multa_rescisoria_alugueis", e.target.value)} />
        </label>
        <label className="vj-f">
          <span>Sem multa depois de (meses)</span>
          <input type="number" min="0" value={cd.isencao_multa_meses ?? ""} placeholder="12" onChange={(e) => setMin("condicoes", "isencao_multa_meses", e.target.value)} />
          <small>0 = a multa vale o contrato todo.</small>
        </label>
        <label className="vj-f vj-check">
          <input type="checkbox" checked={cd.primeiro_aluguel_ville !== false} onChange={(e) => setMin("condicoes", "primeiro_aluguel_ville", e.target.checked)} />
          <span>1º aluguel pago à Ville como intermediação</span>
        </label>
      </div>

      <div className="vj-mc-sub">Testemunhas <small>Em branco, o contrato sai com as linhas para preencher à mão.</small></div>
      <div className="vj-grid">
        {[0, 1].map((i) => (
          <div key={i} className="vj-mc-test">
            <label className="vj-f"><span>Testemunha {i + 1}</span><input value={test[i]?.nome || ""} onChange={(e) => setTest(i, "nome", e.target.value)} placeholder="Nome" /></label>
            <label className="vj-f"><span>CPF</span><input value={test[i]?.cpf || ""} onChange={(e) => setTest(i, "cpf", e.target.value)} /></label>
          </div>
        ))}
      </div>

      <div className="vj-mc-sub">Contrato de administração</div>
      <div className="vj-grid">
        <label className="vj-f">
          <span>Valor mínimo do aluguel (R$)</span>
          <input type="number" step="0.01" value={ad.valor_minimo ?? ""} placeholder={String(c.valor_atual_aluguel || c.valor_primeiro_aluguel || "")} onChange={(e) => setMin("administracao", "valor_minimo", e.target.value)} />
          <small>Em branco = valor do aluguel.</small>
        </label>
        <label className="vj-f">
          <span>Comissão se vender ao inquilino (%)</span>
          <input type="number" step="0.01" value={ad.comissao_venda ?? ""} placeholder="6" onChange={(e) => setMin("administracao", "comissao_venda", e.target.value)} />
        </label>
      </div>

      <div className="vj-mc-sub">Pasta do imóvel no Google Drive</div>
      <div className="vj-mc-pasta">
        <span className="vj-mc-mut">
          {pastaAtual ? (
            <>Pasta definida · <a href={`https://drive.google.com/drive/folders/${pastaAtual}`} target="_blank" rel="noreferrer">abrir</a></>
          ) : (
            "Sem pasta: no primeiro contrato gerado o painel cria uma em Administrações."
          )}
        </span>
        <input value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="Cole o link de uma pasta que já existe" />
        <button type="button" className="vj-mc-btn" onClick={salvarPasta} disabled={!pasta.trim()}>Usar esta pasta</button>
        {pastaMsg && <small>{pastaMsg}</small>}
      </div>
      <style dangerouslySetInnerHTML={{ __html: CSS_MC }} />
    </section>
  );
}

type Gerada = { id: number; categoria: string; nome: string; link_externo: string; criado_em: string; enviado_por: string | null };

export function GerarContratos({ contratoId, salvarAntes }: { contratoId: number; salvarAntes: () => Promise<boolean> }) {
  const [pend, setPend] = useState<{ locacao: string[]; administracao: string[] } | null>(null);
  const [geradas, setGeradas] = useState<Gerada[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<{ tipo: string; url: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/adm/contrato-minuta?contrato=${contratoId}`, { cache: "no-store" });
      const d = await r.json();
      if (r.ok) {
        setPend({ locacao: d.locacao?.pendencias || [], administracao: d.administracao?.pendencias || [] });
        setGeradas(d.geradas || []);
      }
    } catch {}
  }, [contratoId]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function gerar(tipo: "locacao" | "administracao", acao: "gdocs" | "docx") {
    setErro(null);
    setOk(null);
    setOcupado(`${tipo}-${acao}`);
    // aba aberta já no clique (o navegador bloqueia janela aberta depois de esperar a rede)
    const aba = acao === "gdocs" ? window.open("about:blank", "_blank") : null;
    try {
      if (!(await salvarAntes())) {
        aba?.close();
        setErro("Corrija o cadastro e salve antes de gerar o contrato.");
        return;
      }
      const r = await fetch("/api/adm/contrato-minuta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrato: contratoId, tipo, acao }),
      });
      if (acao === "docx") {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Falha ao gerar o .docx.");
        const blob = await r.blob();
        const nome = decodeURIComponent((r.headers.get("Content-Disposition") || "").split("filename*=UTF-8''")[1] || "contrato.docx");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nome;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.url) throw new Error(d?.error || "Falha ao gerar no Google Docs.");
        if (aba) aba.location.href = d.url;
        setOk({ tipo, url: d.url });
      }
      await carregar();
    } catch (e: any) {
      aba?.close();
      setErro(e?.message || "Falha ao gerar.");
    } finally {
      setOcupado(null);
    }
  }

  const bloco = (tipo: "locacao" | "administracao", titulo: string) => {
    const p = pend?.[tipo] || [];
    const ult = geradas.find((g) => g.categoria === (tipo === "locacao" ? "contrato_locacao" : "contrato_administracao"));
    return (
      <div className="vj-mc-gerar">
        <div className="vj-mc-gerar-cab">
          <b>{titulo}</b>
          <div className="vj-mc-acoes">
            <button type="button" className="vj-mc-btn vj-mc-prim" disabled={!!ocupado} onClick={() => gerar(tipo, "gdocs")}>
              {ocupado === `${tipo}-gdocs` ? "Gerando…" : "Gerar no Google Docs"}
            </button>
            <button type="button" className="vj-mc-btn" disabled={!!ocupado} onClick={() => gerar(tipo, "docx")}>
              {ocupado === `${tipo}-docx` ? "Gerando…" : "Baixar .docx"}
            </button>
          </div>
        </div>
        {p.length > 0 ? (
          <ul className="vj-mc-pend">
            {p.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        ) : (
          pend && <div className="vj-mc-okline">Pronto para gerar.</div>
        )}
        {ult && (
          <div className="vj-mc-mut">
            Último gerado em {new Date(ult.criado_em).toLocaleString("pt-BR")} ·{" "}
            <a href={ult.link_externo} target="_blank" rel="noreferrer">abrir no Google Docs</a>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="vj-card">
      <h2 className="vj-h2">Gerar contratos</h2>
      <p className="vj-mc-mut" style={{ margin: "0 0 12px", fontSize: 13 }}>
        O painel salva as alterações desta tela e monta o contrato com os dados do cadastro, as partes e a garantia.
        O que estiver faltando sai em branco para preencher. Cada contrato gerado fica também em Documentos do contrato.
      </p>
      {erro && <div className="vj-mc-erro">{erro}</div>}
      {ok && (
        <div className="vj-mc-sucesso">
          Contrato gerado. Se a aba não abriu, <a href={ok.url} target="_blank" rel="noreferrer">clique aqui para abrir no Google Docs</a>.
        </div>
      )}
      {bloco("locacao", "Contrato de locação")}
      {bloco("administracao", "Contrato de administração")}
      <style dangerouslySetInnerHTML={{ __html: CSS_MC }} />
    </section>
  );
}

const CSS_MC = `
.vj-mc{margin-top:14px;border-top:1px dashed var(--linha,#E4E9F2);padding-top:14px;display:flex;flex-direction:column;gap:10px}
.vj-mc-tit{font-size:13px;font-weight:600}
.vj-mc-tit small{font-weight:400;color:var(--mut,#5A6B85);margin-left:6px}
.vj-mc-rot{font-size:12px;font-weight:600;color:var(--mut,#5A6B85);text-transform:uppercase;letter-spacing:.4px}
.vj-mc-cob{display:flex;flex-direction:column;gap:8px}
.vj-mc-chips{display:flex;flex-wrap:wrap;gap:8px}
.vj-mc-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--linha,#E4E9F2);border-radius:20px;padding:5px 12px;font-size:13px;cursor:pointer;background:#fff}
.vj-mc-chip input{margin:0}
.vj-mc-chip.on{border-color:var(--azul,#003DA5);background:#EEF3FC;color:var(--azul,#003DA5);font-weight:600}
.vj-mc-aviso{color:#7A5B00;font-size:12px}
.vj-mc-mut{color:var(--mut,#5A6B85);font-size:12px}
.vj-mc-sub{font-size:13px;font-weight:600;margin:18px 0 10px;padding-top:14px;border-top:1px solid var(--linha,#E4E9F2)}
.vj-mc-sub small{font-weight:400;color:var(--mut,#5A6B85);margin-left:6px}
.vj-mc-test{display:grid;grid-template-columns:3fr 2fr;gap:10px}
.vj-mc-test>*{min-width:0}
.vj-mc-test input{width:100%;box-sizing:border-box;min-width:0}
.vj-mc-pasta{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.vj-mc-pasta>span{flex-basis:100%}
.vj-mc-pasta input{flex:1;min-width:220px;font:inherit;padding:8px 10px;border:1px solid var(--linha,#E4E9F2);border-radius:8px}
.vj-mc-btn{background:#fff;color:var(--azul,#003DA5);border:1px solid var(--azul,#003DA5);border-radius:8px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.vj-mc-btn:disabled{opacity:.5;cursor:not-allowed}
.vj-mc-prim{background:var(--azul,#003DA5);color:#fff}
.vj-mc-gerar{border:1px solid var(--linha,#E4E9F2);border-radius:12px;padding:14px;margin-top:10px;display:flex;flex-direction:column;gap:8px;background:#FBFCFE}
.vj-mc-gerar-cab{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.vj-mc-acoes{display:flex;gap:8px;flex-wrap:wrap}
.vj-mc-pend{margin:0;padding-left:18px;font-size:13px;color:#7A5B00;display:flex;flex-direction:column;gap:2px}
.vj-mc-okline{font-size:13px;color:var(--ok,#0F7B4F)}
.vj-mc-erro{border:1px solid #F5C2C7;background:#FDECEE;color:#8B1A24;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:13px}
.vj-mc-sucesso{border:1px solid #BCE3D0;background:#EAF7F0;color:var(--ok,#0F7B4F);border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:13px}
@media (max-width:640px){.vj-mc-test{grid-template-columns:1fr}}
`;

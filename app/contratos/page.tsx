"use client";

// Contratos de locação: minutas em elaboração (antes da assinatura) e contratos cadastrados.

import { useEffect, useMemo, useState } from "react";

type Minuta = { id: number; titulo: string | null; criado_por: string | null; created_at: string; updated_at: string };
type Contrato = { id: number; status: string; aluguel: number | null; inicio: string | null; uso: string | null; locatario: string; endereco: string };

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function Contratos() {
  const [minutas, setMinutas] = useState<Minuta[] | null>(null);
  const [assinadas, setAssinadas] = useState<Minuta[]>([]);
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"ativo" | "inativo" | "todos">("ativo");

  useEffect(() => {
    (async () => {
      try {
        const [rm, rc] = await Promise.all([
          fetch("/api/adm/minutas", { cache: "no-store" }),
          fetch("/api/adm/contratos/todos", { cache: "no-store" }),
        ]);
        const dm = await rm.json().catch(() => ({}));
        const dc = await rc.json().catch(() => ({}));
        if (!rm.ok || !rc.ok) setErro(dm?.error || dc?.error || "Falha ao carregar.");
        setMinutas(dm.minutas || []);
        setAssinadas(dm.assinadas || []);
        setContratos(dc.contratos || []);
      } catch {
        setErro("Erro de rede.");
      }
    })();
  }, []);

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    return (contratos || []).filter(
      (c) =>
        (filtro === "todos" || c.status === filtro) &&
        (!q || semAcento(`${c.id} ${c.endereco} ${c.locatario}`).includes(q))
    );
  }, [contratos, busca, filtro]);

  return (
    <div className="vj-wrap">
      <header className="vj-top">
        <a href="/" className="vj-mark vj-marklink">REMAX <span>Ville</span></a>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="vj-crumb">Administração · Contratos</div>
          <a href="/cobrancas" className="vj-back">Cobranças</a>
          <a href="/" className="vj-back">← Painel</a>
        </div>
      </header>

      <main className="vj-main">
        <div className="vj-head">
          <div>
            <h1 className="vj-h1">Contratos de locação</h1>
            <p className="vj-sub">Minutas em elaboração e contratos cadastrados.</p>
          </div>
          <a href="/contratos/novo" className="vj-btn-salvar">+ Nova locação</a>
        </div>

        {erro && <div className="vj-card vj-erro">{erro}</div>}

        <section className="vj-card">
          <h2 className="vj-h2">Em elaboração <small>minutas: ainda não assinadas, fora de cobranças e repasses</small></h2>
          {minutas == null ? (
            <p className="vj-mut">Carregando…</p>
          ) : minutas.length === 0 ? (
            <p className="vj-mut">
              Nenhuma minuta em elaboração. Em <b>+ Nova locação</b>, preencha e clique em <b>Salvar como minuta</b>.
            </p>
          ) : (
            <div className="vj-lista">
              {minutas.map((m) => (
                <a key={m.id} href={`/contratos/novo?minuta=${m.id}`} className="vj-linha">
                  <span className="vj-tag vj-tag-min">Minuta {m.id}</span>
                  <span className="vj-tit">{m.titulo || "Minuta sem imóvel"}</span>
                  <span className="vj-meta">
                    atualizada {quando(m.updated_at)}
                    {m.criado_por ? ` · ${m.criado_por.split("@")[0]}` : ""}
                  </span>
                  <span className="vj-ir">Abrir →</span>
                </a>
              ))}
            </div>
          )}
        </section>

        {assinadas.length > 0 && (
          <section className="vj-card">
            <h2 className="vj-h2">Assinadas · não administradas <small>a Ville só intermediou: fora de cobranças e repasses</small></h2>
            <div className="vj-lista">
              {assinadas.map((m) => (
                <a key={m.id} href={`/contratos/novo?minuta=${m.id}`} className="vj-linha">
                  <span className="vj-tag">Minuta {m.id}</span>
                  <span className="vj-tit">{m.titulo || "Minuta sem imóvel"}</span>
                  <span className="vj-meta">assinada · atualizada {quando(m.updated_at)}</span>
                  <span className="vj-ir">Abrir →</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="vj-card">
          <h2 className="vj-h2">Contratos cadastrados</h2>
          <div className="vj-filtros">
            <input placeholder="Buscar por endereço, locatário ou número" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          {contratos == null ? (
            <p className="vj-mut">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="vj-mut">Nenhum contrato encontrado.</p>
          ) : (
            <div className="vj-lista">
              {lista.map((c) => (
                <a key={c.id} href={`/contratos/editar?id=${c.id}`} className="vj-linha">
                  <span className={"vj-tag" + (c.status === "ativo" ? " vj-tag-ok" : "")}>Nº {c.id}</span>
                  <span className="vj-tit">{c.endereco || "Imóvel sem endereço"}</span>
                  <span className="vj-meta">
                    {c.locatario} · {brl(c.aluguel)}
                    {c.status !== "ativo" ? " · inativo" : ""}
                  </span>
                  <span className="vj-ir">Editar →</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

const CSS = `
.vj-wrap{--azul:#003DA5;--verm:#DC1C2E;--bg:#F4F6FA;--card:#fff;--linha:#E4E9F2;--txt:#16233B;--mut:#5A6B85;--ok:#0F7B4F;min-height:100vh;background:var(--bg);color:var(--txt);font-family:Inter,system-ui,sans-serif}
.vj-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 28px;background:var(--azul);color:#fff;flex-wrap:wrap}
.vj-mark{font-family:Archivo,sans-serif;font-weight:800;letter-spacing:.5px;color:#fff;text-decoration:none}
.vj-mark span{font-weight:400}
.vj-crumb{font-size:14px;opacity:.9}
.vj-back{color:#fff;text-decoration:none;font-size:14px;opacity:.9}
.vj-back:hover{opacity:1;text-decoration:underline}
.vj-main{max-width:900px;margin:0 auto;padding:24px 20px 60px}
.vj-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
.vj-h1{font-family:Archivo,sans-serif;font-size:28px;margin:0}
.vj-sub{color:var(--mut);margin:4px 0 0}
.vj-card{background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:20px;margin-bottom:16px}
.vj-h2{font-family:Archivo,sans-serif;font-size:17px;margin:0 0 14px;color:var(--azul)}
.vj-h2 small{font-family:Inter,system-ui,sans-serif;font-weight:400;font-size:12px;color:var(--mut);margin-left:8px}
.vj-mut{color:var(--mut);font-size:14px;margin:0}
.vj-btn-salvar{background:var(--verm);color:#fff;font-weight:600;font-size:15px;padding:11px 20px;border-radius:10px;text-decoration:none;white-space:nowrap}
.vj-btn-salvar:hover{background:#b8121f}
.vj-erro{border-color:#F5C2C7;background:#FDECEE;color:#8B1A24}
.vj-filtros{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.vj-filtros input{flex:1;min-width:220px;font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px}
.vj-filtros select{font:inherit;padding:9px 11px;border:1px solid var(--linha);border-radius:8px;background:#fff}
.vj-lista{display:flex;flex-direction:column}
.vj-linha{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"tag tit ir" "tag meta ir";column-gap:12px;row-gap:2px;align-items:center;padding:11px 8px;border-top:1px solid var(--linha);color:inherit;text-decoration:none;border-radius:8px}
.vj-linha:first-child{border-top:none}
.vj-linha:hover{background:#F6F9FE}
.vj-tag{grid-area:tag;font-size:12px;font-weight:600;color:var(--mut);background:#EEF1F6;border-radius:6px;padding:3px 8px;white-space:nowrap}
.vj-tag-ok{color:var(--ok);background:#EAF7F0}
.vj-tag-min{color:#7A5B00;background:#FFF4D6}
.vj-tit{grid-area:tit;font-weight:600;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vj-meta{grid-area:meta;font-size:12px;color:var(--mut);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vj-ir{grid-area:ir;font-size:13px;font-weight:600;color:var(--azul);white-space:nowrap}
@media (max-width:640px){.vj-head{flex-direction:column}.vj-top{padding:14px 16px}}
`;

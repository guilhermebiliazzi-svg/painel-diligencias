"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Painel de documentos do locador (boletos e comprovantes de IPTU/condomínio).
// Chave: contrato + competência. Usado na tela de Repasse e na de Cobranças;
// o portal do locador lê os mesmos documentos.

type Tipo =
  | "boleto_iptu"
  | "boleto_condominio"
  | "comprovante_iptu"
  | "comprovante_condominio";

type Doc = { nome: string | null; url: string | null; criado_em: string };

const SLOTS: { tipo: Tipo; label: string }[] = [
  { tipo: "boleto_iptu", label: "Boleto do IPTU" },
  { tipo: "boleto_condominio", label: "Boleto do condomínio" },
  { tipo: "comprovante_iptu", label: "Comprovante de pagamento — IPTU" },
  { tipo: "comprovante_condominio", label: "Comprovante de pagamento — Condomínio" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function DocumentosLocador({
  contratoId,
  competencia,
  origem,
}: {
  contratoId: number;
  competencia: string; // YYYY-MM
  origem: "cobranca" | "repasse";
}) {
  const [docs, setDocs] = useState<Record<string, Doc>>({});
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState<Tipo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Lê o vencimento do boleto anexado e avisa se for de outro mês (o boleto
  // pertence à competência do mês do seu vencimento).
  const checarVenc = useCallback(
    async (tipo: Tipo) => {
      const sub = tipo === "boleto_iptu" ? "iptu" : tipo === "boleto_condominio" ? "condominio" : null;
      if (!sub) return;
      try {
        const r = await fetch(
          `/api/adm/ler-linha-digitavel?contrato=${contratoId}&competencia=${competencia}&subtipo=${sub}`,
          { cache: "no-store" }
        );
        const d = await r.json();
        setAvisos((a) => {
          const n = { ...a };
          delete n[tipo];
          if (d.vencimento) {
            const [cy, cm] = competencia.split("-").map(Number);
            const [vy, vm] = String(d.vencimento).slice(0, 7).split("-").map(Number);
            if (vy * 12 + vm !== cy * 12 + cm) {
              const [yy, mm, dd] = String(d.vencimento).split("-");
              n[tipo] = `Vence em ${dd}/${mm}/${yy} — fora da competência ${competencia}. Confira.`;
            }
          }
          return n;
        });
      } catch {
        /* silencioso */
      }
    },
    [contratoId, competencia]
  );

  const recarregar = useCallback(async () => {
    if (!contratoId || !competencia) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(
        `/api/adm/documentos?contrato=${contratoId}&competencia=${competencia}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao carregar documentos.");
      else setDocs(d.docs || {});
    } catch {
      setErro("Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }, [contratoId, competencia]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Ao carregar/trocar boletos, revê o aviso de vencimento.
  useEffect(() => {
    (["boleto_iptu", "boleto_condominio"] as Tipo[]).forEach((t) => {
      if (docs[t]) checarVenc(t);
      else setAvisos((a) => (a[t] ? (() => { const n = { ...a }; delete n[t]; return n; })() : a));
    });
  }, [docs, checarVenc]);

  async function enviar(tipo: Tipo, file: File) {
    setOcupado(tipo);
    setErro(null);
    try {
      const data = await fileToBase64(file);
      const r = await fetch("/api/adm/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contrato_id: contratoId,
          competencia,
          tipo,
          mimeType: file.type || "application/pdf",
          nome: file.name,
          origem,
          data,
        }),
      });
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao enviar.");
      else await recarregar();
    } catch {
      setErro("Erro de rede ao enviar.");
    } finally {
      setOcupado(null);
    }
  }

  async function apagar(tipo: Tipo) {
    if (!confirm("Apagar este documento? O locador deixará de vê-lo.")) return;
    setOcupado(tipo);
    setErro(null);
    try {
      const r = await fetch(
        `/api/adm/documentos?contrato=${contratoId}&competencia=${competencia}&tipo=${tipo}`,
        { method: "DELETE" }
      );
      const d = await r.json();
      if (!r.ok) setErro(d?.error || "Falha ao apagar.");
      else await recarregar();
    } catch {
      setErro("Erro de rede ao apagar.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="vjdoc">
      <h2 className="vjdoc-h">Documentos do locador (portal)</h2>
      <p className="vjdoc-sub">
        Boletos e comprovantes de IPTU e condomínio desta competência. Ficam visíveis
        para o locador no portal, junto do recibo.
      </p>
      {erro && <div className="vjdoc-erro">{erro}</div>}
      <div className="vjdoc-grid">
        {SLOTS.map(({ tipo, label }) => {
          const doc = docs[tipo];
          const busy = ocupado === tipo;
          return (
            <div key={tipo} className={`vjdoc-slot${doc ? " tem" : ""}`}>
              <div className="vjdoc-slabel">{label}</div>
              {doc ? (
                <div className="vjdoc-file">
                  {doc.url ? (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="vjdoc-open">
                      📄 {doc.nome || "Abrir PDF"}
                    </a>
                  ) : (
                    <span className="vjdoc-open">📄 {doc.nome || "Documento"}</span>
                  )}
                  <div className="vjdoc-acts">
                    <button
                      className="vjdoc-link"
                      disabled={busy}
                      onClick={() => inputs.current[tipo]?.click()}
                    >
                      {busy ? "…" : "Trocar"}
                    </button>
                    <button
                      className="vjdoc-link vjdoc-del"
                      disabled={busy}
                      onClick={() => apagar(tipo)}
                    >
                      Apagar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="vjdoc-up"
                  disabled={busy || carregando}
                  onClick={() => inputs.current[tipo]?.click()}
                >
                  {busy ? "Enviando…" : "＋ Enviar PDF"}
                </button>
              )}
              {avisos[tipo] && <div className="vjdoc-aviso">⚠ {avisos[tipo]}</div>}
              <input
                ref={(el) => {
                  inputs.current[tipo] = el;
                }}
                type="file"
                accept="application/pdf,image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) enviar(tipo, f);
                  e.target.value = "";
                }}
              />
            </div>
          );
        })}
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.vjdoc{background:#fff;border:1px solid #E4E9F2;border-radius:14px;padding:20px;margin-bottom:16px}
.vjdoc-h{font-size:16px;margin:0 0 4px;color:#003DA5;font-weight:700}
.vjdoc-sub{font-size:13px;color:#5A6B85;margin:0 0 14px;line-height:1.45}
.vjdoc-erro{background:#FDECEE;border:1px solid #F5C2C7;color:#8B1A24;padding:9px 12px;border-radius:9px;font-size:13px;margin-bottom:12px}
.vjdoc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.vjdoc-slot{border:1px solid #E4E9F2;border-radius:11px;padding:12px 14px;background:#F8FAFD}
.vjdoc-slot.tem{background:#EAF7F0;border-color:#BCE3D0}
.vjdoc-slabel{font-size:12px;font-weight:700;color:#16233B;margin-bottom:8px}
.vjdoc-aviso{margin-top:8px;background:#FFF7E6;border:1px solid #FADFA0;color:#8a6d00;padding:6px 9px;border-radius:8px;font-size:12px;font-weight:600}
.vjdoc-file{display:flex;flex-direction:column;gap:6px}
.vjdoc-open{color:#003DA5;font-weight:600;font-size:13px;text-decoration:none;word-break:break-word}
.vjdoc-open:hover{text-decoration:underline}
.vjdoc-acts{display:flex;gap:14px}
.vjdoc-link{background:none;border:none;color:#003DA5;font:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:0}
.vjdoc-link:hover{text-decoration:underline}
.vjdoc-link:disabled{opacity:.5;cursor:default}
.vjdoc-del{color:#DC1C2E}
.vjdoc-up{width:100%;background:none;border:1px dashed #003DA5;color:#003DA5;font:inherit;font-weight:600;font-size:13px;padding:9px;border-radius:9px;cursor:pointer}
.vjdoc-up:disabled{opacity:.5;cursor:default}
@media (max-width:640px){.vjdoc-grid{grid-template-columns:1fr}}
`,
        }}
      />
    </section>
  );
}

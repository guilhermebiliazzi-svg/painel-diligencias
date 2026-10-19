// Partes, documentos e texto do contrato podem pertencer a um contrato já cadastrado
// (adm_contratos) ou a uma minuta (adm_minutas), que existe antes da assinatura.

export type DonoRef = { contrato: number } | { minuta: number };

export type Dono = {
  tipo: "contrato" | "minuta";
  id: number;
  col: "contrato_id" | "minuta_id";
  pasta: string; // prefixo no Storage
};

const idValido = (v: unknown): number | null => (/^\d+$/.test(String(v ?? "")) ? Number(v) : null);

// lê { contrato } ou { minuta } de um corpo JSON ou de URLSearchParams
export function donoDe(src: { contrato?: unknown; minuta?: unknown } | URLSearchParams): Dono | null {
  const get = (k: string) => (src instanceof URLSearchParams ? src.get(k) : (src as any)?.[k]);
  const c = idValido(get("contrato"));
  if (c) return { tipo: "contrato", id: c, col: "contrato_id", pasta: `contratos/${c}` };
  const m = idValido(get("minuta"));
  if (m) return { tipo: "minuta", id: m, col: "minuta_id", pasta: `minutas/${m}` };
  return null;
}

// contrato existe / minuta existe e ainda está em elaboração
export async function donoExiste(sb: any, d: Dono): Promise<boolean> {
  if (d.tipo === "contrato") {
    const { data } = await sb.from("adm_contratos").select("id").eq("id", d.id).maybeSingle();
    return !!data;
  }
  const { data } = await sb.from("adm_minutas").select("id,status").eq("id", d.id).maybeSingle();
  return !!data && data.status === "rascunho";
}

// navegador: "contrato=12" | "minuta=3" e o mesmo para o corpo JSON
export function donoQS(d: DonoRef): string {
  return "contrato" in d ? `contrato=${d.contrato}` : `minuta=${d.minuta}`;
}
export function donoRef(contratoId?: number | null, minutaId?: number | null): DonoRef | null {
  if (contratoId) return { contrato: contratoId };
  if (minutaId) return { minuta: minutaId };
  return null;
}

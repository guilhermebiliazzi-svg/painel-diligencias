// Helper para falar com o Banco Inter através da "ponte" (proxy autenticado
// que segura o certificado mTLS + OAuth). A ponte encaminha método + corpo
// para o path do Inter e devolve a resposta.
//
//   GET/POST  ${PONTE_INTER_URL}?auth=<token>&path=<path Inter>&idem=<uuid>&conta=<cc>
//
// idem  -> vira header x-id-idempotente (idempotência de pagamentos Pix)
// conta -> vira header x-conta-corrente  (quando a app tem mais de uma conta)

const PONTE_BASE = process.env.PONTE_INTER_URL || "https://ponte-inter-api.onrender.com";

export type InterResposta<T = any> = {
  ok: boolean;
  status: number;
  data: T | null;
  raw: string;
  error?: string;
};

export async function interFetch<T = any>(
  interPath: string,
  opts: {
    method?: "GET" | "POST" | "DELETE" | "PUT";
    body?: unknown;
    idem?: string;
    conta?: string;
    timeoutMs?: number;
  } = {}
): Promise<InterResposta<T>> {
  const auth = process.env.PONTE_INTER_TOKEN;
  if (!auth) {
    return { ok: false, status: 500, data: null, raw: "", error: "PONTE_INTER_TOKEN não configurado." };
  }
  const { method = "GET", body, idem, conta, timeoutMs = 90000 } = opts;

  const qs = new URLSearchParams({ auth, path: interPath });
  if (idem) qs.set("idem", idem);
  if (conta) qs.set("conta", conta);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${PONTE_BASE}?${qs.toString()}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body != null ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      raw,
      error: res.ok ? undefined : (data?.error || data?.message || raw.slice(0, 300) || `HTTP ${res.status}`),
    };
  } catch (e: any) {
    return { ok: false, status: 502, data: null, raw: "", error: e?.name === "AbortError" ? "Timeout ao falar com a ponte do Inter." : String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

// UUID v4 sem dependência externa (Node 18+ tem crypto.randomUUID).
export function novoUuid(): string {
  try {
    // @ts-ignore
    return crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

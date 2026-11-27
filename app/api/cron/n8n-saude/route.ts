// 27/11/2026 · Monitor do n8n auto-hospedado (VPS Hostinger, n8n.villejardins.com.br).
// A Vercel chama esta rota a cada 5 minutos (vercel.json → crons). Se o n8n não responder
// em duas tentativas seguidas, manda e-mail de alerta.
// Sem estado gravado: enquanto o n8n estiver fora, o alerta sai no máximo a cada 15 minutos
// (só nas checagens dos minutos 0–4, 15–19, 30–34 e 45–49 de cada hora).
import { NextResponse } from "next/server";
import { enviarEmail, mailerConfigurado } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALVO = process.env.N8N_SAUDE_URL || "https://n8n.villejardins.com.br/healthz";
const DESTINO = process.env.ALERTA_N8N_EMAIL || "guilhermebiliazzi@remax.com.br";

async function checar(): Promise<{ ok: boolean; detalhe: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(ALVO, { cache: "no-store", signal: ctl.signal });
    const corpo = (await r.text()).slice(0, 200);
    return { ok: r.ok && /ok/i.test(corpo), detalhe: `HTTP ${r.status} ${corpo}` };
  } catch (e) {
    return { ok: false, detalhe: (e as Error).name === "AbortError" ? "sem resposta em 10 s" : (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

function chamadaDaVercel(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (segredo) return req.headers.get("authorization") === `Bearer ${segredo}`;
  return /vercel-cron/i.test(req.headers.get("user-agent") || "");
}

export async function GET(req: Request) {
  let c = await checar();
  if (!c.ok) {
    await new Promise((r) => setTimeout(r, 20_000));
    c = await checar();
  }
  if (c.ok) return NextResponse.json({ ok: true, alvo: ALVO });

  const minuto = new Date().getUTCMinutes() % 15;
  const alerta = chamadaDaVercel(req) && minuto < 5 && mailerConfigurado();
  if (alerta) {
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await enviarEmail({
      to: DESTINO,
      subject: "⚠️ n8n fora do ar (VPS)",
      text:
        `O n8n da VPS não respondeu em duas tentativas (${quando}).\n` +
        `Endereço: ${ALVO}\nDetalhe: ${c.detalhe}\n\n` +
        `O que fazer: abrir o hPanel da Hostinger → VPS → Gerenciador Docker → projeto ville-n8n e reiniciar. ` +
        `Se a VPS inteira estiver parada, reiniciar pela Visão geral.\n` +
        `Este aviso se repete a cada 15 minutos enquanto o n8n estiver fora.`,
      html:
        `<p>O n8n da VPS <b>não respondeu</b> em duas tentativas (${quando}).</p>` +
        `<p>Endereço: ${ALVO}<br>Detalhe: ${c.detalhe.replace(/</g, "&lt;")}</p>` +
        `<p><b>O que fazer:</b> abrir o hPanel da Hostinger → VPS → Gerenciador Docker → projeto <i>ville-n8n</i> e reiniciar. ` +
        `Se a VPS inteira estiver parada, reiniciar pela Visão geral.</p>` +
        `<p style="color:#666">Este aviso se repete a cada 15 minutos enquanto o n8n estiver fora.</p>`,
    });
  }
  return NextResponse.json({ ok: false, alvo: ALVO, detalhe: c.detalhe, alerta }, { status: 503 });
}

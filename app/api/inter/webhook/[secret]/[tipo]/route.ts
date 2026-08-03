import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { salvarComprovantePix } from "@/lib/salvar-comprovante";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook do Banco Inter para pagamentos (pix-pagamento / boleto-pagamento).
// URL registrada no Inter:
//   https://painel.villejardins.com.br/api/inter/webhook/<SECRET>/pix-pagamento
// O <SECRET> na URL é a proteção (só o Inter conhece a URL que registramos).
//
// Callback pix-pagamento traz: codigoSolicitacao, endToEnd, status ("PROCESSADO"),
// valor, recebedor, dataHoraMovimento. O Inter pode reenviar; tratamos idempotente.

function processado(status: string) {
  return /PROCESSAD|EFETIVAD|REALIZAD|PAGO|CONCLU/.test(String(status).toUpperCase());
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string; tipo: string }> }) {
  const { secret, tipo } = await ctx.params;
  if (!process.env.INTER_WEBHOOK_SECRET || secret !== process.env.INTER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // corpo inválido: aceita p/ Inter não reenviar em loop
  }
  const eventos: any[] = Array.isArray(body) ? body : [body];
  const adm = supabaseAdmin();

  for (const ev of eventos) {
    try {
      if (tipo === "pix-pagamento") {
        const codigo = ev.codigoSolicitacao || ev.codigo || null;
        if (!codigo) continue;
        const { data: pgs } = await adm
          .from("adm_pagamentos")
          .select("id,status,repasse_id")
          .eq("tipo", "pix_repasse")
          .eq("inter_codigo", codigo)
          .limit(1);
        const pg = pgs?.[0];
        if (!pg) continue;

        const status = String(ev.status || "").toUpperCase();
        const efetivado = processado(status);
        const e2e = ev.endToEnd || ev.endToEndId || null;
        const dataHora = ev.dataHoraMovimento || ev.dataHoraSolicitacao || null;

        await adm
          .from("adm_pagamentos")
          .update({
            status: efetivado ? "efetivado" : pg.status,
            inter_status: status || null,
            inter_retorno: ev,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", pg.id);

        if (efetivado) {
          if (pg.repasse_id) {
            const upd: any = { updated_at: new Date().toISOString() };
            if (e2e) upd.pix_e2e_id = e2e;
            upd.data_pagamento = String(dataHora || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
            await adm.from("adm_repasses").update(upd).eq("id", pg.repasse_id);
          }
          await salvarComprovantePix(pg.id, { endToEnd: e2e, dataHora });
        }
      } else if (tipo === "boleto-pagamento") {
        const codigo = ev.codigoTransacao || null;
        if (!codigo) continue;
        const status = String(ev.status || ev.statusPagamento || "").toUpperCase();
        const efetivado = processado(status);
        const upd: any = { inter_status: status || null, inter_retorno: ev, atualizado_em: new Date().toISOString() };
        if (efetivado) upd.status = "efetivado";
        await adm.from("adm_pagamentos").update(upd).eq("tipo", "boleto").eq("inter_codigo", codigo);
      }
    } catch (e) {
      // não falha o webhook inteiro por causa de um evento
    }
  }

  return NextResponse.json({ ok: true });
}

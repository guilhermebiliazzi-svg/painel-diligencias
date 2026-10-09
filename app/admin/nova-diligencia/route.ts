// app/admin/nova-diligencia/route.ts
// Formulário "Nova diligência" servido pelo painel (antes só pelo link do n8n).
//
// O HTML continua mantido num lugar só: o WF-01 do n8n (nó "Responder com HTML").
// A cada abertura o painel busca esse HTML e troca os endereços que ele monta a
// partir da própria URL, para que o navegador chame os webhooks do n8n direto.
// Os envios NÃO passam pela Vercel de propósito: os documentos dos vendedores e
// compradores vão em base64 no JSON e estourariam o limite de 4,5 MB da Vercel.
//
// Acesso: /admin/* exige login + pode_diligencias (proxy.ts).
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const N8N = (process.env.N8N_WEBHOOK_BASE || 'https://villejds.app.n8n.cloud/webhook').replace(/\/+$/, '');

// [trecho no HTML do n8n, troca]. Hoje: 2 ocorrências de cada.
//  - href.replace('/nova-diligencia', X) -> OCR (WF-12), submit e editar
//  - origin + '/webhook/'                -> buscar/carregar diligência p/ editar
const TROCAS: [string, string][] = [
  ["window.location.href.replace('/nova-diligencia',", "(N8N_BASE + '/nova-diligencia').replace('/nova-diligencia',"],
  ["window.location.origin + '/webhook/", "N8N_BASE + '/"],
];

const BARRA =
  '<div style="max-width:680px;margin:0 auto 14px;font-size:13px;display:flex;justify-content:space-between;align-items:center">' +
  '<a href="/admin" style="color:#475569;text-decoration:none">← Voltar às diligências</a>' +
  '<span style="color:#94a3b8">Painel REMAX Ville</span></div>';

function pagina(status: number, titulo: string, texto: string) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titulo}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:40px 16px;color:#1a1a1a">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:24px">
<h1 style="font-size:18px;margin:0 0 8px">${titulo}</h1><p style="font-size:14px;color:#555;margin:0 0 16px">${texto}</p>
<a href="/admin/nova-diligencia" style="color:#c8102e">Tentar de novo</a> · <a href="/admin" style="color:#475569">Voltar às diligências</a>
</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  let html: string;
  try {
    const r = await fetch(`${N8N}/nova-diligencia`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`n8n respondeu ${r.status}`);
    html = await r.text();
  } catch (e) {
    console.error('[nova-diligencia] falha ao buscar o formulário no n8n:', e);
    return pagina(502, 'Formulário indisponível', 'Não foi possível carregar o formulário agora (o n8n não respondeu). Tente de novo em alguns segundos.');
  }
  if (!/<form|submitForm|Nova Dilig/i.test(html)) {
    return pagina(502, 'Formulário indisponível', 'O n8n respondeu algo inesperado no lugar do formulário.');
  }

  for (const [de, para] of TROCAS) html = html.split(de).join(para);

  // Se o HTML do n8n mudou e sobrou algum endereço relativo, o envio cairia no
  // painel (404). Melhor avisar na tela do que perder o cadastro.
  const sobrou = /window\.location\.(href\.replace\(|origin\s*\+\s*['"]\/webhook)/.test(html);
  const aviso = sobrou
    ? '<div style="max-width:680px;margin:0 auto 14px;padding:10px 12px;border-radius:8px;background:#fdecea;color:#b71c1c;border:1px solid #f5c2c0;font-size:13px">' +
      'Atenção: o formulário foi alterado no n8n e esta versão do painel pode não conseguir enviar. Avise o suporte antes de usar.</div>'
    : '';

  const cfg = `<script>var N8N_BASE = ${JSON.stringify(N8N)};</script>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + cfg) : cfg + html;
  html = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + BARRA + aviso) : html;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}

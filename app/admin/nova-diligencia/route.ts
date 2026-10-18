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
import { acessoDiligencias, podeVerDiligencia } from '@/lib/diligencia-acesso';

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

// Perfil Corretor (alcance "proprias"):
//  - esconde o "Editar diligência existente" (a busca do n8n lista todas);
//  - depois de enviar, avisa o painel para marcar a diligência como dele
//    (/api/adm/diligencia-criada), com novas tentativas enquanto o WF-01 grava.
const SCRIPT_CORRETOR = `<script>(function(){
function esconderEditar(){var b=document.getElementById('busca-dilig');var n=b;while(n&&n.parentElement&&!(n.querySelector&&n.querySelector('h2')))n=n.parentElement;if(n&&b)n.style.display='none';}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',esconderEditar);else esconderEditar();
var ESPERAS=[2000,4000,8000,15000,30000];
function marcar(end,i){fetch('/api/adm/diligencia-criada',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endereco:end}),credentials:'same-origin'})
.then(function(r){return r.json();}).then(function(j){if(!j.ok&&i<ESPERAS.length)setTimeout(function(){marcar(end,i+1);},ESPERAS[i]);})
.catch(function(){if(i<ESPERAS.length)setTimeout(function(){marcar(end,i+1);},ESPERAS[i]);});}
var orig=window.fetch;
window.fetch=function(u,o){var p=orig.apply(this,arguments);
try{var url=String(u&&u.url?u.url:u);if(/\\/nova-diligencia-submit(\\?|$)/.test(url)&&o&&typeof o.body==='string'){var b={};try{b=JSON.parse(o.body);}catch(e){}
p.then(function(r){if(r&&r.ok&&b.endereco)setTimeout(function(){marcar(b.endereco,0);},1500);}).catch(function(){});}}catch(e){}
return p;};
})();</script>`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Botão "Editar diligência" (tela da diligência): /admin/nova-diligencia?editar=<id>
// abre este mesmo formulário já carregado com a diligência (a mesma função
// carregarDiligencia do "Editar diligência existente"), com título de edição e
// a busca escondida.
function scriptEditar(id: string) {
  return `<script>(function(){
var ID=${JSON.stringify(id)};
function iniciar(){
  try{var h=document.querySelector('.card h1');if(h)h.textContent='Editar diligência';
  var sub=document.querySelector('.card .subtitle');if(sub)sub.textContent='RE/MAX Ville — confira e ajuste os dados do imóvel e dos vendedores';
  var b=document.getElementById('busca-dilig');var n=b;while(n&&n.parentElement&&!(n.querySelector&&n.querySelector('h2')))n=n.parentElement;
  if(n&&b){for(var i=0;i<n.children.length;i++){var c=n.children[i];if(c.id!=='edit-aviso')c.style.display='none';}n.style.padding='0';n.style.border='0';n.style.background='transparent';}}catch(e){}
  if(typeof carregarDiligencia==='function')carregarDiligencia(ID);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();</script>`;
}

export async function GET(req: Request) {
  const acesso = await acessoDiligencias();
  const editar = new URL(req.url).searchParams.get('editar') || '';
  const editId = UUID_RE.test(editar) && acesso?.todas && (await podeVerDiligencia(editar)) ? editar : '';
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

  const cfg = `<script>var N8N_BASE = ${JSON.stringify(N8N)};</script>` + (acesso && !acesso.todas ? SCRIPT_CORRETOR : '');
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + cfg) : cfg + html;
  const barra = editId
    ? BARRA.replace('href="/admin"', `href="/admin/d/${editId}"`).replace('← Voltar às diligências', '← Voltar à diligência')
    : BARRA;
  html = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + barra + aviso) : html;
  if (editId) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, scriptEditar(editId) + '</body>') : html + scriptEditar(editId);

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}

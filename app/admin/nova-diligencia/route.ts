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
import { pool } from '@/lib/db';

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
//  - esconde o "Editar diligência existente" (a busca do n8n lista todas) — editar
//    só pelo botão da própria diligência (?editar=<id>), que confere o acesso;
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
try{var url=String(u&&u.url?u.url:u);if(!window.__EDIT_ID&&/\\/nova-diligencia-submit(\\?|$)/.test(url)&&o&&typeof o.body==='string'){var b={};try{b=JSON.parse(o.body);}catch(e){}
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
window.__EDIT_ID=ID; // edição: não marca o corretor como criador
function iniciar(){
  try{var h=document.querySelector('.card h1');if(h)h.textContent='Editar diligência';
  var sub=document.querySelector('.card .subtitle');if(sub)sub.textContent='REMAX Ville — confira e ajuste os dados do imóvel e dos vendedores';
  var b=document.getElementById('busca-dilig');var n=b;while(n&&n.parentElement&&!(n.querySelector&&n.querySelector('h2')))n=n.parentElement;
  if(n&&b){for(var i=0;i<n.children.length;i++){var c=n.children[i];if(c.id!=='edit-aviso')c.style.display='none';}n.style.padding='0';n.style.border='0';n.style.background='transparent';}}catch(e){}
  if(typeof carregarDiligencia==='function')carregarDiligencia(ID);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();</script>`;
}

// 18/11: o formulário fica em seções que abrem e fecham (com resumo do que já foi preenchido),
// e cada vendedor/comprador também fecha. Só muda a forma de mostrar; campos e envio são os do WF-01.
const SECOES = `<style>
.fx-barra{display:flex;justify-content:flex-end;gap:14px;margin:0 0 10px;font-size:12px}
.fx-barra button{background:none;border:0;color:#475569;cursor:pointer;font-size:12px;text-decoration:underline;padding:0}
.fx-sec{border:1px solid #e5e7eb;border-radius:10px;background:#fff;margin-bottom:10px !important}
.fx-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;user-select:none;border-radius:10px}
.fx-hd:hover{background:#f8fafc}
.fx-hd h2{margin:0 !important;flex:0 1 auto}
.fx-hd h2 span{display:none}
.fx-sum{flex:1;min-width:0;font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right}
.fx-sum.fx-vazio{color:#b0b7c3}
.fx-chev{flex:none;width:18px;text-align:center;color:#64748b;transition:transform .15s;font-size:12px}
.fx-sec:not(.fx-fechado) > .fx-hd .fx-chev{transform:rotate(90deg)}
.fx-bd{padding:2px 14px 14px}
.fx-nota{font-size:12px;color:#888;margin:-2px 0 10px}
.fx-sec.fx-fechado > .fx-bd{display:none}
.fx-sec.fx-erro{border-color:#c8102e}
.fx-ghd{display:flex;align-items:center;gap:8px;margin:-4px 30px 10px 0;cursor:pointer;user-select:none;font-size:13px;font-weight:600;color:#334155}
.fx-ghd .fx-gsum{font-weight:400;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.group.fx-gfechado > .fx-ghd{margin-bottom:0}
.group.fx-gfechado > *:not(.fx-ghd):not(.remove-btn){display:none !important}
.group:not(.fx-gfechado) > .fx-ghd .fx-chev{transform:rotate(90deg)}
</style>
<script>(function(){
// Painel 18/11: o formulário da diligência (HTML do WF-01) fica em seções que abrem e fecham,
// com um resumo do que já está preenchido. Vendedores e compradores também fecham um a um.
// Nada muda nos campos nem no envio: só a forma de mostrar.
var ABERTAS_NOVA = { 'imovel':1, 'matriculas':1, 'vendedores-pessoa-fisica':1 };
var LISTAS_PESSOAS = { 'pf-list':'Vendedor', 'pj-list':'Empresa', 'comp-pf-list':'Comprador', 'comp-pj-list':'Comprador PJ' };
function chave(t){ return String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]+/g,'-').replace(/^-|-$/g,''); }
function val(el){ return el && el.value ? String(el.value).trim() : ''; }
function porId(id){ return val(document.getElementById(id)); }
function grupos(id){ var l=document.getElementById(id); if(!l) return []; return Array.prototype.filter.call(l.children,function(c){return c.classList&&c.classList.contains('group');}); }
function nomeDoGrupo(g){
  var n = g.querySelector('input[name$="_nome"]:not([name*="conjuge"]):not([name*="rep_"]):not([name*="mae"]):not([name*="pai"])');
  var d = g.querySelector('input[name$="cpf"]:not([name*="conjuge"]):not([name*="rep_"]), input[name$="cnpj"]');
  return [val(n), val(d)].filter(Boolean).join(' · ');
}
function contagem(n, um, varios){ return n ? (n + ' ' + (n===1?um:varios)) : ''; }
var RESUMOS = {
  'imovel': function(){ return [porId('logradouro'), porId('numero'), porId('complemento')].filter(Boolean).join(', '); },
  'matriculas': function(){ var gs=grupos('matriculas-list'); var ns=gs.map(function(g){return val(g.querySelector('[name=matricula_num]'));}).filter(Boolean); return ns.length ? 'nº ' + ns.join(', ') : ''; },
  'condominios-unidades': function(){ return contagem(grupos('condominios-list').length,'unidade','unidades'); },
  'pontos-de-consumo': function(){ return contagem(grupos('consumos-list').length,'ponto','pontos'); },
  'vendedores-pessoa-fisica': function(){ return grupos('pf-list').map(nomeDoGrupo).filter(Boolean).map(function(s){return s.split(' · ')[0];}).join('; '); },
  'vendedores-pessoa-juridica': function(){ return grupos('pj-list').map(nomeDoGrupo).filter(Boolean).map(function(s){return s.split(' · ')[0];}).join('; '); },
  'certidoes-de-outros-estados': function(){ return Array.prototype.map.call(document.querySelectorAll('input[name=estado_extra]:checked'),function(c){return c.parentElement.textContent.trim();}).join(', '); },
  'compradores-pessoa-fisica': function(){ return grupos('comp-pf-list').map(nomeDoGrupo).filter(Boolean).map(function(s){return s.split(' · ')[0];}).join('; '); },
  'compradores-pessoa-juridica': function(){ return grupos('comp-pj-list').map(nomeDoGrupo).filter(Boolean).map(function(s){return s.split(' · ')[0];}).join('; '); },
  'dados-do-negocio': function(){ var p=porId('negocio-preco'); return p ? 'R$ ' + p.replace(/^R\\$\\s*/,'') : ''; }
};
var secoes = [];
function montar(){
  var fc = document.getElementById('form-content'); if(!fc || fc.getAttribute('data-fx')) return; fc.setAttribute('data-fx','1');
  Array.prototype.slice.call(fc.children).forEach(function(div){
    if(div.tagName!=='DIV') return;
    var h2 = null; for(var i=0;i<div.children.length;i++){ if(div.children[i].tagName==='H2'){ h2=div.children[i]; break; } }
    if(!h2 || div.querySelector('#busca-dilig')) return;
    var titulo = h2.childNodes[0] ? h2.childNodes[0].textContent : h2.textContent;
    var k = chave(titulo);
    var nota = h2.querySelector('span');
    var hd = document.createElement('div'); hd.className='fx-hd';
    var chev = document.createElement('span'); chev.className='fx-chev'; chev.textContent='▶';
    var sum = document.createElement('span'); sum.className='fx-sum';
    var bd = document.createElement('div'); bd.className='fx-bd';
    if (nota && nota.textContent.trim()) { var p=document.createElement('p'); p.className='fx-nota'; p.textContent=nota.textContent.trim().replace(/^\\(|\\)$/g,''); bd.appendChild(p); }
    while (h2.nextSibling) bd.appendChild(h2.nextSibling);
    div.insertBefore(hd, h2); hd.appendChild(chev); hd.appendChild(h2); hd.appendChild(sum); div.appendChild(bd);
    div.classList.add('fx-sec'); div.setAttribute('data-fx-sec', k);
    var aberta = window.__EDIT_ID ? false : !!ABERTAS_NOVA[k];
    if (!aberta) div.classList.add('fx-fechado');
    hd.addEventListener('click', function(){ div.classList.toggle('fx-fechado'); });
    secoes.push({ div:div, k:k, sum:sum });
  });
  var barra = document.createElement('div'); barra.className='fx-barra';
  barra.innerHTML = '<button type="button" data-a="abrir">Abrir todas</button><button type="button" data-a="fechar">Fechar todas</button>';
  barra.addEventListener('click', function(e){ var a=e.target && e.target.getAttribute('data-a'); if(!a) return; secoes.forEach(function(s){ s.div.classList.toggle('fx-fechado', a==='fechar'); }); });
  if (secoes[0]) fc.insertBefore(barra, secoes[0].div);
  resumir(); setInterval(resumir, 1200);
  document.addEventListener('input', resumir, true);
  document.addEventListener('change', resumir, true);
  // Erros de validação: abre a seção e a pessoa onde está o erro e rola até o primeiro.
  new MutationObserver(function(ms){
    var achou=false;
    ms.forEach(function(m){ Array.prototype.forEach.call(m.addedNodes,function(n){ if(n.nodeType===1 && n.classList.contains('field-error')){ achou=true; abrirAte(n); } }); });
    if (achou) { secoes.forEach(function(s){ s.div.classList.toggle('fx-erro', !!s.div.querySelector('.field-error')); });
      setTimeout(function(){ var p=document.querySelector('.field-error'); if(p) p.scrollIntoView({behavior:'smooth',block:'center'}); }, 30); }
  }).observe(fc, { childList:true, subtree:true });
  // Pessoas: um cabeçalho por vendedor/comprador, que fecha e abre.
  Object.keys(LISTAS_PESSOAS).forEach(function(id){
    var l=document.getElementById(id); if(!l) return;
    var dec=function(){ grupos(id).forEach(function(g,i){ decorarGrupo(g, LISTAS_PESSOAS[id] + ' ' + (i+1)); }); };
    dec(); new MutationObserver(dec).observe(l, { childList:true });
  });
}
function abrirAte(n){ var e=n; while(e){ if(e.classList){ if(e.classList.contains('fx-sec')) e.classList.remove('fx-fechado'); if(e.classList.contains('fx-gfechado')) e.classList.remove('fx-gfechado'); } e=e.parentElement; } }
function decorarGrupo(g, rotulo){
  var hd = g.querySelector(':scope > .fx-ghd');
  if (!hd) {
    hd=document.createElement('div'); hd.className='fx-ghd';
    hd.innerHTML='<span class="fx-chev">▶</span><span class="fx-grot"></span><span class="fx-gsum"></span>';
    hd.addEventListener('click', function(){ g.classList.toggle('fx-gfechado'); });
    g.insertBefore(hd, g.firstChild);
  }
  hd.querySelector('.fx-grot').textContent = rotulo;
}
function resumir(){
  secoes.forEach(function(s){
    var f = RESUMOS[s.k]; var t = '';
    try { t = f ? f() : ''; } catch(e) {}
    s.sum.textContent = t || 'vazio'; s.sum.classList.toggle('fx-vazio', !t);
    if (!s.div.querySelector('.field-error')) s.div.classList.remove('fx-erro');
  });
  Object.keys(LISTAS_PESSOAS).forEach(function(id){ grupos(id).forEach(function(g){ var hd=g.querySelector(':scope > .fx-ghd'); if(hd){ var t=nomeDoGrupo(g); hd.querySelector('.fx-gsum').textContent = t ? '— ' + t : ''; } }); });
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();</script>`;

export async function GET(req: Request) {
  const acesso = await acessoDiligencias();
  const editar = new URL(req.url).searchParams.get('editar') || '';
  // Editar: quem gerencia todas OU o corretor ligado a esta diligência.
  const editId = UUID_RE.test(editar) && acesso && (await podeVerDiligencia(editar)) ? editar : '';
  // 13/11: diligência do rquatro não se edita por aqui: este formulário regrava os dados e
  // apagaria a marca "rquatro" (ela sumiria do rquatro). Edição só pelo próprio rquatro.
  if (editId) {
    const o = await pool.query(`SELECT dados_completos ->> 'origem' AS origem FROM diligencias WHERE id = $1::uuid`, [editId]);
    if (o.rows[0]?.origem === 'rquatro') {
      return pagina(409, 'Diligência do rquatro', 'Esta diligência é de uma unidade do rquatro. Para editar, use o botão "Editar diligência" no próprio rquatro.');
    }
  }
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
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => SECOES + '</body>') : html + SECOES;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}

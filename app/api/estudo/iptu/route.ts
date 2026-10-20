// Ficha de captação (/estudo): SQL e área total do IPTU pelo endereço, e a
// Certidão de Dados Cadastrais do Imóvel.
//
// POST { acao: 'sql', endereco, unidade? }  -> SQL e área da unidade pelas vendas do ITBI (grátis)
// POST { acao: 'certidao', sql }            -> emite a certidão do exercício atual (R$ 0,24 na
//                                              Infosimples; repetida, sai do Storage sem custo)
import { NextResponse } from 'next/server';
import { getSessaoPerfil } from '@/lib/perfil';
import { podeTela } from '@/lib/acesso';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sqlPorEndereco, lerCertidao, type Certidao } from '@/lib/estudo-iptu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BUCKET = 'documentos';
const PASTA = 'estudo-certidoes';
const URL_INFOSIMPLES = 'https://api.infosimples.com/api/v2/consultas/pref/sp/sao-paulo/dados-imovel';
const VALIDADE_LINK = 7 * 24 * 3600; // 7 dias

const erro = (msg: string, status = 400) => NextResponse.json({ erro: msg }, { status });

async function linkPdf(path: string): Promise<string | null> {
  const { data } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(path, VALIDADE_LINK);
  return data?.signedUrl || null;
}

async function certidaoGuardada(base: string): Promise<{ cert: Certidao; pdf: string | null } | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.storage.from(BUCKET).download(`${base}.json`);
  if (!data) return null;
  try {
    const cert = JSON.parse(await data.text()) as Certidao & { pdf?: string | null };
    return { cert, pdf: cert.pdf ? await linkPdf(cert.pdf) : null };
  } catch {
    return null;
  }
}

async function credenciais(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin()
    .from('credenciais_sistema')
    .select('chave, valor')
    .in('chave', ['infosimples_token', 'pmsp_senhaweb_cnpj', 'pmsp_senhaweb_cpf', 'pmsp_senhaweb_senha']);
  return Object.fromEntries(((data || []) as { chave: string; valor: string }[]).map((r) => [r.chave, String(r.valor || '')]));
}

async function emitir(sql: string, email: string) {
  const ano = new Date().getFullYear();
  const base = `${PASTA}/${sql}_${ano}`;
  const guardada = await certidaoGuardada(base);
  if (guardada) return NextResponse.json({ ok: true, guardada: true, certidao: guardada.cert, pdf: guardada.pdf });

  const cr = await credenciais();
  const cnpj = (cr.pmsp_senhaweb_cnpj || '').replace(/\D/g, '');
  const cpf = (cr.pmsp_senhaweb_cpf || '').replace(/\D/g, '');
  if (!cr.infosimples_token || !cr.pmsp_senhaweb_senha || (cnpj.length !== 14 && !cpf)) {
    return erro('Credenciais da Prefeitura não configuradas (credenciais_sistema).', 503);
  }
  const corpo = {
    token: cr.infosimples_token,
    ...(cnpj.length === 14 ? { login_cnpj: cnpj } : { login_cpf: cpf }),
    login_senha: cr.pmsp_senhaweb_senha,
    cadastro_imovel: sql,
    ano_exercicio: String(ano),
    timeout: 100,
  };

  let r: Response;
  try {
    r = await fetch(URL_INFOSIMPLES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    return erro('A Prefeitura demorou demais para responder. Tente de novo em alguns minutos.', 504);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON da Infosimples
  const j = (await r.json().catch(() => ({}))) as Record<string, any>;
  console.log(`[estudo][certidao] ${email} SQL ${sql}/${ano} → code ${j.code} (${j.code_message || ''})`);
  if (j.code !== 200 || !Array.isArray(j.data) || !j.data[0]) {
    const msg = String(j.code_message || j.errors?.[0] || 'sem resposta');
    if (j.code === 612) return erro('A Prefeitura não encontrou esse SQL no exercício atual. Confira o número no carnê do IPTU.', 404);
    return erro(`A Prefeitura não emitiu a certidão (${j.code ?? r.status}): ${msg}`, 502);
  }

  const cert = lerCertidao(sql, ano, j.data[0]);
  const sb = supabaseAdmin();
  let pdfPath: string | null = null;
  const recibo = Array.isArray(j.site_receipts) ? String(j.site_receipts[0] || '') : '';
  if (recibo) {
    try {
      const pr = await fetch(recibo, { signal: AbortSignal.timeout(30_000) });
      if (pr.ok) {
        const tipo = pr.headers.get('content-type') || 'application/pdf';
        const ext = /html/.test(tipo) ? 'html' : 'pdf';
        pdfPath = `${base}.${ext}`;
        const up = await sb.storage.from(BUCKET).upload(pdfPath, Buffer.from(await pr.arrayBuffer()), { contentType: tipo, upsert: true });
        if (up.error) pdfPath = null;
      }
    } catch {
      pdfPath = null;
    }
  }
  await sb.storage.from(BUCKET).upload(
    `${base}.json`,
    Buffer.from(JSON.stringify({ ...cert, pdf: pdfPath, emitida_por: email, emitida_em: new Date().toISOString() })),
    { contentType: 'application/json', upsert: true }
  );
  return NextResponse.json({ ok: true, guardada: false, certidao: cert, pdf: pdfPath ? await linkPdf(pdfPath) : recibo || null });
}

export async function POST(req: Request) {
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return erro('Faça login para continuar.', 401);
  if (!podeTela(perfil, 'estudo')) return erro('Sua conta não tem acesso ao estudo de mercado.', 403);

  let body: { acao?: string; endereco?: string; unidade?: string; sql?: string };
  try {
    body = await req.json();
  } catch {
    return erro('Corpo inválido.');
  }

  if (body.acao === 'sql') {
    const endereco = String(body.endereco || '').slice(0, 300);
    if (!endereco.trim()) return erro('Preencha o endereço primeiro.');
    try {
      const r = await sqlPorEndereco(endereco, body.unidade ? String(body.unidade).slice(0, 20) : null);
      if (!r) return erro('Não consegui ler rua e número nesse endereço. Ex.: R. Treze de Maio, 1203 — ap 91');
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      console.error('[estudo][sql] falha no ITBI', e);
      return erro('Não consegui consultar as vendas do ITBI agora.', 503);
    }
  }

  if (body.acao === 'certidao') {
    const sql = String(body.sql || '').replace(/\D/g, '');
    if (sql.length !== 11) return erro('O SQL tem 11 dígitos (ex.: 009.091.0438-7).');
    return emitir(sql, email);
  }

  return erro('Ação desconhecida.');
}

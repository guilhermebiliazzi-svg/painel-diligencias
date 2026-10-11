// app/api/integracoes/directd-protestos/route.ts
// Ponte do n8n (WF-08, card do CENPROT) para a DirectD "Protestos Nacional - IEPTB Online".
// O token da DirectD fica só aqui (DIRECTD_TOKEN, já usado pela captação); o n8n se
// identifica com o segredo compartilhado `painel_upload_secret` (credenciais_sistema).
//
// POST { acao: 'criar', documento }  -> cria a consulta assíncrona (cobrada pela DirectD)
// POST { acao: 'resultado', uid }    -> busca o resultado (sem custo)
// Resposta: { statusCode, body } com o status e o corpo devolvidos pela DirectD.
// Só fala com essas duas rotas da DirectD; qualquer outra coisa é recusada.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APIV3 = (process.env.DIRECTD_BASE || 'https://apiv3.directd.com.br').replace(/\/+$/, '');

async function segredoOk(recebido: string): Promise<boolean> {
  if (!recebido) return false;
  const r = await pool.query(`SELECT valor FROM credenciais_sistema WHERE chave = 'painel_upload_secret'`);
  const esperado = String(r.rows[0]?.valor || '');
  if (!esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!(await segredoOk(req.headers.get('x-painel-secret') || ''))) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  const token = (process.env.DIRECTD_TOKEN || '').trim();
  if (!token) return NextResponse.json({ error: 'DIRECTD_TOKEN não configurado' }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as { acao?: string; documento?: string; uid?: string };
  let url: string;
  if (b.acao === 'criar') {
    const d = String(b.documento || '').replace(/\D+/g, '');
    if (d.length !== 11 && d.length !== 14) {
      return NextResponse.json({ error: 'documento precisa ser CPF (11) ou CNPJ (14 dígitos)' }, { status: 400 });
    }
    url = `${APIV3}/api/ProtestosOnline?${d.length === 11 ? 'CPF' : 'CNPJ'}=${d}&Async=habilitar&TOKEN=${encodeURIComponent(token)}`;
  } else if (b.acao === 'resultado') {
    const uid = String(b.uid || '').trim();
    if (!/^direct-[0-9a-f-]{36}$/i.test(uid)) return NextResponse.json({ error: 'uid inválido' }, { status: 400 });
    url = `${APIV3}/api/Historico/ObterRetornoConsultaAsync?ConsultaUid=${encodeURIComponent(uid)}&TOKEN=${encodeURIComponent(token)}`;
  } else {
    return NextResponse.json({ error: "acao deve ser 'criar' ou 'resultado'" }, { status: 400 });
  }

  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(50000) });
    const texto = await r.text();
    let body: unknown = null;
    try { body = texto ? JSON.parse(texto) : null; } catch { body = { bruto: texto.slice(0, 500) }; }
    return NextResponse.json({ statusCode: r.status, body });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ statusCode: 0, body: { mensagem: 'falha ao chamar a DirectD: ' + msg } });
  }
}

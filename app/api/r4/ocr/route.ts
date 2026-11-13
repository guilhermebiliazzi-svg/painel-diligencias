// POST /api/r4/ocr — lê o documento de identidade (RG, CIN ou CNH) e devolve os
// dados para preencher o formulário de nova diligência do rquatro.
//
// Mesmo modelo e mesmas instruções do WF-12 da Ville (Gemini 2.5 Flash), mas sem
// guardar o arquivo em lugar nenhum: o documento só vai para a pasta da unidade
// quando a diligência é criada (envio para o card "Documento de identidade").
// Custo registrado em execucao_custos (workflow "rquatro — OCR documento").
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { r4UsuarioAtual } from '@/lib/r4/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMITE = 4 * 1024 * 1024;
const TIPOS = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;
const erro = (msg: string, status = 400) => NextResponse.json({ sucesso: false, erro: msg }, { status });

const PROMPT = `Você é um sistema de extração de dados de documentos de identidade brasileiros.

Analise o documento de identidade (RG ou CNH) e extraia os seguintes campos.

ATENÇÃO para o novo modelo de RG (CIN - Carteira de Identidade Nacional):
- O campo "Registro Geral - CPF / Personal Number" contém o CPF no formato 000.000.000-00
- O número acima da foto (formato A00000000000) é o número de série, NÃO é o RG
- O RG no novo modelo CIN NÃO aparece explicitamente — retorne null para rg
- A Filiação contém nome da mãe e nome do pai separados
- O campo Sexo: F = Feminino, M = Masculino

Para RG antigo:
- O campo "Registro Geral" ou "RG" contém o número do RG
- O CPF pode aparecer no verso

Para CNH:
- CPF, data de nascimento e nome estão na frente
- Nome da mãe geralmente não aparece — retorne null

Campos a extrair:
- nome: nome completo do titular
- cpf: CPF no formato 000.000.000-00
- rg: número do RG (null se não encontrado ou se for CIN)
- data_nascimento: data de nascimento no formato DD/MM/AAAA
- nome_mae: nome completo da mãe
- nome_pai: nome completo do pai (null se não aparecer)
- genero: "Masculino" ou "Feminino"
- tipo_documento: "RG", "CIN" ou "CNH"

Retorne APENAS o JSON sem explicações, sem markdown, sem texto adicional:
{"nome":"FULANO DE TAL","cpf":"000.000.000-00","rg":null,"data_nascimento":"DD/MM/AAAA","nome_mae":"NOME DA MAE","nome_pai":"NOME DO PAI","genero":"Feminino","tipo_documento":"RG"}`;

function dataIso(v: unknown): string | null {
  const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function cpfMascara(v: unknown): string | null {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : null;
}

export async function POST(req: Request) {
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo) return erro('Sessão expirada. Entre de novo.', 401);
  if (!u.ferramentas.includes('diligencia')) return erro('Seu acesso não inclui a diligência.', 403);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return erro('Envio inválido.');
  }
  const arq = fd.get('arquivo');
  if (!(arq instanceof File) || !arq.size) return erro('Escolha o arquivo do documento.');
  if (arq.size > LIMITE) return erro('Arquivo acima de 4 MB. Envie uma foto ou um PDF menor.');
  const mime = arq.type || (/\.pdf$/i.test(arq.name) ? 'application/pdf' : 'image/jpeg');
  if (!TIPOS.test(mime)) return erro('Envie uma foto (JPG/PNG) ou um PDF do documento.');

  const { data: k } = await supabaseAdmin().from('credenciais_sistema').select('valor').eq('chave', 'gemini_api_key').maybeSingle();
  const chave = (k as { valor?: string } | null)?.valor;
  if (!chave) return erro('Leitura automática indisponível no momento.', 503);

  const b64 = Buffer.from(await arq.arrayBuffer()).toString('base64');
  let j: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(chave)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!r.ok) return erro('Não consegui ler o documento agora. Preencha os dados à mão.', 502);
    j = await r.json();
  } catch {
    return erro('A leitura demorou demais. Preencha os dados à mão.', 504);
  }

  // custo (mesma tabela do WF-12); falha aqui não atrapalha o preenchimento
  const um = j.usageMetadata || {};
  const prompt = Number(um.promptTokenCount || 0);
  const cached = Number(um.cachedContentTokenCount || 0);
  await pool
    .query(
      `INSERT INTO execucao_custos (execution_id, workflow, node_origem, model, input_tokens, cached_tokens, output_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        `r4-${randomUUID()}`,
        'rquatro — OCR documento',
        'r4_ocr',
        'gemini-2.5-flash',
        Math.max(prompt - cached, 0),
        cached,
        Number(um.candidatesTokenCount || 0) + Number(um.thoughtsTokenCount || 0),
      ]
    )
    .catch((e) => console.error('[r4 ocr] custo', e));

  let d: Record<string, unknown>;
  try {
    const texto = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
    d = JSON.parse(texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch {
    return erro('Não consegui ler o documento. Preencha os dados à mão.', 422);
  }
  const g = String(d.genero || '').toLowerCase();
  const dados = {
    nome: d.nome ? String(d.nome).toUpperCase().trim() : null,
    cpf: cpfMascara(d.cpf),
    rg: d.rg ? String(d.rg).trim() : null,
    nascimento: dataIso(d.data_nascimento),
    mae: d.nome_mae ? String(d.nome_mae).toUpperCase().trim() : null,
    pai: d.nome_pai ? String(d.nome_pai).toUpperCase().trim() : null,
    genero: g.startsWith('f') ? 'F' : g.startsWith('m') ? 'M' : null,
    tipo_documento: d.tipo_documento ? String(d.tipo_documento) : null,
  };
  if (!dados.nome && !dados.cpf) return erro('Não encontrei os dados no documento. Confira se a foto está nítida.', 422);
  return NextResponse.json({ sucesso: true, dados });
}

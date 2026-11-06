'use server';

// Mensagens do Guilherme para os novatos, enviadas pelo número do Max (5192-8192).
// Quem envia de fato é o fluxo "ONB – Entrada" no n8n (webhook onb-painel-enviar),
// que só repassa à Meta com a credencial do WhatsApp. O painel decide o formato:
//  - novato escreveu nas últimas 23h50 → texto livre (janela de 24h aberta);
//  - fora da janela → modelo aprovado onb_aviso ({{1}} = primeiro nome, {{2}} = texto).
// Cada envio fica registrado em onb_mensagens (tipo "painel" ou "painel_modelo"),
// então aparece na conversa do painel e entra no histórico que o Max lê.
import { revalidatePath } from 'next/cache';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

const WEBHOOK = 'https://villejds.app.n8n.cloud/webhook/onb-painel-enviar';
// Chave combinada com o n8n (nó "Conferir envio do painel"), guardada na Vercel.
const CHAVE = process.env.ONB_PAINEL_CHAVE || '';
const JANELA_MS = (23 * 60 + 50) * 60 * 1000;
const LIMITE_TEXTO = 1000;

export type ResultadoEnvio = { ok: boolean; enviados: string[]; falhas: { nome: string; erro: string }[] };

// Texto do modelo: a Meta não aceita quebra de linha, tab ou 4+ espaços nos parâmetros.
const limpaModelo = (s: string) =>
  s.replace(/\r/g, '').split('\n').map((x) => x.trim()).filter(Boolean).join(' | ').replace(/\s{2,}/g, ' ').replace(/\t/g, ' ');

type Meta = { messages?: { id?: string }[]; error?: { message?: string; error_data?: { details?: string } } };

async function enviarUm(n: { id: string; nome: string; phone: string }, texto: string, janela: boolean) {
  const primeiro = n.nome.split(' ')[0];
  const payload = janela
    ? { messaging_product: 'whatsapp', to: n.phone, type: 'text', text: { body: texto } }
    : {
        messaging_product: 'whatsapp', to: n.phone, type: 'template',
        template: {
          name: 'onb_aviso', language: { code: 'pt_BR' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: primeiro }, { type: 'text', text: limpaModelo(texto).slice(0, LIMITE_TEXTO) }] }],
        },
      };
  if (!CHAVE) return { ok: false as const, erro: 'falta configurar ONB_PAINEL_CHAVE na Vercel' };
  let j: Meta = {};
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE },
      body: JSON.stringify({ payload }),
      cache: 'no-store',
    });
    j = (await r.json().catch(() => ({}))) as Meta;
    if (!r.ok && !j.error) return { ok: false as const, erro: `o n8n respondeu ${r.status}` };
  } catch {
    return { ok: false as const, erro: 'o n8n não respondeu' };
  }
  const wamid = j.messages?.[0]?.id;
  if (!wamid) return { ok: false as const, erro: j.error?.error_data?.details || j.error?.message || 'a Meta não confirmou o envio' };
  // Registra o que o novato recebeu (no modelo, a Meta monta o texto a partir do onb_aviso).
  await supabaseAdmin().from('onb_mensagens').insert({
    novato_id: n.id, phone: n.phone, direcao: 'out',
    tipo: janela ? 'painel' : 'painel_modelo',
    texto: janela ? texto : limpaModelo(texto).slice(0, LIMITE_TEXTO),
    wa_message_id: wamid,
  });
  return { ok: true as const };
}

export async function enviarMensagem(ids: string[], textoBruto: string): Promise<ResultadoEnvio> {
  await exigirTela('treinamento');
  const texto = String(textoBruto ?? '').trim();
  const lista = [...new Set((ids ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))))];
  if (!texto) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: 'Escreva a mensagem.' }] };
  if (texto.length > LIMITE_TEXTO) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: `Mensagem longa demais (máx. ${LIMITE_TEXTO} caracteres).` }] };
  if (!lista.length) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: 'Escolha pelo menos um corretor.' }] };

  const sb = supabaseAdmin();
  const { data: novatos, error } = await sb.from('onb_novatos').select('id,nome,phone').in('id', lista);
  if (error) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: error.message }] };

  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const res: ResultadoEnvio = { ok: true, enviados: [], falhas: [] };
  for (const n of (novatos ?? []) as { id: string; nome: string; phone: string }[]) {
    const { count } = await sb.from('onb_mensagens').select('id', { count: 'exact', head: true })
      .eq('phone', n.phone).eq('direcao', 'in').gte('criado_em', desde);
    const r = await enviarUm(n, texto, (count ?? 0) > 0);
    if (r.ok) res.enviados.push(n.nome);
    else res.falhas.push({ nome: n.nome, erro: r.erro });
  }
  res.ok = res.falhas.length === 0;
  revalidatePath('/treinamento');
  for (const id of lista) revalidatePath(`/treinamento/${id}`);
  return res;
}

// ------------------------------------------------------------------ cadastro
// Cadastra corretores na trilha do Max a partir do painel (o mesmo que o comando
// "cadastrar novato" no WhatsApp do Max): cria o novato, gera as tarefas da trilha
// pela data de início e, se pedido, manda as boas-vindas pelo Max.
export type NovoNovato = { corretor_id: number; padrinho_id: number | null };
export type ResultadoCadastro = { ok: boolean; cadastrados: string[]; falhas: { nome: string; erro: string }[] };

const foneWhats = (t: string | null | undefined) => {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? '55' + d : d.length >= 12 ? d : '';
};

export async function cadastrarNovatos(lista: NovoNovato[], dataInicio: string, boasVindas: boolean): Promise<ResultadoCadastro> {
  await exigirTela('treinamento');
  const res: ResultadoCadastro = { ok: true, cadastrados: [], falhas: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataInicio))) return { ok: false, cadastrados: [], falhas: [{ nome: '—', erro: 'Escolha a data de início.' }] };
  const itens = (lista ?? []).filter((x) => Number.isInteger(Number(x?.corretor_id)) && Number(x.corretor_id) > 0);
  if (!itens.length) return { ok: false, cadastrados: [], falhas: [{ nome: '—', erro: 'Escolha pelo menos um corretor.' }] };

  const sb = supabaseAdmin();
  const { data: cs, error } = await sb.from('corretores_associados').select('id,nome,phone,calendar_id').in('id', itens.map((x) => Number(x.corretor_id)));
  if (error) return { ok: false, cadastrados: [], falhas: [{ nome: '—', erro: error.message }] };
  const porId = new Map(((cs ?? []) as { id: number; nome: string; phone: string | null; calendar_id: string | null }[]).map((c) => [Number(c.id), c]));

  for (const it of itens) {
    const c = porId.get(Number(it.corretor_id));
    const nome = String(c?.nome ?? '').split(' - ')[0].trim();
    if (!c || !nome) { res.falhas.push({ nome: `#${it.corretor_id}`, erro: 'corretor não encontrado' }); continue; }
    const phone = foneWhats(c.phone);
    if (!phone) { res.falhas.push({ nome, erro: 'sem celular no cadastro de corretor' }); continue; }
    const linha: Record<string, unknown> = {
      corretor_id: c.id, nome, phone, data_inicio: dataInicio, calendar_id: c.calendar_id ?? null, status: 'ativo',
    };
    const padr = Number(it.padrinho_id);
    if (padr > 0 && padr !== Number(c.id)) linha.padrinho_id = padr;
    const { data: nov, error: e1 } = await sb.from('onb_novatos').upsert(linha, { onConflict: 'phone' }).select('id').single();
    if (e1 || !nov) { res.falhas.push({ nome, erro: e1?.message ?? 'não gravou' }); continue; }
    const id = (nov as { id: string }).id;
    const { error: e2 } = await sb.rpc('onb_gerar_tarefas', { p_novato: id });
    if (e2) { res.falhas.push({ nome, erro: 'cadastrado, mas as tarefas não foram geradas: ' + e2.message }); continue; }
    if (boasVindas) {
      const [, m, d] = dataInicio.split('-');
      const texto = `Bem-vindo(a) à REMAX Ville! Sou o Max, seu assistente de treinamento, e vou te acompanhar nos seus 30 primeiros dias, passo a passo. Sua trilha começa em ${d}/${m}. Para começar, me responda esta mensagem.`;
      const r = await enviarUm({ id, nome, phone }, texto, false);
      if (!r.ok) { res.falhas.push({ nome, erro: 'cadastrado, mas as boas-vindas não saíram: ' + r.erro }); continue; }
    }
    res.cadastrados.push(nome);
  }
  res.ok = res.falhas.length === 0;
  revalidatePath('/treinamento');
  return res;
}

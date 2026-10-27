// Conversa completa da Eva com um telefone (cliente, corretor da Ville ou corretor parceiro).
// Junta: mensagens recebidas (mensagens_buffer), respostas da Eva (n8n_chat_histories, sem horário —
// herdam o horário da mensagem que responderam) e mensagens do sistema (sdr_mensagens, com status do WhatsApp).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirSdrGestao } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import MensagemEva from '@/app/sdr/lead/[id]/mensagem';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversa — SDR REMAX Ville' };

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const telFmt = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };

// Mesmo número com e sem o 9 (fora de SP o WhatsApp manda sem o 9).
function variantes(tel: string): string[] {
  const d = tel.replace(/\D/g, '');
  const v = new Set<string>([d]);
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') v.add(d.slice(0, 4) + d.slice(5));
  if (d.startsWith('55') && d.length === 12) v.add(d.slice(0, 4) + '9' + d.slice(4));
  return [...v];
}

type Ev = { k: string; t: number; lado: 'pessoa' | 'eva' | 'sistema'; rotulo: string; texto: string; status?: string; aprox?: boolean };
const ORDEM_ST: Record<string, number> = { failed: 0, sent: 1, delivered: 2, read: 3 };
const ST_TXT: Record<string, string> = { failed: 'não entregue', sent: 'enviada', delivered: 'entregue', read: 'lida' };

export default async function ConversaSdr({ params }: { params: Promise<{ tel: string }> }) {
  await exigirSdrGestao();
  const { tel } = await params;
  const dig = decodeURIComponent(tel).replace(/\D/g, '');
  if (dig.length < 10 || dig.length > 13) notFound();
  const vs = variantes(dig.length <= 11 ? '55' + dig : dig);
  const sb = supabaseAdmin();

  const [{ data: buf }, { data: hist }, { data: msgs }, { data: cors }, { data: leadsCli }, { data: leadsCor }, { data: parcs }, { data: orulo }] = await Promise.all([
    sb.from('mensagens_buffer').select('id,mensagem_texto,tipo_msg,created_at,processado_em').in('phone', vs).order('created_at', { ascending: true }).limit(800),
    sb.from('n8n_chat_histories').select('id,session_id,message').in('session_id', [...vs, ...vs.map((v) => 'orulo:' + v)]).order('id', { ascending: true }).limit(1200),
    sb.from('sdr_mensagens').select('id,created_at,direcao,interlocutor,template,conteudo,wa_message_id,lead_id').in('telefone', vs).order('created_at', { ascending: true }).limit(800),
    sb.from('corretores_associados').select('nome,apelido,phone').in('phone', vs).limit(1),
    sb.from('sdr_leads').select('id,nome,status,created_at,imovel_anuncio_endereco').in('telefone', vs).order('created_at', { ascending: false }).limit(10),
    sb.from('sdr_leads').select('id,nome,status,created_at,imovel_anuncio_endereco').in('corretor_phone', vs).order('created_at', { ascending: false }).limit(10),
    sb.from('sdr_imoveis_lead').select('lead_id,parceiro_nome,ref').in('parceiro_telefone', vs).order('created_at', { ascending: false }).limit(10),
    sb.from('orulo_sessoes').select('nome_parceiro').in('phone', vs).limit(1),
  ]);
  // 27/10: corretor de fora que escreveu para a Eva (sdr_contatos_profissionais) e janela de 24h, para o quadro de resposta.
  const desde23 = new Date(Date.now() - 23 * 3600e3).toISOString();
  const [{ data: prof }, { count: recentes }] = await Promise.all([
    sb.from('sdr_contatos_profissionais').select('nome').in('telefone', vs).limit(1),
    sb.from('mensagens_buffer').select('id', { count: 'exact', head: true }).in('phone', vs).gte('created_at', desde23),
  ]);
  const nomeProf = ((prof ?? []) as { nome: string | null }[])[0]?.nome;
  const ehProf = ((prof ?? []) as unknown[]).length > 0;

  // status de entrega das mensagens do sistema
  const wids = ((msgs ?? []) as { wa_message_id: string | null }[]).map((m) => m.wa_message_id).filter((x): x is string => !!x);
  const stPor = new Map<string, string>();
  for (let i = 0; i < wids.length; i += 200) {
    const { data } = await sb.from('sdr_wa_status').select('wa_message_id,status').in('wa_message_id', wids.slice(i, i + 200));
    for (const s of (data ?? []) as { wa_message_id: string; status: string }[]) {
      const a = stPor.get(s.wa_message_id);
      if (!a || (ORDEM_ST[s.status] ?? -1) > (ORDEM_ST[a] ?? -1)) stPor.set(s.wa_message_id, s.status);
    }
  }

  const cor = ((cors ?? []) as { nome: string; apelido: string | null }[])[0];
  const parc = ((parcs ?? []) as { lead_id: string; parceiro_nome: string | null; ref: string | null }[]);
  const nomeOrulo = ((orulo ?? []) as { nome_parceiro: string | null }[])[0]?.nome_parceiro;
  const lc = (leadsCli ?? []) as { id: string; nome: string | null; status: string; created_at: string; imovel_anuncio_endereco: string | null }[];
  const lr = (leadsCor ?? []) as typeof lc;
  const externo = !cor && (parc.length > 0 || !!nomeOrulo || ehProf);
  const quem = cor ? `${cor.nome} · corretor(a) da REMAX Ville` : ehProf && !parc.length ? `${nomeProf || 'Corretor(a) de fora'} · corretor(a) de fora` : parc.length ? `${parc[0].parceiro_nome || 'Corretor(a) parceiro(a)'} · corretor(a) parceiro(a)` : nomeOrulo ? `${nomeOrulo} · corretor(a) parceiro(a) (Órulo)` : lc.length ? `${lc[0].nome || 'Cliente'} · cliente` : 'Contato';

  const eventos: Ev[] = [];
  const bufs = (buf ?? []) as { id: number; mensagem_texto: string | null; tipo_msg: string | null; created_at: string; processado_em: string | null }[];
  for (const b of bufs) {
    const tx = (b.mensagem_texto || '').trim() || (b.tipo_msg && b.tipo_msg !== 'text' ? '[' + b.tipo_msg + ']' : '');
    if (tx) eventos.push({ k: 'b' + b.id, t: new Date(b.created_at).getTime(), lado: 'pessoa', rotulo: b.tipo_msg === 'button' ? 'tocou no botão' : '', texto: tx });
  }
  const sistema = new Set<string>();
  for (const m of (msgs ?? []) as { id: string; created_at: string; direcao: string; interlocutor: string; template: string | null; conteudo: string | null; wa_message_id: string | null; lead_id: string | null }[]) {
    const tx = String(m.conteudo ?? '').trim();
    if (m.direcao === 'out') sistema.add(tx.replace(/^\[ERRO [^\]]*\]\s*/, ''));
    if (m.direcao === 'in') continue; // entradas já vêm do buffer
    eventos.push({ k: 'm' + m.id, t: new Date(m.created_at).getTime(), lado: 'sistema',
      rotulo: 'sistema' + (m.template ? ' · modelo ' + m.template : ''), texto: tx, status: m.wa_message_id ? ST_TXT[stPor.get(m.wa_message_id) ?? ''] ?? 'enviada' : (tx.startsWith('[ERRO') ? 'não saiu' : undefined) });
  }
  // respostas da Eva: herdam o horário da mensagem da pessoa que responderam
  const limpa = (c: string) => c.replace(/^(\s*\[[^\]]*\]\s*)+/, '').replace(/\n+IMPORTANTE:[\s\S]*$/, '').trim();
  let ptr = 0; let tRef: number | null = null; let seq = 0;
  for (const h of (hist ?? []) as { id: number; message: { type?: string; content?: string } }[]) {
    const c = String(h.message?.content ?? '');
    if (h.message?.type === 'human') {
      const tx = limpa(c); seq = 0;
      for (let i = ptr; i < bufs.length; i++) {
        const bt = (bufs[i].mensagem_texto || '').trim();
        if (bt && tx && (tx.includes(bt) || bt.includes(tx))) { tRef = new Date(bufs[i].processado_em || bufs[i].created_at).getTime(); ptr = i + 1; break; }
      }
    } else if (h.message?.type === 'ai' && tRef != null) {
      const tx = c.trim();
      if (!tx || tx.startsWith('[Aviso do sistema') || sistema.has(tx)) continue;
      eventos.push({ k: 'h' + h.id, t: tRef + 1000 * ++seq, lado: 'eva', rotulo: 'Eva', texto: tx, aprox: true });
    }
  }
  eventos.sort((a, b) => a.t - b.t);

  const cor_ = { pessoa: 'bg-white border-slate-200', eva: 'bg-blue-50 border-blue-100', sistema: 'bg-amber-50 border-amber-100' };
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/sdr" className="text-sm text-blue-700 underline">← SDR</Link>
      <section style={{ backgroundColor: '#ffffff' }} className="mt-3 rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Conversa com {quem}</h1>
        <p className="text-sm text-slate-600">{telFmt(vs[0])} · <a href={'https://wa.me/' + vs[0]} target="_blank" className="text-blue-700 underline">abrir no WhatsApp</a></p>
        {(lc.length > 0 || lr.length > 0 || parc.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {[...lc.map((x) => ({ id: x.id, t: 'cliente: ' + (x.nome || 'lead') })), ...lr.map((x) => ({ id: x.id, t: 'corretor de ' + (x.nome || 'lead') })), ...parc.map((x) => ({ id: x.lead_id, t: 'parceiro · ' + (x.ref || 'imóvel') }))]
              .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).slice(0, 12)
              .map((x) => <Link key={x.id + x.t} href={'/sdr/lead/' + x.id} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-slate-700 hover:bg-slate-50">{x.t}</Link>)}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">Branco: a pessoa · azul: resposta da Eva (horário aproximado) · amarelo: mensagem do sistema, com status do WhatsApp.</p>
      </section>
      <ol className="mt-4 space-y-2">
        {eventos.map((e) => (
          <li key={e.k} className={'rounded-xl border px-3 py-2 ' + cor_[e.lado] + (e.lado === 'pessoa' ? ' mr-8' : ' ml-8')}>
            <p className="text-xs text-slate-500">
              {(e.aprox ? '~' : '') + fmt.format(new Date(e.t))}{e.rotulo ? ' · ' + e.rotulo : ''}{e.status ? ' · ' + e.status : ''}
            </p>
            <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{e.texto.slice(0, 3000)}</p>
          </li>
        ))}
        {!eventos.length && <li className="text-sm text-slate-500">Nenhuma mensagem com este número.</li>}
      </ol>
      {externo && (
        <div className="mt-4">
          <MensagemEva leadId="" parceiroTel={vs[0]}
            destinos={[{ chave: 'parceiro', destino: 'parceiro', rotulo: 'Corretor(a) de fora', detalhe: (nomeProf || nomeOrulo || parc[0]?.parceiro_nome || 'Corretor') + ' · ' + telFmt(vs[0]), janela: (recentes ?? 0) > 0 }]} />
        </div>
      )}
    </main>
  );
}

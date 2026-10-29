// Tela de UMA captação da landing (Anuncie na REMAX) — link do aviso no WhatsApp.
// Se o lead já foi criado (fila escolhida), vai direto para a tela do lead.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exigirSdrGestao } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { leadDaCaptacao } from '@/app/sdr/lead-captacao';
import Decisao, { type CorretorOpc } from '../../decisao';
import ReferenciarCaptacao from './referenciar';
import { lojasProximas } from '@/lib/lojas-remax';
import MensagemEva from '@/app/sdr/lead/[id]/mensagem';
import { statusDasMensagens, enviosDaEva, casarEnvio, rotuloStatus, mensagensAvulsas, casarAvulsa } from '@/lib/wa-status';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Captação — SDR REMAX Ville' };

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const telFmt = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };

export default async function CaptacaoSdr({ params }: { params: Promise<{ id: string }> }) {
  await exigirSdrGestao();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = supabaseAdmin();
  const { data: c } = await sb.from('captacao_leads').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const tel = String(c.telefone ?? '').replace(/\D/g, '');
  const tel55 = tel.length <= 11 ? '55' + tel : tel;
  if (tel) {
    const leadId = await leadDaCaptacao(tel55, c.criado_em);
    if (leadId) redirect('/sdr/lead/' + leadId);
  }
  const { data: cors } = await sb.from('corretores_associados').select('phone,nome,apelido,foto_url').eq('status', 'ativo').not('phone', 'is', null).order('nome');
  const quer = /^alug/i.test(String(c.intencao ?? '')) ? 'Alugar' : 'Vender';
  // Conversa do proprietário com a Eva (17/10): mensagens do cliente (mensagens_buffer) + respostas da Eva
  // (n8n_chat_histories) + avisos do sistema para este telefone (sdr_mensagens), em ordem de horário.
  type Ev = { k: string; t: number; rotulo: string; texto: string; status?: string; aprox?: boolean };
  const eventos: Ev[] = [];
  const fim8 = tel.slice(-8);
  if (fim8.length === 8) {
    const desde = new Date(new Date(c.criado_em).getTime() - 864e5).toISOString();
    const [{ data: buf }, { data: hist }, { data: sm }] = await Promise.all([
      sb.from('mensagens_buffer').select('id,mensagem_texto,tipo_msg,created_at,processado_em').like('phone', '%' + fim8).gte('created_at', desde).order('created_at').limit(200),
      sb.from('n8n_chat_histories').select('id,message').like('session_id', '%' + fim8).order('id', { ascending: false }).limit(120),
      sb.from('sdr_mensagens').select('id,created_at,direcao,interlocutor,conteudo,wa_message_id').like('telefone', '%' + fim8).gte('created_at', desde).order('created_at', { ascending: false }).limit(40),
    ]);
    // 29/10: status de entrega/leitura (mensagens do sistema e respostas da Eva).
    const envios = await enviosDaEva(sb, fim8, desde);
    const idsConhecidos = [...((sm ?? []) as { wa_message_id: string | null }[]).map((m) => m.wa_message_id), ...envios.map((e) => e.wa_message_id)];
    const avulsas = await mensagensAvulsas(sb, fim8, desde, idsConhecidos);
    const stPor = await statusDasMensagens(sb, [...idsConhecidos, ...avulsas.map((e) => e.wa_message_id)]);
    const bufs = (buf ?? []) as { id: number; mensagem_texto: string | null; tipo_msg: string | null; created_at: string; processado_em: string | null }[];
    for (const b of bufs) {
      const tx = (b.mensagem_texto || '').trim() || (b.tipo_msg && b.tipo_msg !== 'text' ? '[' + b.tipo_msg + ']' : '');
      if (tx) eventos.push({ k: 'b' + b.id, t: new Date(b.created_at).getTime(), rotulo: 'cliente → Eva', texto: tx });
    }
    const msgs = (sm ?? []) as { id: string; created_at: string; direcao: string; interlocutor: string; conteudo: string | null; wa_message_id: string | null }[];
    const enviados = new Set(msgs.map((m) => String(m.conteudo ?? '').trim()));
    const limpa = (x: string) => x.replace(/^(\s*\[[^\]]*\]\s*)+/, '').trim();
    let ptr = 0; let tRef: number | null = null; let seq = 0;
    for (const h of [...((hist ?? []) as { id: number; message: { type?: string; content?: string } }[])].reverse()) {
      const x = String(h.message?.content ?? '');
      if (h.message?.type === 'human') {
        const tx = limpa(x); tRef = null; seq = 0;
        for (let i = ptr; i < bufs.length; i++) {
          const bt = (bufs[i].mensagem_texto || '').trim();
          if (bt && tx && (tx.includes(bt) || bt.includes(tx))) { tRef = new Date(bufs[i].processado_em || bufs[i].created_at).getTime(); ptr = i + 1; break; }
        }
      } else if (h.message?.type === 'ai' && tRef != null) {
        const tx = x.trim();
        if (!tx || tx.startsWith('[') || enviados.has(tx)) continue;
        const env = casarEnvio(envios, tx, tRef) ?? casarAvulsa(avulsas, tRef); ++seq;
        eventos.push({ k: 'h' + h.id, t: env ? new Date(env.enviado_em).getTime() : tRef + 1000 * seq, rotulo: 'Eva → cliente', texto: tx, aprox: !env, status: env ? rotuloStatus(stPor, env.wa_message_id) : undefined });
      }
    }
    for (const m of msgs) eventos.push({ k: 'm' + m.id, t: new Date(m.created_at).getTime(), rotulo: (m.direcao === 'in' ? 'de ' : 'para ') + m.interlocutor, texto: String(m.conteudo ?? ''),
      status: m.direcao === 'in' ? undefined : rotuloStatus(stPor, m.wa_message_id, String(m.conteudo ?? '').startsWith('[ERRO')) });
    // 29/10: respostas da Eva gravadas no envio que não casaram com o histórico entram assim mesmo.
    for (const e of envios) if (!e.usado && !enviados.has(String(e.texto ?? '').trim())) eventos.push({ k: 'e' + e.wa_message_id, t: new Date(e.enviado_em).getTime(), rotulo: 'Eva → cliente', texto: String(e.texto ?? ''), status: rotuloStatus(stPor, e.wa_message_id) });
    eventos.sort((x, y) => y.t - x.t);
  }
  // 24/10: enviar mensagem pela Eva também na captação (só para o proprietário).
  let janela = false;
  if (fim8.length === 8) {
    const desde23 = new Date(Date.now() - 23 * 3600e3).toISOString();
    const { count } = await sb.from('mensagens_buffer').select('id', { count: 'exact', head: true }).like('phone', '%' + fim8).gte('created_at', desde23);
    janela = (count ?? 0) > 0;
  }
  const resumo = String((c.payload as { resumo?: string } | null)?.resumo ?? '').trim();
  // Lojas REMAX mais próximas do imóvel (só fora da capital).
  // Endereço: o desta captação ou, se vazio, o que a Eva registrou depois (resumo do WhatsApp) para o mesmo telefone.
  let endBase = { endereco: c.endereco as string | null, bairro: c.bairro as string | null };
  if (!endBase.endereco && fim8.length === 8) {
    const { data: outra } = await sb.from('captacao_leads').select('endereco,bairro').like('telefone', '%' + fim8).not('endereco', 'is', null)
      .gte('criado_em', new Date(new Date(c.criado_em).getTime() - 30 * 864e5).toISOString()).order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (outra) endBase = { endereco: outra.endereco, bairro: outra.bairro };
  }
  const enderecoImovel = [endBase.endereco, endBase.bairro && endBase.bairro !== 'Outro' ? endBase.bairro : ''].filter(Boolean).join(', ');
  const prox = enderecoImovel ? await lojasProximas(enderecoImovel) : null;
  const lojas = prox && !prox.capital ? prox.lojas : [];

  return (
    <main style={{ backgroundColor: '#f8fafc' }} className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/sdr" className="text-sm text-slate-500">← Funil do SDR</Link>
        <header style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{c.nome || 'Proprietário'}</h1>
            {c.referenciado_em ? (
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">Captação · referenciada</span>
            ) : c.descartado_em ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">Captação · descartada</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Captação · esperando você</span>
            )}
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {tel && <div className="flex gap-3"><dt className="w-24 text-slate-500">Telefone</dt><dd><a href={'https://wa.me/' + tel55} target="_blank" className="text-blue-700 underline">{telFmt(tel55)}</a></dd></div>}
            <div className="flex gap-3"><dt className="w-24 text-slate-500">Quer</dt><dd className="text-slate-900">{[quer, c.tipo, c.bairro].filter(Boolean).join(' · ')}</dd></div>
            {endBase.endereco && <div className="flex gap-3"><dt className="w-24 text-slate-500">Endereço</dt><dd className="text-slate-900">{endBase.endereco}{endBase.bairro && endBase.bairro !== 'Outro' ? ' · ' + endBase.bairro : ''}</dd></div>}
            <div className="flex gap-3"><dt className="w-24 text-slate-500">Entrou</dt><dd className="text-slate-900">{fmt.format(new Date(c.criado_em))}</dd></div>
            {resumo && <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-500">Resumo</dt><dd className="min-w-0 whitespace-pre-line break-words text-slate-900">{resumo}</dd></div>}
          </dl>
        </header>

        <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Conversa</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {eventos.slice(0, 40).map((e) => (
              <li key={e.k} className="py-2 text-sm">
                <p className={'text-xs ' + (e.rotulo.includes('Eva') ? 'font-medium text-blue-700' : 'text-slate-500')}>{(e.aprox ? '~' : '') + fmt.format(new Date(e.t))} · {e.rotulo}{e.status ? ' · ' + e.status : ''}</p>
                <p className="mt-0.5 whitespace-pre-line break-words text-slate-800">{e.texto.slice(0, 600)}</p>
              </li>
            ))}
            {!eventos.length && <li className="py-2 text-sm text-slate-400">Sem conversa registrada.</li>}
          </ul>
        </section>
        {tel && (
          <MensagemEva leadId="" captacaoId={c.id}
            destinos={[{ chave: 'cliente', destino: 'cliente', rotulo: 'Proprietário', detalhe: (c.nome ? String(c.nome).split(' ')[0] + ' · ' : '') + telFmt(tel55), janela }]} />
        )}
        {c.referenciado_em ? (
          <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">Referenciada em {fmt.format(new Date(c.referenciado_em))}. O aceite e o e-mail seguem pela Eva; acompanhe em Referenciamentos.</p>
        ) : c.descartado_em ? (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">Descartada em {fmt.format(new Date(c.descartado_em))}.</p>
        ) : tel ? (
          <>
            <Decisao modo="captacao" id={c.id} corretores={(cors ?? []) as CorretorOpc[]} filaAtual={[]}
              podeOfertar podeSegurar={false} podeDescartar emCascata={false} />
            {lojas.length > 0 && (
              <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Lojas REMAX mais próximas</h2>
                <p className="text-xs text-slate-500">Imóvel em {prox?.cidade}{prox?.uf ? ' (' + prox.uf + ')' : ''}, fora da capital. Fonte: site da REMAX Brasil.</p>
                <ul className="mt-2 divide-y divide-slate-100">
                  {lojas.map((l) => (
                    <li key={l.id} className="py-2 text-sm">
                      <p className="font-medium text-slate-900">{l.nome} · {l.km.toLocaleString('pt-BR')} km</p>
                      <p className="text-slate-600">{l.endereco} — {l.cidade}/{l.uf}</p>
                      <p className="text-slate-600">{l.telefone || 'sem telefone'}{l.email ? ' · ' + l.email : ''} · {l.anuncios} anúncios</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <ReferenciarCaptacao id={c.id} sugestoes={lojas.map((l) => ({ unidade: l.nome, whatsapp: l.telefone.replace(/\D/g, ''), email: l.email, regiao: [prox?.cidade, prox?.uf].filter(Boolean).join(' / '), rotulo: l.nome + ' (' + l.km.toLocaleString('pt-BR') + ' km)' }))} />
          </>
        ) : (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">Esta captação não tem telefone (foi só um clique no WhatsApp).</p>
        )}
      </div>
    </main>
  );
}

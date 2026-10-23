// Tela de UM lead do SDR — aberta pelo link do cartão no WhatsApp.
// Decisão por toque (fila / segurar / descartar), sem texto livre.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirSdrGestao } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Decisao, { type CorretorOpc, type ImovelRef } from '../../decisao';
import Resgatar from './resgatar';
import MensagemEva, { type DestinoMsg } from './mensagem';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lead — SDR REMAX Ville' };

type Lead = {
  id: string; nome: string | null; telefone: string; status: string; origem: string; fonte: string | null;
  intencao: string | null; tipologia: string | null; bairros: string[] | null; valor_max: number | null;
  imovel_anuncio_ref: string | null; imovel_anuncio_url: string | null; imovel_anuncio_endereco: string | null;
  imovel_anuncio_valor: number | null; imovel_anuncio_tipo: string | null; temperatura: string | null; resumo: string | null;
  fila_corretores: string[] | null; corretor_phone: string | null; created_at: string; cartao_enviado_em: string | null;
  motivo_arquivamento: string | null;
};
type Msg = { id: string; created_at: string; direcao: string; interlocutor: string; telefone: string | null; template: string | null; conteudo: string | null };

const STATUS: Record<string, { t: string; c: string }> = {
  aguardando_guilherme: { t: 'Esperando você', c: 'bg-amber-100 text-amber-800' },
  em_cascata: { t: 'Ofertando aos corretores', c: 'bg-blue-100 text-blue-800' },
  atribuido: { t: 'Com corretor', c: 'bg-emerald-100 text-emerald-800' },
  direto: { t: 'Direto ao gestor', c: 'bg-emerald-100 text-emerald-800' },
  visita_agendada: { t: 'Visita agendada', c: 'bg-emerald-100 text-emerald-800' },
  arquivado: { t: 'Arquivado', c: 'bg-slate-200 text-slate-700' },
  encerrado: { t: 'Encerrado', c: 'bg-slate-200 text-slate-700' },
  aguardando_cliente: { t: 'Esperando o cliente', c: 'bg-slate-100 text-slate-700' },
  em_qualificacao: { t: 'Em qualificação', c: 'bg-slate-100 text-slate-700' },
  qualificado: { t: 'Qualificado', c: 'bg-slate-100 text-slate-700' },
};
const ETAPA_CAP: Record<string, string> = { v1_agendada: 'V1 agendada', v1_realizada: 'V1 realizada', v2_agendada: 'V2 agendada', v2_realizada: 'V2 realizada', contrato_assinado: 'Contrato assinado', cancelada: 'Desistiu' };
type Indicacao = { id: number; status: string; corretor_nome: string | null; corretor_whatsapp: string | null; unidade_nome: string | null; mlsid: string | null; percentual_referenciamento: number | null; criado_em: string; aceite_em: string | null; email_enviado_em: string | null; email_corretor: string | null; observacoes: string | null;
  followup_enviado_em: string | null; followup_respondido_em: string | null; followup_resposta: string | null; followup_contato: boolean | null; followup_visita: boolean | null };
const STATUS_IND: Record<string, { t: string; c: string }> = {
  aguardando_aceite: { t: 'Aguardando aceite', c: 'bg-amber-100 text-amber-800' },
  aceito_aguardando_email: { t: 'Aceito · aguardando e-mail do corretor', c: 'bg-blue-100 text-blue-800' },
  email_enviado: { t: 'Aceito · dados enviados', c: 'bg-emerald-100 text-emerald-800' },
  recusado: { t: 'Recusado', c: 'bg-red-100 text-red-700' },
  sem_resposta: { t: 'Sem resposta', c: 'bg-slate-200 text-slate-700' },
  convertida: { t: 'Convertida', c: 'bg-violet-100 text-violet-800' },
  perdida: { t: 'Perdida', c: 'bg-slate-200 text-slate-700' },
  cancelada: { t: 'Cancelada', c: 'bg-slate-200 text-slate-700' },
};
const INTENCAO: Record<string, string> = { compra: 'Compra', aluguel: 'Aluguel', venda: 'Venda (proprietário)' };
const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const brl = (v: number | null) => (v == null ? null : 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const telFmt = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };

function Linha({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 break-words text-slate-900">{v}</dd>
    </div>
  );
}

export default async function LeadSdr({ params }: { params: Promise<{ id: string }> }) {
  await exigirSdrGestao();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = supabaseAdmin();

  const [{ data: lead }, { data: msgs }, { data: cors }, { data: outros }, { data: etapasCap }, { data: imvs }] = await Promise.all([
    sb.from('sdr_leads').select('*').eq('id', id).maybeSingle(),
    sb.from('sdr_mensagens').select('id,created_at,direcao,interlocutor,telefone,template,conteudo').eq('lead_id', id).order('created_at', { ascending: false }).limit(40),
    sb.from('corretores_associados').select('phone,nome,apelido,foto_url').eq('status', 'ativo').not('phone', 'is', null).order('nome'),
    sb.from('sdr_leads').select('id,nome,imovel_anuncio_endereco,bairros').eq('status', 'aguardando_guilherme').neq('id', id).gte('updated_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('cartao_enviado_em', { ascending: false }).limit(10),
    sb.from('sdr_captacao_etapas').select('etapa,quando,created_at').eq('lead_id', id).order('created_at'),
    sb.from('sdr_imoveis_lead').select('ref,endereco,parceiro_nome,parceiro_origem').eq('lead_id', id).not('ref', 'is', null),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;
  // Referenciamentos deste cliente (tabela indicacoes, mesmo telefone, a partir da chegada do lead)
  const fim8 = l.telefone.replace(/\D/g, '').slice(-8);
  const { data: inds } = await sb.from('indicacoes')
    .select('id,status,corretor_nome,corretor_whatsapp,unidade_nome,mlsid,percentual_referenciamento,criado_em,aceite_em,email_enviado_em,email_corretor,observacoes,cliente_telefone,followup_enviado_em,followup_respondido_em,followup_resposta,followup_contato,followup_visita')
    .like('cliente_telefone', '%' + fim8)
    .gte('criado_em', new Date(new Date(l.created_at).getTime() - 864e5).toISOString())
    .order('criado_em', { ascending: false });
  const indicacoes = (inds ?? []) as Indicacao[];
  // Resgatar (13/10): referenciamento sem aceite pode ser cancelado; recusado com o lead ainda
  // arquivado como referenciado pode voltar. Se alguém já aceitou, não aparece.
  const algumAceito = indicacoes.some((r) => ['aceito_aguardando_email', 'email_enviado'].includes(r.status));
  const corretores = (cors ?? []) as CorretorOpc[];
  const porPhone = new Map(corretores.map((c) => [c.phone, c]));
  const nomeCor = (p: string) => { const c = porPhone.get(p); return c ? (c.apelido?.trim() || c.nome.split(' ')[0]) : telFmt(p); };
  // Conversa do cliente com a Eva: mensagens do cliente (mensagens_buffer, com horário) + respostas da Eva (n8n_chat_histories).
  const desde = new Date(new Date(l.created_at).getTime() - 864e5).toISOString();
  const [{ data: buf }, { data: hist }] = await Promise.all([
    sb.from('mensagens_buffer').select('id,mensagem_texto,tipo_msg,created_at,processado_em').like('phone', '%' + fim8).gte('created_at', desde).order('created_at').limit(200),
    sb.from('n8n_chat_histories').select('id,message').like('session_id', '%' + fim8).order('id', { ascending: false }).limit(120),
  ]);
  type Ev = { k: string; t: number; rotulo: string; texto: string };
  const eventos: Ev[] = [];
  const bufs = (buf ?? []) as { id: number; mensagem_texto: string | null; tipo_msg: string | null; created_at: string; processado_em: string | null }[];
  for (const b of bufs) {
    const tx = (b.mensagem_texto || '').trim() || (b.tipo_msg && b.tipo_msg !== 'text' ? '[' + b.tipo_msg + ']' : '');
    if (tx) eventos.push({ k: 'b' + b.id, t: new Date(b.created_at).getTime(), rotulo: 'cliente → Eva', texto: tx });
  }
  // Respostas da Eva: o histórico não tem horário; cada resposta herda o horário de processamento da mensagem do cliente que a originou.
  const enviadosCliente = new Set(((msgs ?? []) as Msg[]).filter((m) => m.interlocutor === 'cliente').map((m) => String(m.conteudo ?? '').trim()));
  const limpa = (c: string) => c.replace(/^(\s*\[[^\]]*\]\s*)+/, '').trim();
  let ptr = 0; let tRef: number | null = null; let seq = 0;
  for (const h of [...((hist ?? []) as { id: number; message: { type?: string; content?: string } }[])].reverse()) {
    const c = String(h.message?.content ?? '');
    if (h.message?.type === 'human') {
      const tx = limpa(c);
      tRef = null; seq = 0;
      for (let i = ptr; i < bufs.length; i++) {
        const bt = (bufs[i].mensagem_texto || '').trim();
        if (bt && tx && (tx.includes(bt) || bt.includes(tx))) { tRef = new Date(bufs[i].processado_em || bufs[i].created_at).getTime(); ptr = i + 1; break; }
      }
    } else if (h.message?.type === 'ai' && tRef != null) {
      const tx = c.trim();
      if (!tx || tx.startsWith('[') || enviadosCliente.has(tx)) continue;
      eventos.push({ k: 'h' + h.id, t: tRef + 1000 * ++seq, rotulo: 'Eva → cliente', texto: tx });
    }
  }
  for (const m of (msgs ?? []) as Msg[]) {
    eventos.push({ k: 'm' + m.id, t: new Date(m.created_at).getTime(),
      rotulo: (m.direcao === 'in' ? 'de ' : 'para ') + m.interlocutor + (m.interlocutor === 'corretor' && m.telefone ? ' ' + nomeCor(m.telefone) : ''),
      texto: m.template === 'comando_fila' ? 'Fila: ' + String(m.conteudo ?? '').split(',').filter(Boolean).map(nomeCor).join(' → ') : String(m.conteudo ?? '') });
  }
  eventos.sort((a, b) => b.t - a.t);
  const linhaTempo = eventos.slice(0, 40);
  // Enviar mensagem pela Eva (18/10): cliente, corretor Ville do lead e corretores parceiros dos imóveis.
  const { data: parcs } = await sb.from('sdr_imoveis_lead').select('id,ref,parceiro_nome,parceiro_telefone,parceiro_origem').eq('lead_id', id).not('parceiro_telefone', 'is', null).order('created_at', { ascending: false });
  const destinosMsg: DestinoMsg[] = [{ chave: 'cliente', destino: 'cliente', rotulo: 'Cliente', detalhe: (l.nome ? l.nome.split(' ')[0] + ' · ' : '') + telFmt(l.telefone), janela: false }];
  if (l.corretor_phone) destinosMsg.push({ chave: 'corretor', destino: 'corretor', rotulo: 'Corretor Ville', detalhe: nomeCor(l.corretor_phone) + ' · ' + telFmt(l.corretor_phone), janela: false });
  const vistosMsg = new Set<string>();
  for (const p of (parcs ?? []) as { id: string; ref: string | null; parceiro_nome: string | null; parceiro_telefone: string; parceiro_origem: string | null }[]) {
    const tel = p.parceiro_telefone.replace(/\D/g, '');
    if (['ville', 'proprietario', 'pulado'].includes(p.parceiro_origem ?? '') || tel.length < 10 || vistosMsg.has(tel.slice(-8))) continue;
    vistosMsg.add(tel.slice(-8));
    destinosMsg.push({ chave: 'p' + p.id, destino: 'parceiro', imovelId: p.id, rotulo: 'Parceiro' + (p.ref ? ' · ' + p.ref : ''), detalhe: (p.parceiro_nome?.trim() || 'Corretor') + ' · ' + telFmt(tel), janela: false });
  }
  const desde23 = new Date(Date.now() - 23 * 3600e3).toISOString();
  await Promise.all(destinosMsg.map(async (dm) => {
    const tel = dm.destino === 'cliente' ? l.telefone : dm.destino === 'corretor' ? String(l.corretor_phone) : dm.detalhe;
    const f8 = tel.replace(/\D/g, '').slice(-8);
    const [{ count: a }, { count: b }] = await Promise.all([
      sb.from('mensagens_buffer').select('id', { count: 'exact', head: true }).like('phone', '%' + f8).gte('created_at', desde23),
      sb.from('sdr_mensagens').select('id', { count: 'exact', head: true }).like('telefone', '%' + f8).eq('direcao', 'in').gte('created_at', desde23),
    ]);
    dm.janela = (a ?? 0) + (b ?? 0) > 0;
  }));
  const st = STATUS[l.status] ?? { t: l.status, c: 'bg-slate-100 text-slate-700' };
  const aberto = ['aguardando_guilherme', 'em_cascata'].includes(l.status) && !l.corretor_phone;
  // Encaminhar está sempre disponível; fora de "esperando você"/"ofertando" ele reabre o lead.
  const reabre = !aberto;
  const fila = l.fila_corretores ?? [];
  const wa = 'https://wa.me/' + l.telefone.replace(/\D/g, '');
  // Imóveis que dá para referenciar: o do anúncio + os de parceiros (outras unidades) enviados ao cliente.
  const vistos = new Set<string>();
  const imoveisRef: ImovelRef[] = [];
  if (l.imovel_anuncio_ref) { vistos.add(l.imovel_anuncio_ref); imoveisRef.push({ ref: l.imovel_anuncio_ref, rotulo: 'Anúncio: ' + (l.imovel_anuncio_endereco || l.imovel_anuncio_ref), parceiro: null }); }
  for (const i of (imvs ?? []) as { ref: string; endereco: string | null; parceiro_nome: string | null; parceiro_origem: string | null }[]) {
    if (!i.ref || vistos.has(i.ref) || i.parceiro_origem === 'ville') continue;
    vistos.add(i.ref);
    imoveisRef.push({ ref: i.ref, rotulo: i.endereco || i.ref, parceiro: i.parceiro_nome });
  }
  const anunc = imoveisRef[0];
  if (anunc && anunc.parceiro == null) anunc.parceiro = ((imvs ?? []) as { ref: string; parceiro_nome: string | null }[]).find((i) => i.ref === anunc.ref)?.parceiro_nome ?? null;

  return (
    <main style={{ backgroundColor: '#f8fafc' }} className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/sdr" className="text-sm text-slate-500">← Funil do SDR</Link>

        <header style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{l.nome || 'Cliente sem nome'}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.c}`}>{st.t}</span>
          </div>
          <dl className="mt-3 divide-y divide-slate-100">
            <Linha k="Telefone" v={<><a href={wa} target="_blank" className="text-blue-700 underline">{telFmt(l.telefone)}</a> · <Link href={'/sdr/conversa/' + l.telefone.replace(/\D/g, '')} className="text-blue-700 underline">conversa completa</Link></>} />
            <Linha k="Quer" v={[l.intencao ? INTENCAO[l.intencao] ?? l.intencao : null, l.tipologia, (l.bairros ?? []).join(', ')].filter(Boolean).join(' · ')} />
            <Linha k="Imóvel" v={l.imovel_anuncio_endereco ? (
              <>
                {l.imovel_anuncio_endereco}
                {l.imovel_anuncio_valor ? ' · ' + brl(l.imovel_anuncio_valor) : ''}
                {l.imovel_anuncio_url && <> · <a href={l.imovel_anuncio_url} target="_blank" className="text-blue-700 underline">anúncio</a></>}
              </>
            ) : null} />
            <Linha k="Até" v={brl(l.valor_max)} />
            <Linha k="Origem" v={[l.fonte, l.temperatura].filter(Boolean).join(' · ')} />
            <Linha k="Resumo" v={l.resumo} />
            <Linha k="Corretor" v={l.corretor_phone ? <>{nomeCor(l.corretor_phone)} · <Link href={'/sdr/conversa/' + l.corretor_phone.replace(/\D/g, '')} className="text-blue-700 underline">conversa</Link></> : null} />
            <Linha k="Fila" v={fila.length ? fila.map(nomeCor).join(' → ') : null} />
            <Linha k="Captação" v={(etapasCap ?? []).length ? (etapasCap as { etapa: string; quando: string | null; created_at: string }[]).map((e) =>
              (ETAPA_CAP[e.etapa] ?? e.etapa) + (e.quando ? ' ' + fmt.format(new Date(e.quando)) : '') + ' (' + fmt.format(new Date(e.created_at)).slice(0, 5) + ')').join(' → ') : null} />
            <Linha k="Arquivado" v={l.status === 'arquivado' ? l.motivo_arquivamento : null} />
            <Linha k="Entrou" v={fmt.format(new Date(l.created_at))} />
          </dl>
        </header>

        {indicacoes.map((r) => {
          const si = STATUS_IND[r.status] ?? { t: r.status, c: 'bg-slate-100 text-slate-700' };
          return (
            <section key={r.id} style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Referenciamento</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${si.c}`}>{si.t}</span>
              </div>
              <dl className="mt-2 divide-y divide-slate-100">
                <Linha k="Corretor" v={[r.corretor_nome, r.unidade_nome].filter(Boolean).join(' · ') + (r.corretor_whatsapp ? ' · ' + telFmt(r.corretor_whatsapp) : '')} />
                <Linha k="Imóvel" v={r.mlsid ? 'ref. ' + r.mlsid : null} />
                <Linha k="Percentual" v={r.percentual_referenciamento != null ? r.percentual_referenciamento + '%' : null} />
                <Linha k="Pedido" v={fmt.format(new Date(r.criado_em))} />
                <Linha k="Aceite" v={r.aceite_em ? fmt.format(new Date(r.aceite_em)) : null} />
                <Linha k="E-mail" v={r.email_enviado_em ? fmt.format(new Date(r.email_enviado_em)) + (r.email_corretor ? ' · ' + r.email_corretor : '') : null} />
                <Linha k="Follow-up" v={r.followup_enviado_em ? 'perguntado em ' + fmt.format(new Date(r.followup_enviado_em)) + (r.followup_respondido_em ? ' · respondeu ' + fmt.format(new Date(r.followup_respondido_em)) : ' · sem resposta') : null} />
                <Linha k="Contato com o cliente" v={r.followup_contato == null ? null : r.followup_contato ? 'sim' : 'não'} />
                <Linha k="Visita" v={r.followup_visita == null ? null : r.followup_visita ? 'agendada' : 'não'} />
                <Linha k="Resposta do corretor" v={r.followup_resposta} />
                <Linha k="Obs." v={r.observacoes} />
              </dl>
              {!algumAceito && (r.status === 'aguardando_aceite' || (r.status === 'recusado' && l.status === 'arquivado' && /referenciad/i.test(l.motivo_arquivamento ?? ''))) && (
                <Resgatar id={l.id} pendente={r.status === 'aguardando_aceite'} />
              )}
            </section>
          );
        })}

        <Decisao
          modo="lead" id={l.id} corretores={corretores} filaAtual={fila}
          podeOfertar podeSegurar={aberto} emCascata={l.status === 'em_cascata' && !l.corretor_phone}
          podeDescartar={!['atribuido', 'visita_agendada', 'encerrado', 'arquivado'].includes(l.status)}
          imoveisRef={imoveisRef}
        />

        {reabre && (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Lead {st.t.toLowerCase()}. Se você montar uma fila acima, ele é reaberto
            {l.corretor_phone ? ', sai do corretor atual' : ''} e a oferta começa pelo primeiro da fila.
          </p>
        )}

        <MensagemEva leadId={l.id} destinos={destinosMsg} />
        {destinosMsg.some((d) => d.destino === 'parceiro') && (
          <p className="-mt-2 px-1 text-xs text-slate-500">
            Conversa com parceiro:{' '}
            {destinosMsg.filter((d) => d.destino === 'parceiro').map((d, i) => (
              <span key={d.chave}>{i ? ' · ' : ''}<Link href={'/sdr/conversa/' + d.detalhe.replace(/\D/g, '').slice(-11)} className="text-blue-700 underline">{d.detalhe.split(' · ')[0]}</Link></span>
            ))}
          </p>
        )}

        <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Últimos acontecimentos</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {linhaTempo.map((e) => (
              <li key={e.k} className="py-2 text-sm">
                <p className={'text-xs ' + (e.rotulo.includes('Eva') ? 'font-medium text-blue-700' : 'text-slate-500')}>
                  {fmt.format(new Date(e.t))} · {e.rotulo}
                </p>
                <p className="mt-0.5 whitespace-pre-line break-words text-slate-800">{e.texto.slice(0, 600)}</p>
              </li>
            ))}
            {!linhaTempo.length && <li className="py-2 text-sm text-slate-400">Sem registros.</li>}
          </ul>
        </section>

        {!!(outros ?? []).length && (
          <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Outros esperando você</h2>
            <ul className="mt-2 space-y-1">
              {(outros as { id: string; nome: string | null; imovel_anuncio_endereco: string | null; bairros: string[] | null }[]).map((o) => (
                <li key={o.id}>
                  <Link href={'/sdr/lead/' + o.id} className="text-sm text-blue-700 underline">
                    {o.nome || 'Cliente'}{o.imovel_anuncio_endereco ? ' — ' + o.imovel_anuncio_endereco : (o.bairros ?? []).length ? ' — ' + (o.bairros ?? []).join(', ') : ''}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

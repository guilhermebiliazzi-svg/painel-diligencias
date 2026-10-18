// Treinamento de novatos — um novato: placar, tarefas por dia, quizzes, visitas,
// contatos e o histórico completo das mensagens com o Max. Só leitura. Só admin.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  TOTAL_DIAS, nomeDias, hojeSP, dm, diaSemanaDm, dataHora, telefone, atrasada,
  STATUS_TAREFA, STATUS_NOVATO, inicioJanela, type StatusTarefa,
} from '../util';
import EnviarMensagem from '../EnviarMensagem';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Novato — Treinamento — REMAX Ville' };

type Tarefa = {
  id: number; dia: number; data_prevista: string; titulo: string; status: StatusTarefa; nota: number | null;
  feedback: string | null; entregue_em: string | null; hora_inicio: string | null;
  onb_trilha: { tipo: string; ordem: number; hora_inicio: string | null; duracao_min: number | null; comprovacao: string | null; quiz_tema: string | null } | null;
};
type Quiz = { id: number; tema: string; tentativa: number; nota: number | null; aprovado: boolean | null; status: string; criado_em: string };
type Visita = { id: number; tipo: string; com_padrinho: boolean; data_hora: string | null; imovel: string | null; status: string };
type Contato = { data: string; fonte: string; resultado: string };
type Msg = { id: number; direcao: 'in' | 'out'; tipo: string; texto: string | null; criado_em: string };

const LIMITE_MSGS = 400;

const FONTE: Record<string, string> = {
  frog: 'F.R.O.G.', portal: 'Portais', territorio: 'Território', iconatus: 'Iconatus', captacao_eva: 'Fila da Eva', outro: 'Outros',
};
const RESULTADO: Record<string, string> = {
  tentativa: 'Tentativas', contato_efetivo: 'Conversou', v1_agendada: 'V1 marcada', sem_interesse: 'Sem interesse', retornar: 'Ligar depois',
};

function Secao({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {extra}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function NovatoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirTela('treinamento');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = supabaseAdmin();

  const { data: n, error } = await sb
    .from('onb_novatos')
    .select('id,nome,phone,status,data_inicio,dias_semana,agenda_ok,iconatus_ok,territorio,padrinho_id,observacoes')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!n) notFound();

  const [pla, tar, qui, vis, con, msg, padr] = await Promise.all([
    sb.from('onb_placar').select('*').eq('novato_id', id).maybeSingle(),
    sb.from('onb_tarefas')
      .select('id,dia,data_prevista,titulo,status,nota,feedback,entregue_em,hora_inicio,onb_trilha(tipo,ordem,hora_inicio,duracao_min,comprovacao,quiz_tema)')
      .eq('novato_id', id)
      .order('data_prevista')
      .order('dia'),
    sb.from('onb_quiz').select('id,tema,tentativa,nota,aprovado,status,criado_em').eq('novato_id', id).order('id'),
    sb.from('onb_visitas').select('id,tipo,com_padrinho,data_hora,imovel,status').eq('novato_id', id).order('data_hora', { ascending: true, nullsFirst: false }),
    sb.from('onb_contatos').select('data,fonte,resultado').eq('novato_id', id).limit(5000),
    sb.from('onb_mensagens').select('id,direcao,tipo,texto,criado_em').eq('phone', n.phone).order('id', { ascending: false }).limit(LIMITE_MSGS),
    n.padrinho_id
      ? sb.from('corretores_associados').select('nome').eq('id', n.padrinho_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const p = pla.data as {
    dia_atual: number; contatos_efetivos: number; tentativas: number; v1: number; v2: number; contratos: number;
    media_quiz: number | null; meta_contatos: number; meta_v1: number; meta_v2: number; meta_contratos: number;
  } | null;
  const tarefas = ((tar.data ?? []) as unknown as Tarefa[]).sort((a, b) =>
    a.data_prevista === b.data_prevista
      ? (a.hora_inicio ?? '') !== (b.hora_inicio ?? '')
        ? (a.hora_inicio ?? '99').localeCompare(b.hora_inicio ?? '99')
        : a.dia - b.dia || (a.onb_trilha?.ordem ?? 0) - (b.onb_trilha?.ordem ?? 0)
      : a.data_prevista.localeCompare(b.data_prevista)
  );
  const quizzes = (qui.data ?? []) as Quiz[];
  const visitas = (vis.data ?? []) as Visita[];
  const contatos = (con.data ?? []) as Contato[];
  const msgs = ((msg.data ?? []) as Msg[]).sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id - b.id);
  const padrinho = (padr.data as { nome: string } | null)?.nome ?? null;

  const hoje = hojeSP();
  const limiteJanela = inicioJanela();
  const janela = msgs.some((m) => m.direcao === 'in' && m.criado_em >= limiteJanela);
  const feitas = tarefas.filter((t) => t.status === 'aprovada' || t.status === 'dispensada').length;
  const atras = tarefas.filter((t) => atrasada(t, hoje)).length;
  const fim = tarefas.reduce((m, t) => (t.data_prevista > m ? t.data_prevista : m), '');
  const porData = new Map<string, Tarefa[]>();
  for (const t of tarefas) porData.set(t.data_prevista, [...(porData.get(t.data_prevista) ?? []), t]);

  const porFonte = new Map<string, number>();
  const porResultado = new Map<string, number>();
  for (const c of contatos) {
    porFonte.set(c.fonte, (porFonte.get(c.fonte) ?? 0) + 1);
    porResultado.set(c.resultado, (porResultado.get(c.resultado) ?? 0) + 1);
  }

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/treinamento" className="text-sm text-slate-500 hover:text-slate-800">← Todos os novatos</Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{n.nome}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {telefone(n.phone)} · trabalha {nomeDias(n.dias_semana)} · trilha de {dm(n.data_inicio)} a {dm(fim)}
              {padrinho ? ` · padrinho: ${padrinho}` : ''}
              {n.territorio ? ` · território: ${n.territorio}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_NOVATO[n.status] ?? 'bg-slate-100 text-slate-600'}`}>{n.status}</span>
            <Link href={`/treinamento/${id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Atualizar</Link>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Dia da trilha', `${Math.max(0, p?.dia_atual ?? 0)}/${TOTAL_DIAS}`, false],
            ['Tarefas feitas', `${feitas}/${tarefas.length}`, false],
            ['Atrasadas', String(atras), atras > 0],
            ['Contatos efetivos', `${p?.contatos_efetivos ?? 0}/${p?.meta_contatos ?? 80}`, false],
            ['V1 · V2 · contratos', `${p?.v1 ?? 0} · ${p?.v2 ?? 0} · ${p?.contratos ?? 0}`, false],
            ['Média dos quizzes', p?.media_quiz != null ? String(p.media_quiz) : '—', false],
          ].map(([rot, val, alerta]) => (
            <div key={rot as string} style={{ backgroundColor: '#ffffff' }} className={`rounded-xl border p-3 ${alerta ? 'border-rose-200' : 'border-slate-200'}`}>
              <p className={`text-lg font-semibold tabular-nums ${alerta ? 'text-rose-700' : 'text-slate-900'}`}>{val}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{rot}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${n.agenda_ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{n.agenda_ok ? 'Google Agenda ligada' : 'Google Agenda não ligada'}</span>
          <span className={`rounded-full px-2 py-0.5 ${n.iconatus_ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{n.iconatus_ok ? 'Login do Iconatus entregue' : 'Iconatus não entregue'}</span>
          {n.observacoes && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Obs.: {n.observacoes}</span>}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* Coluna esquerda: trilha */}
          <div className="space-y-6 lg:col-span-3">
            <Secao titulo="Trilha" extra={<span className="text-xs text-slate-500">{tarefas.length} tarefas</span>}>
              <div className="space-y-4">
                {[...porData.entries()].map(([data, ts]) => {
                  const dias = [...new Set(ts.map((t) => t.dia))];
                  const ehHoje = data === hoje;
                  return (
                    <div key={data}>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${ehHoje ? 'text-blue-700' : 'text-slate-500'}`}>
                        {diaSemanaDm(data)} · {dias.length > 1 ? `dias ${dias[0]} a ${dias[dias.length - 1]}` : `dia ${dias[0]}`}{ehHoje ? ' · hoje' : ''}
                      </p>
                      <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-100">
                        {ts.map((t) => {
                          const st = STATUS_TAREFA[t.status] ?? STATUS_TAREFA.pendente;
                          const hora = (t.hora_inicio ?? t.onb_trilha?.hora_inicio ?? '').slice(0, 5);
                          const late = atrasada(t, hoje);
                          return (
                            <li key={t.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                              <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">{hora || '—'}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-slate-800">{t.titulo}</p>
                                {t.feedback && <p className="mt-0.5 text-xs text-slate-500">Max: {t.feedback}</p>}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${late ? 'bg-rose-100 text-rose-800' : st.classe}`}>{late ? 'Atrasada' : st.rotulo}</span>
                                {t.nota != null && <span className="text-[11px] tabular-nums text-slate-500">nota {t.nota}</span>}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Secao>
          </div>

          {/* Coluna direita: quizzes, visitas, contatos e conversa */}
          <div className="order-first space-y-6 lg:order-none lg:col-span-2">
            <Secao
              titulo="Conversa com o Max"
              extra={<span className="text-xs text-slate-500">{msgs.length >= LIMITE_MSGS ? `últimas ${LIMITE_MSGS}` : `${msgs.length} mensagens`}</span>}
            >
              <div className="mb-4 border-b border-slate-100 pb-4">
                <EnviarMensagem destinatarios={[{ id: n.id, nome: n.nome, status: n.status, janela }]} />
              </div>
              {msgs.length === 0 ? (
                <p className="text-sm text-slate-500">Ainda não há mensagens.</p>
              ) : (
                <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                  {msgs.map((m) => {
                    const max = m.direcao === 'out';
                    const erroEnvio = (m.texto ?? '').startsWith('[ERRO');
                    return (
                      <div key={m.id} className={`flex ${max ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${erroEnvio ? 'bg-rose-50 text-rose-900' : max ? (m.tipo.startsWith('painel') ? 'bg-blue-50 text-slate-800' : 'bg-emerald-50 text-slate-800') : 'bg-slate-100 text-slate-800'}`}>
                          <p className="whitespace-pre-line break-words">{m.texto || (m.tipo !== 'text' ? `[${m.tipo}]` : '')}</p>
                          <p className="mt-1 text-right text-[10px] text-slate-400">
                            {max ? (m.tipo.startsWith('painel') ? 'Você, pelo Max' : 'Max') : n.nome.split(' ')[0]}{m.tipo === 'template' || m.tipo === 'painel_modelo' ? ' · modelo' : m.tipo !== 'text' && m.tipo !== 'painel' ? ` · ${m.tipo}` : ''} · {dataHora(m.criado_em)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Secao>

            <Secao titulo="Quizzes">
              {quizzes.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum quiz ainda.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {quizzes.map((q) => (
                    <li key={q.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-800">{q.tema.replace(/_/g, ' ')} <span className="text-xs text-slate-400">({q.tentativa}ª)</span></span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${q.status === 'aberto' ? 'bg-blue-100 text-blue-800' : q.aprovado ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {q.status === 'aberto' ? 'aberto' : `nota ${q.nota ?? '—'}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            <Secao titulo="Visitas">
              {visitas.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma visita registrada.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {visitas.map((v) => (
                    <li key={v.id} className="flex items-start justify-between gap-2">
                      <span className="text-slate-800">
                        <b>{v.tipo}</b>{v.com_padrinho ? ' com padrinho' : ''} · {v.data_hora ? dataHora(v.data_hora) : 'sem data'}
                        {v.imovel ? <span className="block text-xs text-slate-500">{v.imovel}</span> : null}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{v.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            <Secao titulo="Prospecção" extra={<span className="text-xs text-slate-500">{contatos.length} registros</span>}>
              {contatos.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum contato registrado.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <ul className="space-y-1">
                    {[...porFonte.entries()].sort((a, b) => b[1] - a[1]).map(([f, q]) => (
                      <li key={f} className="flex justify-between"><span className="text-slate-600">{FONTE[f] ?? f}</span><b className="tabular-nums">{q}</b></li>
                    ))}
                  </ul>
                  <ul className="space-y-1">
                    {[...porResultado.entries()].sort((a, b) => b[1] - a[1]).map(([r, q]) => (
                      <li key={r} className="flex justify-between"><span className="text-slate-600">{RESULTADO[r] ?? r}</span><b className="tabular-nums">{q}</b></li>
                    ))}
                  </ul>
                </div>
              )}
            </Secao>

          </div>
        </div>
      </main>
    </div>
  );
}

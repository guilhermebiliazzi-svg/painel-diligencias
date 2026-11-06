// Treinamento de novatos — visão geral da trilha do Max (IA de treinamento no
// WhatsApp 5192-8192). Só leitura. Só admin.
import Link from 'next/link';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verificarContratos, nomeEmpresa } from '@/lib/onb-contrato';
import Reenviar from './reenviar';
import { TOTAL_DIAS, nomeDias, hojeSP, dm, dataHora, telefone, atrasada, STATUS_NOVATO } from './util';

export const dynamic = 'force-dynamic';
// reenvio de contrato (PDF + Clicksign) roda nesta página
export const maxDuration = 120;
export const metadata = { title: 'Treinamento de novatos — REMAX Ville' };

type Novato = {
  id: string; nome: string; phone: string; status: string; data_inicio: string;
  dias_semana: number[] | null; agenda_ok: boolean; iconatus_ok: boolean; padrinho_id: number | null;
};
type Placar = {
  novato_id: string; dia_atual: number; contatos_efetivos: number; tentativas: number; v1: number; v2: number;
  contratos: number; media_quiz: number | null; meta_contatos: number; meta_v1: number; meta_v2: number; meta_contratos: number;
};
type Tarefa = { novato_id: string; status: string; data_prevista: string };
type Contrato = { id: string; contrato_status: string | null; contrato_empresa: string | null; contrato_erro: string | null; boas_vindas_em: string | null };
const CONTRATO: Record<string, [string, string]> = {
  enviando: ['contrato: enviando', 'bg-amber-50 text-amber-800'],
  aguardando: ['contrato: aguardando assinatura', 'bg-amber-50 text-amber-800'],
  assinado: ['contrato assinado', 'bg-emerald-50 text-emerald-700'],
  erro: ['contrato: erro no envio', 'bg-rose-50 text-rose-700'],
  cancelado: ['contrato cancelado', 'bg-slate-100 text-slate-600'],
};
type Msg = { phone: string; direcao: 'in' | 'out'; criado_em: string; texto: string | null };

async function carregar() {
  const sb = supabaseAdmin();
  // contratos de associação pendentes: confere a assinatura (no máximo 1x por minuto por novato)
  await verificarContratos().catch(() => null);
  const ct = await sb.from('onb_novatos').select('id,contrato_status,contrato_empresa,contrato_erro,boas_vindas_em');
  const contratos = new Map(((ct.error ? [] : ct.data) as Contrato[]).map((c) => [c.id, c]));
  const [nov, pla, tar, msg] = await Promise.all([
    sb.from('onb_novatos').select('id,nome,phone,status,data_inicio,dias_semana,agenda_ok,iconatus_ok,padrinho_id').order('data_inicio', { ascending: false }),
    sb.from('onb_placar').select('*'),
    sb.from('onb_tarefas').select('novato_id,status,data_prevista').limit(5000),
    sb.from('onb_mensagens').select('phone,direcao,criado_em,texto').order('id', { ascending: false }).limit(1000),
  ]);
  for (const r of [nov, pla, tar, msg]) if (r.error) throw new Error(r.error.message);
  const novatos = (nov.data ?? []) as Novato[];
  const ids = [...new Set(novatos.map((n) => n.padrinho_id).filter((x): x is number => !!x))];
  const padr = ids.length ? await sb.from('corretores_associados').select('id,nome').in('id', ids) : { data: [] };
  return {
    novatos,
    contratos,
    placar: new Map(((pla.data ?? []) as Placar[]).map((p) => [p.novato_id, p])),
    tarefas: (tar.data ?? []) as Tarefa[],
    msgs: (msg.data ?? []) as Msg[],
    padrinhos: new Map(((padr.data ?? []) as { id: number; nome: string }[]).map((p) => [p.id, p.nome])),
  };
}

function Barra({ valor, meta, cor }: { valor: number; meta: number; cor: string }) {
  const pct = meta > 0 ? Math.min(100, Math.round((valor / meta) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div className={`h-1.5 rounded-full ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function TreinamentoPage() {
  await exigirTela('treinamento');
  let dados: Awaited<ReturnType<typeof carregar>> | null = null;
  let erro: string | null = null;
  try {
    dados = await carregar();
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  const hoje = hojeSP();

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Treinamento de novatos</h1>
            <p className="mt-1 text-sm text-slate-600">
              Trilha de 30 dias conduzida pelo Max no WhatsApp (11) 5192-8192. Cadastre os novatos aqui; para mudar datas,
              dias de trabalho ou padrinho, fale com o Max pelo seu número.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/treinamento/novo" className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800">
              Cadastrar novatos
            </Link>
            <Link href="/treinamento/enviar" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              Mensagem pelo Max
            </Link>
            <Link href="/treinamento" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Atualizar
            </Link>
          </div>
        </div>

        {erro && (
          <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Não consegui ler os dados do treinamento: {erro}</p>
        )}

        {dados && dados.novatos.length === 0 && (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Nenhum novato cadastrado ainda. Use &quot;Cadastrar novatos&quot;.
          </p>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {dados?.novatos.map((n) => {
            const p = dados!.placar.get(n.id);
            const ts = dados!.tarefas.filter((t) => t.novato_id === n.id);
            const feitas = ts.filter((t) => t.status === 'aprovada' || t.status === 'dispensada').length;
            const atras = ts.filter((t) => atrasada(t, hoje)).length;
            const fim = ts.reduce((m, t) => (t.data_prevista > m ? t.data_prevista : m), '');
            const ultima = dados!.msgs.find((m) => m.phone === n.phone);
            const ultimaIn = dados!.msgs.find((m) => m.phone === n.phone && m.direcao === 'in');
            const padrinho = n.padrinho_id ? dados!.padrinhos.get(n.padrinho_id) : null;
            const ctr = dados!.contratos.get(n.id);
            const selo = ctr?.contrato_status ? CONTRATO[ctr.contrato_status] : null;
            const reenviar = ctr?.contrato_status === 'erro' || ctr?.contrato_status === 'cancelado';
            return (
              <div key={n.id} className="flex flex-col gap-2">
              <Link
                href={`/treinamento/${n.id}`}
                style={{ backgroundColor: '#ffffff' }}
                className="group flex-1 rounded-2xl border border-slate-200 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-900">{n.nome}</h2>
                    <p className="text-xs text-slate-500">
                      {telefone(n.phone)} · {nomeDias(n.dias_semana)} · {dm(n.data_inicio)} a {dm(fim)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_NOVATO[n.status] ?? 'bg-slate-100 text-slate-600'}`}>{n.status}</span>
                </div>
                {selo && (
                  <p className={`mt-2 rounded-lg px-2 py-1 text-xs ${selo[1]}`} title={ctr?.contrato_erro ?? undefined}>
                    {selo[0]} · {nomeEmpresa(ctr?.contrato_empresa)}
                    {ctr?.contrato_status === 'erro' && ctr.contrato_erro ? ` — ${ctr.contrato_erro}` : ''}
                    {ctr?.contrato_status === 'assinado' && !ctr.boas_vindas_em ? ' — boas-vindas ainda não saíram' : ''}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{Math.max(0, p?.dia_atual ?? 0)}<span className="text-xs font-normal text-slate-500">/{TOTAL_DIAS}</span></p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">dia da trilha</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{feitas}<span className="text-xs font-normal text-slate-500">/{ts.length}</span></p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">tarefas feitas</p>
                  </div>
                  <div className={`rounded-xl p-2 ${atras > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                    <p className={`text-lg font-semibold tabular-nums ${atras > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{atras}</p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">atrasadas</p>
                  </div>
                </div>

                {p && (
                  <div className="mt-4 space-y-2 text-xs text-slate-600">
                    <div>
                      <div className="flex justify-between"><span>Contatos efetivos</span><span className="tabular-nums">{p.contatos_efetivos}/{p.meta_contatos}</span></div>
                      <Barra valor={p.contatos_efetivos} meta={p.meta_contatos} cor="bg-blue-500" />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>V1 <b className="tabular-nums text-slate-900">{p.v1}/{p.meta_v1}</b></span>
                      <span>V2 <b className="tabular-nums text-slate-900">{p.v2}/{p.meta_v2}</b></span>
                      <span>Contratos <b className="tabular-nums text-slate-900">{p.contratos}/{p.meta_contratos}</b></span>
                      <span>Média quiz <b className="tabular-nums text-slate-900">{p.media_quiz ?? '—'}</b></span>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 ${n.agenda_ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {n.agenda_ok ? 'Agenda ligada' : 'Agenda não ligada'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${n.iconatus_ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {n.iconatus_ok ? 'Iconatus ok' : 'Sem Iconatus'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Padrinho: {padrinho ?? '—'}</span>
                </div>

                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  Última mensagem: {ultima ? `${dataHora(ultima.criado_em)} (${ultima.direcao === 'in' ? 'novato' : 'Max'})` : '—'}
                  {ultimaIn ? ` · novato escreveu ${dataHora(ultimaIn.criado_em)}` : ' · novato ainda não escreveu'}
                </p>
              </Link>
              {reenviar && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                  <Reenviar id={n.id} nome={n.nome} />
                </div>
              )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

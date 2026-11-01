// Oficinas da loja — lista. O monitor vê as suas; o administrador vê todas.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acessoOficinas, diaMonitor, nomeCurto, dataLonga, type Oficina, type Monitor } from '@/lib/oficinas';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Oficinas — REMAX Ville' };

export default async function OficinasPage() {
  const a = await acessoOficinas();
  const sb = supabaseAdmin();
  const [ofi, mon, pre] = await Promise.all([
    sb.from('onb_oficinas').select('id,slug,nome,ordem').eq('ativa', true).order('ordem'),
    sb.from('onb_oficina_monitores').select('id,oficina_id,corretor_id,dia_semana,periodo'),
    sb.from('onb_oficina_presencas').select('oficina_id,data,corretor_id').order('data', { ascending: false }).limit(5000),
  ]);
  const erro = ofi.error?.message || mon.error?.message || pre.error?.message;

  const oficinas = ((ofi.data ?? []) as Oficina[]).filter((o) => a.admin || a.minhas.includes(Number(o.id)));
  const monitores = (mon.data ?? []) as Monitor[];
  const ids = [...new Set(monitores.map((m) => Number(m.corretor_id)))];
  const nomes = new Map<number, string>();
  if (ids.length) {
    const { data } = await sb.from('corretores_associados').select('id,nome').in('id', ids);
    for (const c of (data ?? []) as { id: number; nome: string }[]) nomes.set(Number(c.id), nomeCurto(c.nome));
  }
  const presencas = (pre.data ?? []) as { oficina_id: number; data: string; corretor_id: number }[];

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">{a.admin ? 'Oficinas da loja' : 'Minhas oficinas'}</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">
          Registre a presença de quem participou e acesse o material de apoio da oficina, para você e para os participantes.
        </p>

        {erro && (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Não consegui ler as oficinas ({erro}). {a.admin ? 'Rode o sql/2026-11_oficinas.sql no Supabase.' : 'Fale com o administrador.'}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {oficinas.map((o) => {
            const doMon = monitores.filter((m) => Number(m.oficina_id) === Number(o.id));
            const pres = presencas.filter((p) => Number(p.oficina_id) === Number(o.id));
            const encontros = new Set(pres.map((p) => p.data));
            const pessoas = new Set(pres.map((p) => Number(p.corretor_id)));
            const ultima = pres[0]?.data;
            return (
              <Link
                key={o.id}
                href={`/oficinas/${o.slug}`}
                style={{ backgroundColor: '#ffffff' }}
                className="group rounded-2xl border border-slate-200 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Oficina {o.ordem}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{o.nome}</h2>
                <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                  {doMon.length === 0 && <li className="text-slate-400">Sem monitor definido</li>}
                  {doMon
                    .sort((x, y) => (x.dia_semana ?? 9) - (y.dia_semana ?? 9))
                    .map((m) => (
                      <li key={m.id}>
                        <span className={Number(m.corretor_id) === a.meuId ? 'font-semibold text-slate-900' : ''}>
                          {nomes.get(Number(m.corretor_id)) ?? `#${m.corretor_id}`}
                        </span>{' '}
                        · {diaMonitor(m)}
                      </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-slate-500">
                  {encontros.size} encontro{encontros.size === 1 ? '' : 's'} · {pessoas.size} participante{pessoas.size === 1 ? '' : 's'}
                  {ultima ? ` · último em ${dataLonga(ultima)}` : ''}
                </p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

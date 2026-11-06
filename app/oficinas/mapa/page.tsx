// Mapa por corretor: quais oficinas cada corretor ativo já fez e quanto do
// checklist de aplicação marcou. Quem fez as 5 cumpre o requisito de padrinho.
// Só administrador.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acessoOficinas, nomeCurto, progressoCorretores, type Oficina, type CheckItem } from '@/lib/oficinas';
import { dm } from '@/lib/ligacoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mapa das oficinas — REMAX Ville' };

export default async function MapaPage() {
  const a = await acessoOficinas();
  if (!a.admin) redirect('/sem-acesso');
  const sb = supabaseAdmin();
  const [ofi, cor, its] = await Promise.all([
    sb.from('onb_oficinas').select('id,slug,nome,ordem').eq('ativa', true).order('ordem'),
    sb.from('corretores_associados').select('id,nome,status'),
    sb.from('onb_oficina_check_itens').select('id,oficina_id,publico,texto,ordem').eq('publico', 'participante').eq('ativo', true),
  ]);
  const oficinas = (ofi.data ?? []) as Oficina[];
  const itens = (its.data ?? []) as CheckItem[];
  const corretores = ((cor.data ?? []) as { id: number; nome: string | null; status: string | null }[])
    .filter((c) => (c.status ?? 'ativo') === 'ativo' && nomeCurto(c.nome))
    .map((c) => ({ id: Number(c.id), nome: nomeCurto(c.nome) }));
  const prog = await progressoCorretores(corretores.map((c) => c.id));
  const linhas = corretores
    .map((c) => {
      const p = prog.get(c.id)!;
      return { ...c, p, feitas: oficinas.filter((o) => p.presencas.has(Number(o.id))).length };
    })
    .sort((x, y) => y.feitas - x.feitas || x.nome.localeCompare(y.nome, 'pt-BR'));
  const completos = linhas.filter((l) => l.feitas === oficinas.length && oficinas.length).length;

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/oficinas" className="text-sm text-slate-500 hover:text-slate-800">← Oficinas</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Mapa das oficinas por corretor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Data da última presença em cada oficina e, embaixo, quantos itens do checklist de aplicação o corretor marcou.
          {' '}{completos} de {linhas.length} corretores ativos já passaram pelas {oficinas.length} oficinas.
        </p>

        <div style={{ backgroundColor: '#ffffff' }} className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Corretor</th>
                {oficinas.map((o) => (
                  <th key={o.id} className="px-3 py-3 text-center font-semibold" title={o.nome}>{o.ordem}. {o.nome.split(/[:(]/)[0].replace(' e Portarias', '').replace(' e Call Blitz', '')}</th>
                ))}
                <th className="px-3 py-3 text-center font-semibold">Todas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{l.nome}</td>
                  {oficinas.map((o) => {
                    const datas = l.p.presencas.get(Number(o.id));
                    const doTema = itens.filter((i) => Number(i.oficina_id) === Number(o.id));
                    const n = doTema.filter((i) => l.p.marcados.has(Number(i.id))).length;
                    return (
                      <td key={o.id} className="px-3 py-2 text-center">
                        {datas ? (
                          <>
                            <span className="font-medium text-emerald-700">{dm(datas[0])}</span>
                            {doTema.length > 0 && (
                              <span className={`block text-xs ${n === doTema.length ? 'text-emerald-600' : 'text-slate-400'}`}>
                                aplic. {n}/{doTema.length}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    {l.feitas === oficinas.length && oficinas.length ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">✓</span>
                    ) : (
                      <span className="text-xs text-slate-400">{l.feitas}/{oficinas.length}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

// Portal do locador: login por e-mail (link mágico) e lista dos recibos de
// repasse do locador (casado por e-mail em adm_locadores -> locador_id).
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import LocadorLogin from './login-form';
import { sairLocador } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meus repasses — RE/MAX Ville' };

type Repasse = {
  id: number; contrato_id: number; competencia: string;
  total_liquido: number | null; deducao_iptu: number | null; deducao_condominio: number | null;
  pdf_url: string | null; status_envio: string | null;
};

const brl = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesAno = (d: string) => {
  const [y, m] = String(d).slice(0, 7).split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(m) - 1] || m}/${y}`;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export default async function LocadorPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return <Shell><LocadorLogin /></Shell>;

  const email = user.email.toLowerCase();
  const adm = supabaseAdmin();

  const { data: locador } = await adm
    .from('adm_locadores').select('id,nome').ilike('email', email).maybeSingle();

  if (!locador) {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">RE/MAX Ville</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Cadastro não encontrado</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Não encontramos um locador com o e-mail <b>{email}</b>. Fale com a RE/MAX Ville para atualizar seu cadastro.
          </p>
          <form action={sairLocador} className="mt-6">
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Sair</button>
          </form>
        </div>
      </Shell>
    );
  }

  const { data: repRows } = await adm
    .from('adm_repasses')
    .select('id,contrato_id,competencia,total_liquido,deducao_iptu,deducao_condominio,pdf_url,status_envio')
    .eq('locador_id', locador.id)
    .order('competencia', { ascending: false });
  const repasses = (repRows ?? []) as Repasse[];

  // Endereço de cada contrato (mesmo padrão de embed usado no admin)
  const ids = [...new Set(repasses.map((r) => r.contrato_id).filter(Boolean))];
  const endPorContrato: Record<number, string> = {};
  if (ids.length) {
    const { data: cs } = await adm
      .from('adm_contratos').select('id,imovel:adm_imoveis(rua,numero,bairro)').in('id', ids);
    for (const c of (cs ?? []) as { id: number; imovel: { rua?: string; numero?: string; bairro?: string } | null }[]) {
      const im = c.imovel || {};
      endPorContrato[c.id] = [im.rua, im.numero, im.bairro].filter(Boolean).join(', ') || `Contrato #${c.id}`;
    }
  }

  // Agrupa por imóvel/contrato
  const grupos = new Map<number, { titulo: string; itens: Repasse[] }>();
  for (const r of repasses) {
    const g = grupos.get(r.contrato_id) ?? { titulo: endPorContrato[r.contrato_id] || `Contrato #${r.contrato_id}`, itens: [] };
    g.itens.push(r); grupos.set(r.contrato_id, g);
  }

  const primeiroNome = (locador.nome || email).split(' ')[0];

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">RE/MAX Ville — Portal do locador</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Olá, {primeiroNome}</h1>
            <p className="mt-1 text-sm text-slate-600">Seus recibos de repasse.</p>
          </div>
          <form action={sairLocador}>
            <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900">Sair</button>
          </form>
        </header>

        {grupos.size === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Ainda não há repasses disponíveis.
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            {[...grupos.values()].map((g) => (
              <section key={g.titulo} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-900">{g.titulo}</h2>
                <div className="mt-3 divide-y divide-slate-100">
                  {g.itens.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{mesAno(r.competencia)}</p>
                        <p className="text-xs text-slate-500">
                          Líquido {brl(r.total_liquido)}
                          {Number(r.deducao_iptu) ? ` · IPTU ${brl(r.deducao_iptu)}` : ''}
                          {Number(r.deducao_condominio) ? ` · Condomínio ${brl(r.deducao_condominio)}` : ''}
                        </p>
                      </div>
                      {r.pdf_url ? (
                        <a href={r.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 transition hover:bg-slate-50">
                          Abrir recibo (PDF)
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-slate-400">recibo em breve</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-slate-400">RE/MAX Ville — Jardins/Itaim, São Paulo · {email}</footer>
      </main>
    </div>
  );
}

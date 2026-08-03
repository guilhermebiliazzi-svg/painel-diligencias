// Portal do locador: login por e-mail (link mágico) e lista dos recibos de
// repasse do locador (casado por e-mail em adm_locadores -> locador_id).
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import LocadorLogin from './login-form';
import { sairLocador } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meus repasses — Ville Jardins' };

type Repasse = {
  id: number; contrato_id: number; competencia: string;
  total_liquido: number | null; deducao_iptu: number | null; deducao_condominio: number | null;
  pdf_url: string | null; status_envio: string | null; link?: string | null;
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

  // tolerante a e-mail duplicado: pega o primeiro em vez de quebrar
  const { data: locList } = await adm
    .from('adm_locadores').select('id,nome').ilike('email', email).order('id').limit(1);
  const locador = locList?.[0] ?? null;

  if (!locador) {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ville Jardins</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Cadastro não encontrado</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Não encontramos um locador com o e-mail <b>{email}</b>. Fale com a Ville Jardins para atualizar seu cadastro.
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
  const brutos = (repRows ?? []) as Repasse[];
  // Quando o PDF está no Storage do Supabase (bucket privado), gera um link
  // assinado temporário. Se for URL externa, usa direto.
  const repasses = await Promise.all(
    brutos.map(async (r) => {
      let link: string | null = r.pdf_url;
      if (r.pdf_url) {
        const m = r.pdf_url.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/);
        if (m) {
          const { data: sg } = await adm.storage
            .from(m[1])
            .createSignedUrl(decodeURIComponent(m[2]), 3600);
          link = sg?.signedUrl ?? r.pdf_url;
        }
      }
      return { ...r, link };
    })
  );

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

  // Documentos (boletos e comprovantes de IPTU/condomínio) por contrato+competência.
  // Gera link assinado temporário para cada arquivo do bucket privado.
  const docsPorChave = new Map<string, { tipo: string; nome: string | null; url: string | null }[]>();
  if (ids.length) {
    const { data: docRows } = await adm
      .from('adm_documentos')
      .select('contrato_id,competencia,tipo,nome,bucket,path')
      .in('contrato_id', ids);
    for (const d of (docRows ?? []) as { contrato_id: number; competencia: string; tipo: string; nome: string | null; bucket: string | null; path: string }[]) {
      const chave = `${d.contrato_id}|${String(d.competencia).slice(0, 7)}`;
      const { data: sg } = await adm.storage.from(d.bucket || 'documentos').createSignedUrl(d.path, 3600);
      const arr = docsPorChave.get(chave) ?? [];
      arr.push({ tipo: d.tipo, nome: d.nome ?? null, url: sg?.signedUrl ?? null });
      docsPorChave.set(chave, arr);
    }
  }
  const ORDEM_DOC = ['boleto_iptu', 'boleto_condominio', 'comprovante_iptu', 'comprovante_condominio'];
  const DOC_LABEL: Record<string, string> = {
    boleto_iptu: 'Boleto IPTU',
    boleto_condominio: 'Boleto condomínio',
    comprovante_iptu: 'Comprovante IPTU',
    comprovante_condominio: 'Comprovante condomínio',
  };
  const docsDoRepasse = (r: Repasse) => {
    const arr = docsPorChave.get(`${r.contrato_id}|${String(r.competencia).slice(0, 7)}`) ?? [];
    return ORDEM_DOC.map((t) => arr.find((d) => d.tipo === t)).filter(Boolean) as { tipo: string; nome: string | null; url: string | null }[];
  };

  // Comprovante de repasse (Pix) por repasse.
  const compPorRepasse = new Map<number, string>();
  const repIds = repasses.map((r) => r.id).filter(Boolean);
  if (repIds.length) {
    const { data: pgRows } = await adm
      .from('adm_pagamentos')
      .select('repasse_id,comprovante_bucket,comprovante_path')
      .eq('tipo', 'pix_repasse')
      .in('repasse_id', repIds)
      .not('comprovante_path', 'is', null);
    for (const p of (pgRows ?? []) as { repasse_id: number; comprovante_bucket: string | null; comprovante_path: string }[]) {
      const { data: sg } = await adm.storage.from(p.comprovante_bucket || 'documentos').createSignedUrl(p.comprovante_path, 3600);
      if (sg?.signedUrl) compPorRepasse.set(p.repasse_id, sg.signedUrl);
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
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ville Jardins — Portal do locador</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Olá, {primeiroNome}</h1>
            <p className="mt-1 text-sm text-slate-600">Seus recibos, boletos e comprovantes de IPTU e condomínio.</p>
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
                  {g.itens.map((r) => {
                    const docs = docsDoRepasse(r);
                    const comprovante = compPorRepasse.get(r.id) || null;
                    return (
                    <div key={r.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{mesAno(r.competencia)}</p>
                          <p className="text-xs text-slate-500">
                            Líquido {brl(r.total_liquido)}
                            {Number(r.deducao_iptu) ? ` · IPTU ${brl(r.deducao_iptu)}` : ''}
                            {Number(r.deducao_condominio) ? ` · Condomínio ${brl(r.deducao_condominio)}` : ''}
                          </p>
                        </div>
                        {r.link ? (
                          <a href={r.link} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 transition hover:bg-slate-50">
                            Abrir recibo (PDF)
                          </a>
                        ) : (
                          <span className="shrink-0 text-xs text-slate-400">recibo em breve</span>
                        )}
                      </div>
                      {(docs.length > 0 || comprovante) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {comprovante && (
                            <a href={comprovante} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100">
                              📄 Comprovante do repasse
                            </a>
                          )}
                          {docs.map((d) =>
                            d.url ? (
                              <a key={d.tipo} href={d.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 hover:text-blue-600">
                                📄 {DOC_LABEL[d.tipo] || d.tipo}
                              </a>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-slate-400">Ville Jardins Negócios Imobiliários — Rua Batataes, nº 148, Jardim Paulista, São Paulo · {email}</footer>
      </main>
    </div>
  );
}

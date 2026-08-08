// Portal do locador: login por e-mail (link mágico) e lista dos recibos de
// repasse do locador (casado por e-mail em adm_locadores -> locador_id).
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import LocadorLogin from './login-form';
import { sairLocador } from './actions';
import LocadorAdminView, { type GrupoImovel } from './admin-view';
import AdminOverview, { type OverviewRow } from './admin-overview';

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

// Monta as linhas do painel consolidado (todos os locadores) para o admin.
async function montarOverview(
  adm: ReturnType<typeof supabaseAdmin>,
  inicioPortal: string
): Promise<{ rows: OverviewRow[]; competencias: string[] }> {
  const { data: repRows } = await adm
    .from('adm_repasses')
    .select('id,locador_id,contrato_id,competencia,total_liquido,deducao_iptu,deducao_condominio,pdf_url')
    .gte('competencia', inicioPortal)
    .order('competencia', { ascending: false });
  const reps = (repRows ?? []) as any[];
  if (!reps.length) return { rows: [], competencias: [] };

  const locadorIds = [...new Set(reps.map((r) => r.locador_id).filter(Boolean))];
  const contratoIds = [...new Set(reps.map((r) => r.contrato_id).filter(Boolean))];
  const repIds = reps.map((r) => r.id);

  const { data: locs } = await adm.from('adm_locadores').select('id,nome,email').in('id', locadorIds);
  const locPor: Record<number, { nome: string | null; email: string | null }> = {};
  for (const l of (locs ?? []) as any[]) locPor[l.id] = { nome: l.nome, email: l.email };

  const endPorContrato: Record<number, string> = {};
  const { data: cs } = await adm
    .from('adm_contratos').select('id,imovel:adm_imoveis(rua,numero,complemento,bairro)').in('id', contratoIds);
  for (const c of (cs ?? []) as any[]) {
    const im = c.imovel || {};
    const compl = im.complemento ? ` — ${String(im.complemento).trim()}` : '';
    endPorContrato[c.id] = ([im.rua, im.numero].filter(Boolean).join(', ') + compl + (im.bairro ? `, ${im.bairro}` : '')) || `Contrato #${c.id}`;
  }

  const assinar = async (bucket: string | null, path: string | null) => {
    if (!path) return null;
    const { data: sg } = await adm.storage.from(bucket || 'documentos').createSignedUrl(path, 3600);
    return sg?.signedUrl ?? null;
  };

  // documentos (boletos + comprovantes enviados na mão), pulando comprovantes origem=pagamento
  const docsPorChave = new Map<string, { tipo: string; url: string | null }[]>();
  const { data: docRows } = await adm
    .from('adm_documentos').select('contrato_id,competencia,tipo,bucket,path,origem').in('contrato_id', contratoIds);
  await Promise.all(((docRows ?? []) as any[]).map(async (d) => {
    if ((d.tipo === 'comprovante_iptu' || d.tipo === 'comprovante_condominio') && d.origem === 'pagamento') return;
    const chave = `${d.contrato_id}|${String(d.competencia).slice(0, 7)}`;
    const url = await assinar(d.bucket, d.path);
    const arr = docsPorChave.get(chave) ?? []; arr.push({ tipo: d.tipo, url }); docsPorChave.set(chave, arr);
  }));
  const ORDEM = ['boleto_iptu', 'boleto_condominio', 'comprovante_iptu', 'comprovante_condominio'];
  const docsDe = (contrato_id: number, comp: string) => {
    const arr = docsPorChave.get(`${contrato_id}|${comp}`) ?? [];
    return ORDEM.map((t) => arr.find((d) => d.tipo === t)).filter(Boolean) as { tipo: string; url: string | null }[];
  };

  // comprovante do repasse (Pix) por repasse
  const compRepasse = new Map<number, string>();
  const { data: pg } = await adm
    .from('adm_pagamentos').select('repasse_id,comprovante_bucket,comprovante_path')
    .eq('tipo', 'pix_repasse').in('repasse_id', repIds).not('comprovante_path', 'is', null);
  await Promise.all(((pg ?? []) as any[]).map(async (p) => {
    const url = await assinar(p.comprovante_bucket, p.comprovante_path); if (url) compRepasse.set(p.repasse_id, url);
  }));

  // comprovantes de boleto por contrato|competência
  const boletoComp = new Map<string, { subtipo: string; url: string }[]>();
  const { data: bpg } = await adm
    .from('adm_pagamentos').select('contrato_id,competencia,subtipo,comprovante_bucket,comprovante_path')
    .eq('tipo', 'boleto').in('contrato_id', contratoIds).not('comprovante_path', 'is', null);
  await Promise.all(((bpg ?? []) as any[]).map(async (x) => {
    const url = await assinar(x.comprovante_bucket, x.comprovante_path);
    if (url) { const k = `${x.contrato_id}|${String(x.competencia).slice(0, 7)}`; const arr = boletoComp.get(k) ?? []; arr.push({ subtipo: x.subtipo, url }); boletoComp.set(k, arr); }
  }));

  const rows: OverviewRow[] = await Promise.all(reps.map(async (r) => {
    const comp = String(r.competencia).slice(0, 7);
    let reciboUrl: string | null = r.pdf_url;
    if (r.pdf_url) {
      const m = r.pdf_url.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?([^/?]+)\/([^?]+)/);
      if (m) reciboUrl = (await assinar(m[1], decodeURIComponent(m[2]))) ?? r.pdf_url;
    }
    return {
      locador_id: r.locador_id,
      locador_nome: locPor[r.locador_id]?.nome || `Locador #${r.locador_id}`,
      locador_email: locPor[r.locador_id]?.email ?? null,
      contrato_id: r.contrato_id,
      competencia: comp,
      mes: mesAno(r.competencia),
      endereco: endPorContrato[r.contrato_id] || `Contrato #${r.contrato_id}`,
      liquido: Number(r.total_liquido) || 0,
      deducao_iptu: Number(r.deducao_iptu) || 0,
      deducao_condominio: Number(r.deducao_condominio) || 0,
      reciboUrl,
      comprovanteRepasse: compRepasse.get(r.id) ?? null,
      comprovantesBoleto: boletoComp.get(`${r.contrato_id}|${comp}`) ?? [],
      docs: docsDe(r.contrato_id, comp),
    };
  }));
  const competencias = [...new Set(reps.map((r) => String(r.competencia).slice(0, 7)))].sort().reverse();
  return { rows, competencias };
}

export default async function LocadorPage({ searchParams }: { searchParams: Promise<{ locador?: string }> }) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return <Shell><LocadorLogin /></Shell>;

  const email = user.email.toLowerCase();
  const adm = supabaseAdmin();

  // Admin? (verificado no servidor pelo perfil) → acesso universal com seletor.
  const { data: perfil } = await adm
    .from('perfis').select('is_admin,ativo').eq('email', email).maybeSingle();
  const isAdmin = !!(perfil?.is_admin && perfil?.ativo);

  let locador: { id: number; nome: string | null; email?: string | null } | null = null;

  if (isAdmin) {
    if (sp?.locador && /^\d+$/.test(sp.locador)) {
      const { data } = await adm.from('adm_locadores').select('id,nome,email').eq('id', Number(sp.locador)).limit(1);
      locador = data?.[0] ?? null;
    }
    if (!locador) {
      const { rows, competencias } = await montarOverview(
        adm,
        `${process.env.PORTAL_LOCADOR_INICIO || '2026-08'}-01`
      );
      return <AdminOverview rows={rows} competencias={competencias} />;
    }
  } else {
    // locador comum: casa pelo e-mail (tolerante a duplicado)
    const { data: locList } = await adm
      .from('adm_locadores').select('id,nome').ilike('email', email).order('id').limit(1);
    locador = locList?.[0] ?? null;
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
  }
  const modoAdmin = isAdmin;

  // O portal do locador começa em agosto/2026 (não temos comprovantes anteriores).
  // Ajustável pela env PORTAL_LOCADOR_INICIO (YYYY-MM).
  const inicioPortal = `${process.env.PORTAL_LOCADOR_INICIO || '2026-08'}-01`;
  const { data: repRows } = await adm
    .from('adm_repasses')
    .select('id,contrato_id,competencia,total_liquido,deducao_iptu,deducao_condominio,pdf_url,status_envio')
    .eq('locador_id', locador.id)
    .gte('competencia', inicioPortal)
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
      .from('adm_contratos').select('id,imovel:adm_imoveis(rua,numero,complemento,bairro)').in('id', ids);
    for (const c of (cs ?? []) as { id: number; imovel: { rua?: string; numero?: string; complemento?: string; bairro?: string } | null }[]) {
      const im = c.imovel || {};
      const compl = im.complemento ? ` — ${String(im.complemento).trim()}` : '';
      endPorContrato[c.id] = ([im.rua, im.numero].filter(Boolean).join(', ') + compl + (im.bairro ? `, ${im.bairro}` : '')) || `Contrato #${c.id}`;
    }
  }

  // Documentos (boletos e comprovantes de IPTU/condomínio) por contrato+competência.
  // Gera link assinado temporário para cada arquivo do bucket privado.
  const docsPorChave = new Map<string, { tipo: string; nome: string | null; url: string | null }[]>();
  if (ids.length) {
    const { data: docRows } = await adm
      .from('adm_documentos')
      .select('contrato_id,competencia,tipo,nome,bucket,path,origem')
      .in('contrato_id', ids);
    for (const d of (docRows ?? []) as { contrato_id: number; competencia: string; tipo: string; nome: string | null; bucket: string | null; path: string; origem: string | null }[]) {
      // comprovantes gerados automaticamente (origem=pagamento) vêm de adm_pagamentos — evita duplicar
      if ((d.tipo === 'comprovante_iptu' || d.tipo === 'comprovante_condominio') && d.origem === 'pagamento') continue;
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

  // Comprovantes de boletos (IPTU/condomínio) pagos — pode haver vários por competência.
  const boletoCompPorChave = new Map<string, { subtipo: string; url: string }[]>();
  if (ids.length) {
    const { data: bRows } = await adm
      .from('adm_pagamentos')
      .select('contrato_id,competencia,subtipo,comprovante_bucket,comprovante_path')
      .eq('tipo', 'boleto')
      .in('contrato_id', ids)
      .not('comprovante_path', 'is', null);
    for (const b of (bRows ?? []) as { contrato_id: number; competencia: string; subtipo: string; comprovante_bucket: string | null; comprovante_path: string }[]) {
      const chave = `${b.contrato_id}|${String(b.competencia).slice(0, 7)}`;
      const { data: sg } = await adm.storage.from(b.comprovante_bucket || 'documentos').createSignedUrl(b.comprovante_path, 3600);
      if (sg?.signedUrl) {
        const arr = boletoCompPorChave.get(chave) ?? [];
        arr.push({ subtipo: b.subtipo, url: sg.signedUrl });
        boletoCompPorChave.set(chave, arr);
      }
    }
  }
  const boletoCompDoRepasse = (r: Repasse) => boletoCompPorChave.get(`${r.contrato_id}|${String(r.competencia).slice(0, 7)}`) ?? [];

  // Agrupa por imóvel/contrato
  const grupos = new Map<number, { titulo: string; itens: Repasse[] }>();
  for (const r of repasses) {
    const g = grupos.get(r.contrato_id) ?? { titulo: endPorContrato[r.contrato_id] || `Contrato #${r.contrato_id}`, itens: [] };
    g.itens.push(r); grupos.set(r.contrato_id, g);
  }

  const primeiroNome = (locador.nome || email).split(' ')[0];

  // Dados serializáveis para a visão admin (tabela + filtro + e-mail).
  const gruposAdmin: GrupoImovel[] = [...grupos.entries()].map(([contrato_id, g]) => ({
    contrato_id,
    titulo: g.titulo,
    rows: g.itens.map((r) => ({
      contrato_id,
      competencia: String(r.competencia).slice(0, 7),
      mes: mesAno(r.competencia),
      liquido: Number(r.total_liquido) || 0,
      deducao_iptu: Number(r.deducao_iptu) || 0,
      deducao_condominio: Number(r.deducao_condominio) || 0,
      reciboUrl: r.link ?? null,
      comprovanteRepasse: compPorRepasse.get(r.id) ?? null,
      comprovantesBoleto: boletoCompDoRepasse(r).map((c) => ({ subtipo: c.subtipo, url: c.url })),
      docs: docsDoRepasse(r).map((d) => ({ tipo: d.tipo, url: d.url })),
    })),
  }));
  const competenciasAdmin = [...new Set(repasses.map((r) => String(r.competencia).slice(0, 7)))]
    .sort()
    .reverse();

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {modoAdmin && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
            <span>👁️ Modo admin — visualizando <b>{locador.nome || `locador #${locador.id}`}</b></span>
            <a href="/locador" className="font-medium underline">Trocar locador</a>
          </div>
        )}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ville Jardins — Portal do locador</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">{modoAdmin ? (locador.nome || `Locador #${locador.id}`) : `Olá, ${primeiroNome}`}</h1>
            <p className="mt-1 text-sm text-slate-600">{modoAdmin ? "Recibos, boletos e comprovantes deste locador." : "Seus recibos, boletos e comprovantes de IPTU e condomínio."}</p>
          </div>
          {modoAdmin ? (
            <a href="/" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900">Voltar ao painel</a>
          ) : (
            <form action={sairLocador}>
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900">Sair</button>
            </form>
          )}
        </header>

        {modoAdmin ? (
          <LocadorAdminView
            locadorId={locador.id}
            locadorNome={locador.nome || `Locador #${locador.id}`}
            temEmail={!!locador.email}
            grupos={gruposAdmin}
            competencias={competenciasAdmin}
          />
        ) : grupos.size === 0 ? (
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
                    const compsBoleto = boletoCompDoRepasse(r);
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
                      {(docs.length > 0 || comprovante || compsBoleto.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {comprovante && (
                            <a href={comprovante} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100">
                              📄 Comprovante do repasse
                            </a>
                          )}
                          {compsBoleto.map((c, i) => (
                            <a key={`bc${i}`} href={c.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100">
                              📄 Comprovante {c.subtipo === 'iptu' ? 'IPTU' : 'condomínio'}
                            </a>
                          ))}
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

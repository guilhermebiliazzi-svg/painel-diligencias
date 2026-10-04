'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { gerarPostagem, aprovarPrevia, aprovarEPostar, rejeitarPostagem, salvarInstagram } from './actions';

export type Corretor = {
  id: number;
  nome: string | null;
  apelido: string | null;
  email: string | null;
  phone: string | null;
  id_agente: string | null;
  foto_url: string | null;
  creci: string | null;
  instagram_handle: string | null;
};

export type ImovelNS = {
  listing_id: string;
  titulo: string;
  tipo: string;
  endereco: string;
  bairro: string;
  preco: number | null;
  quartos: number | null;
  suites: number | null;
  area: number | null;
  vagas: number | null;
  fotos: string[];
};

export type Pedido = {
  id: string;
  listing_id: string;
  status: string;
  criativo_id: number | null;
  drive_folder_url: string | null;
  erro_msg: string | null;
  criado_em: string;
  criado_por: string;
  origem: string;
  fotos: string[];
  criativo: { id: number; status: string | null; pngs_carrossel_urls: string[] | null; post_ig_url: string | null; erro_msg: string | null } | null;
};

const MIN = 5;
const MAX = 7;

const STATUS: Record<string, string> = {
  novo: 'Na fila',
  gerando: 'Gerando os slides (2 a 4 min)',
  previa_pronta: 'Prévia pronta — aguardando o corretor',
  aguardando_admin: 'Aguardando aprovação final',
  postando: 'Publicando no Instagram',
  postado: 'Publicado no Instagram',
  rejeitado: 'Cancelado',
  erro: 'Erro ao gerar',
};

const fmtPreco = (v: number | null) => (v ? 'R$ ' + Number(v).toLocaleString('pt-BR') : 'Sem preço');
const fmtData = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function statusDoPedido(p: Pedido): string {
  const c = p.criativo?.status || '';
  if (p.status === 'postando' || p.status === 'aguardando_admin') {
    if (c === 'postado') return 'postado';
    if (c === 'rejeitado_admin' || c === 'rejeitado') return 'rejeitado';
    if (c === 'erro') return 'erro';
  }
  if (p.status === 'previa_pronta' && (c === 'aguardando_admin' || c === 'postando')) return c === 'postando' ? 'postando' : 'aguardando_admin';
  return p.status;
}

export default function Postagens({ isAdmin, meuEmail, corretores, corretor, imoveis, pedidos }: {
  isAdmin: boolean;
  meuEmail: string;
  corretores: Corretor[];
  corretor: Corretor | null;
  imoveis: ImovelNS[];
  pedidos: Pedido[];
}) {
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, start] = useTransition();

  const proprio = !!corretor?.email && corretor.email.toLowerCase() === meuEmail.toLowerCase();
  const perfilIncompleto = corretor ? !corretor.foto_url || !corretor.creci : false;
  const [handle, setHandle] = useState(corretor?.instagram_handle ?? '');
  const [handleSalvo, setHandleSalvo] = useState(corretor?.instagram_handle ?? '');
  const semHandle = !handleSalvo;

  const salvarHandle = () => {
    if (!corretor) return;
    setMsg(null);
    start(async () => {
      const r = await salvarInstagram(corretor.id, handle);
      if (!r.ok) { setMsg({ tipo: 'erro', texto: r.erro || 'Não deu certo.' }); return; }
      const limpo = handle.trim().replace(/^@/, '').toLowerCase();
      setHandle(limpo);
      setHandleSalvo(limpo);
      setMsg({ tipo: 'ok', texto: `@${limpo} salvo. É esse perfil que entra como colaborador nos posts.` });
    });
  };

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return imoveis;
    return imoveis.filter((i) => [i.listing_id, i.titulo, i.endereco, i.bairro, i.tipo].join(' ').toLowerCase().includes(q));
  }, [imoveis, busca]);

  const imovelAberto = imoveis.find((i) => i.listing_id === aberto) ?? null;
  const emAndamento = new Set(pedidos.filter((p) => ['novo', 'gerando', 'previa_pronta', 'aguardando_admin', 'postando'].includes(statusDoPedido(p))).map((p) => p.listing_id));

  const abrir = (id: string) => {
    setAberto(id === aberto ? null : id);
    setFotos([]);
    setMsg(null);
  };
  const alternarFoto = (url: string) => {
    setFotos((atual) => {
      if (atual.includes(url)) return atual.filter((u) => u !== url);
      if (atual.length >= MAX) return atual;
      return [...atual, url];
    });
  };

  const gerar = () => {
    if (!corretor || !imovelAberto) return;
    setMsg(null);
    start(async () => {
      const r = await gerarPostagem(corretor.id, imovelAberto.listing_id, fotos);
      if (!r.ok) {
        setMsg({ tipo: 'erro', texto: r.erro || 'Não deu certo.' });
        return;
      }
      setMsg({ tipo: 'ok', texto: proprio || !isAdmin
        ? 'Pedido enviado! Em alguns minutos a prévia aparece aqui embaixo e no seu WhatsApp.'
        : 'Pedido enviado! Em alguns minutos a prévia aparece aqui embaixo e no WhatsApp do admin (pula o corretor).' });
      setAberto(null);
      setFotos([]);
      router.refresh();
    });
  };

  const agir = (fn: (id: string) => Promise<{ ok: boolean; erro?: string }>, id: string, okTexto: string) => {
    setMsg(null);
    start(async () => {
      const r = await fn(id);
      setMsg(r.ok ? { tipo: 'ok', texto: okTexto } : { tipo: 'erro', texto: r.erro || 'Não deu certo.' });
      router.refresh();
    });
  };

  return (
    <div className="mt-6 space-y-6">
      {isAdmin && (
        <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Corretor</label>
          <select
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:max-w-md"
            value={corretor?.id ?? ''}
            onChange={(e) => router.push(e.target.value ? `/postagens?corretor=${e.target.value}` : '/postagens')}
          >
            <option value="">Escolha o corretor…</option>
            {corretores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome || c.email}
              </option>
            ))}
          </select>
          {corretor && !proprio && (
            <p className="mt-2 text-xs text-slate-500">
              Montando em nome de {corretor.nome}: a prévia vai direto para a sua aprovação, sem passar pelo corretor.
            </p>
          )}
        </section>
      )}

      {!corretor ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {isAdmin ? 'Escolha um corretor para ver os imóveis dele.' : 'Seu e-mail não está no cadastro de corretores associados. Fale com o administrador.'}
        </div>
      ) : (
        <>
          {perfilIncompleto && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              O cadastro de {corretor.nome} está sem {!corretor.foto_url ? 'foto de perfil' : ''}{!corretor.foto_url && !corretor.creci ? ' e ' : ''}{!corretor.creci ? 'CRECI' : ''}. O carrossel usa os dois no slide final — peça para a Eva salvar pelo WhatsApp antes de gerar.
            </div>
          )}

          <section style={{ backgroundColor: '#ffffff' }} className={`rounded-2xl border p-4 shadow-sm ${semHandle ? 'border-amber-300' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Instagram de {corretor.apelido || corretor.nome} (colaborador no post)</label>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-slate-400">@</span>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="usuario.do.instagram"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:max-w-xs"
                  />
                  <button type="button" onClick={salvarHandle} disabled={pendente || !handle.trim() || handle.trim().replace(/^@/, '').toLowerCase() === handleSalvo}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Salvar
                  </button>
                </div>
              </div>
              {semHandle ? (
                <p className="text-sm text-amber-800">Sem o @ não dá para gerar o carrossel — o corretor precisa ser marcado como colaborador.</p>
              ) : (
                <p className="text-sm text-slate-500">O post sai no @remaxville com @{handleSalvo} como colaborador (ele aceita o convite no Instagram).</p>
              )}
            </div>
          </section>

          {msg && (
            <div className={`rounded-2xl border p-4 text-sm ${msg.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {msg.texto}
            </div>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">
                Imóveis de {corretor.apelido || corretor.nome} <span className="font-normal text-slate-500">({imoveis.length})</span>
              </h2>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por REF, rua ou bairro"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:w-72"
              />
            </div>

            {lista.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Nenhum imóvel à venda no NonStop para este corretor.
              </div>
            )}

            {lista.map((im) => {
              const estaAberto = aberto === im.listing_id;
              return (
                <div key={im.listing_id} style={{ backgroundColor: '#ffffff' }} className={`rounded-2xl border shadow-sm ${estaAberto ? 'border-violet-300' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => abrir(im.listing_id)} className="flex w-full gap-4 p-4 text-left">
                    <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                      {im.fotos[0] && <img src={im.fotos[0]} alt="" className="size-full object-cover" loading="lazy" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">REF {im.listing_id}</span>
                        {emAndamento.has(im.listing_id) && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">carrossel em andamento</span>}
                      </div>
                      <p className="mt-1 truncate font-semibold text-slate-900">{im.endereco || im.titulo || 'Sem endereço'}</p>
                      <p className="text-sm text-slate-600">
                        {[im.tipo, im.bairro, im.quartos ? im.quartos + ' dorm' + (im.quartos > 1 ? 's' : '') : '', im.area ? im.area + ' m²' : '', im.vagas ? im.vagas + ' vaga' + (im.vagas > 1 ? 's' : '') : ''].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-sm font-medium text-slate-800">{fmtPreco(im.preco)} <span className="font-normal text-slate-400">· {im.fotos.length} fotos</span></p>
                    </div>
                  </button>

                  {estaAberto && (
                    <div className="border-t border-slate-100 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-slate-700">
                          Marque de {MIN} a {MAX} fotos na ordem que preferir. <span className="font-semibold">{fotos.length}/{MAX}</span>
                          {semHandle && <span className="ml-2 text-amber-700">Preencha o @ do Instagram acima para liberar.</span>}
                        </p>
                        <button
                          type="button"
                          onClick={gerar}
                          disabled={pendente || semHandle || fotos.length < MIN || emAndamento.has(im.listing_id)}
                          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                        >
                          {pendente ? 'Enviando…' : 'Gerar carrossel'}
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                        {im.fotos.map((url) => {
                          const idx = fotos.indexOf(url);
                          const marcada = idx >= 0;
                          const cheio = !marcada && fotos.length >= MAX;
                          return (
                            <button
                              key={url}
                              type="button"
                              onClick={() => alternarFoto(url)}
                              disabled={cheio}
                              className={`relative aspect-square overflow-hidden rounded-xl border-2 transition ${marcada ? 'border-violet-600' : 'border-transparent'} ${cheio ? 'opacity-40' : 'hover:opacity-90'}`}
                            >
                              <img src={url} alt="" className="size-full object-cover" loading="lazy" />
                              {marcada && (
                                <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white shadow">
                                  {idx + 1}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {pedidos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900">Carrosséis recentes</h2>
              {pedidos.map((p) => {
                const st = statusDoPedido(p);
                const pngs = p.criativo?.pngs_carrossel_urls || [];
                const podeAprovarPrevia = st === 'previa_pronta';
                const podePostar = isAdmin && (st === 'previa_pronta' || st === 'aguardando_admin');
                const podeCancelar = ['previa_pronta', 'aguardando_admin', 'erro'].includes(st);
                return (
                  <div key={p.id} style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">REF {p.listing_id}</p>
                        <p className="text-xs text-slate-500">
                          {fmtData(p.criado_em)} · {p.origem === 'admin' ? 'montado pelo admin' : 'montado pelo corretor'} · {p.fotos.length} fotos
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st === 'postado' ? 'bg-emerald-100 text-emerald-800' : st === 'erro' || st === 'rejeitado' ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'}`}>
                        {STATUS[st] || st}
                      </span>
                    </div>
                    {(p.erro_msg || p.criativo?.erro_msg) && st === 'erro' && (
                      <p className="mt-2 text-sm text-red-700">{p.erro_msg || p.criativo?.erro_msg}</p>
                    )}
                    {pngs.length > 0 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {pngs.map((u, i) => (
                          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="shrink-0">
                            <img src={u} alt={`Slide ${i + 1}`} className="h-40 w-30 rounded-lg border border-slate-200 object-cover" loading="lazy" />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {p.drive_folder_url && (
                        <a href={p.drive_folder_url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Abrir no Drive
                        </a>
                      )}
                      {p.criativo?.post_ig_url && (
                        <a href={p.criativo.post_ig_url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Ver no Instagram
                        </a>
                      )}
                      {podeAprovarPrevia && (
                        <button type="button" disabled={pendente} onClick={() => agir(aprovarPrevia, p.id, 'Prévia aprovada. Agora vai para a aprovação final e publicação.')}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                          Aprovar prévia
                        </button>
                      )}
                      {podePostar && (
                        <button type="button" disabled={pendente} onClick={() => agir(aprovarEPostar, p.id, 'Publicando no Instagram. Em instantes aparece o link aqui.')}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                          Aprovar e publicar
                        </button>
                      )}
                      {podeCancelar && (
                        <button type="button" disabled={pendente} onClick={() => agir(rejeitarPostagem, p.id, 'Carrossel cancelado.')}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}

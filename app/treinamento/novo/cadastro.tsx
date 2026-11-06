'use client';

// Seleção dos corretores que entram na trilha do Max: data de início comum,
// padrinho por corretor, contrato de associação (Clicksign) e boas-vindas pelo Max.
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { cadastrarNovatos, previaContrato, type ResultadoCadastro } from '../actions';
import {
  EMPRESAS, FAIXA_ROTULO, VAZIO, faixasDe, faltando, fmtCpf, lerHub, mesclarHub,
  type DadosAssociado, type Empresa, type Faixa,
} from '@/lib/contrato-associacao';

export type Opcao = {
  id: number; nome: string; temCelular: boolean; trilha: string | null;
  cpf: string; creci: string; email: string; telefone: string;
};
type Assinantes = { pronto: boolean; empresas: Record<string, string>; testemunhas: string[] };
type Escolha = { padrinho: number | null; empresa: Empresa; faixa: Faixa; dados: DadosAssociado; hub: string | null };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function proximoDiaUtil(): string {
  const d = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) + 'T12:00:00Z');
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

const CAMPOS: { k: keyof DadosAssociado; rot: string; larg?: string }[] = [
  { k: 'nome', rot: 'Nome completo', larg: 'sm:col-span-2' },
  { k: 'cpf', rot: 'CPF' },
  { k: 'nacionalidade', rot: 'Nacionalidade' },
  { k: 'estado_civil', rot: 'Estado civil' },
  { k: 'rg', rot: 'RG' },
  { k: 'rg_orgao', rot: 'Órgão do RG' },
  { k: 'rg_uf', rot: 'UF do RG' },
  { k: 'creci', rot: 'CRECI' },
  { k: 'creci_uf', rot: 'UF do CRECI' },
  { k: 'endereco', rot: 'Endereço (rua)', larg: 'sm:col-span-2' },
  { k: 'numero', rot: 'Número' },
  { k: 'complemento', rot: 'Complemento' },
  { k: 'bairro', rot: 'Bairro' },
  { k: 'cidade', rot: 'Cidade' },
  { k: 'estado', rot: 'Estado (UF)' },
  { k: 'email', rot: 'E-mail' },
  { k: 'telefone', rot: 'Celular no hub (referência)' },
];

export default function Cadastro({
  corretores, padrinhos, assinantes, favorito,
}: { corretores: Opcao[]; padrinhos: { id: number; nome: string }[]; assinantes: Assinantes; favorito: string }) {
  const [busca, setBusca] = useState('');
  const [escolhidos, setEscolhidos] = useState<Map<number, Escolha>>(new Map());
  const [inicio, setInicio] = useState(proximoDiaUtil);
  const [boas, setBoas] = useState(true);
  const [comContrato, setComContrato] = useState(true);
  const [res, setRes] = useState<ResultadoCadastro | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const [pdfPend, setPdfPend] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const fav = useRef<HTMLAnchorElement>(null);

  // o React não aceita "javascript:" no href; o favorito entra direto no DOM
  useEffect(() => { fav.current?.setAttribute('href', favorito); }, [favorito]);

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return corretores.filter((c) => !q || norm(c.nome).includes(q));
  }, [busca, corretores]);
  const porId = useMemo(() => new Map(corretores.map((c) => [c.id, c])), [corretores]);

  const atualizar = (id: number, f: (e: Escolha) => Escolha) =>
    setEscolhidos((m) => { const n = new Map(m); const e = n.get(id); if (e) n.set(id, f(e)); return n; });

  function alternar(id: number) {
    setEscolhidos((m) => {
      const n = new Map(m);
      if (n.has(id)) n.delete(id);
      else {
        const c = porId.get(id)!;
        n.set(id, {
          padrinho: null, empresa: 'ville', faixa: 40, hub: null,
          dados: { ...VAZIO, nome: c.nome, cpf: fmtCpf(c.cpf), creci: c.creci, email: c.email.toLowerCase(), telefone: c.telefone },
        });
      }
      return n;
    });
  }

  async function colarHub(id: number) {
    let t = '';
    try { t = await navigator.clipboard.readText(); } catch { /* sem permissão: pede para colar */ }
    if (!lerHub(t)) t = window.prompt('Cole aqui o texto copiado do hub (Ctrl+V):') ?? '';
    const h = lerHub(t);
    if (!h) { setMsg((m) => ({ ...m, [id]: 'Não achei os dados do hub. Abra o cadastro do corretor no hub e clique no favorito "Copiar para o painel".' })); return; }
    const c = porId.get(id)!;
    const cpfHub = String(h.cpf ?? '').replace(/\D/g, '');
    const cpfPainel = c.cpf.replace(/\D/g, '');
    const outro = cpfHub && cpfPainel && cpfHub !== cpfPainel;
    atualizar(id, (e) => ({ ...e, dados: mesclarHub(e.dados, h), hub: h.nome ?? '' }));
    setMsg((m) => ({
      ...m,
      [id]: outro
        ? `Atenção: o CPF do hub (${h.nome}) é diferente do CPF no cadastro de corretor. Confira se é a pessoa certa.`
        : `Dados do hub colados (${h.nome}). Confira e complete o que faltar.`,
    }));
  }

  function verPdf(id: number) {
    const e = escolhidos.get(id);
    if (!e) return;
    setPdfPend(id);
    setMsg((m) => ({ ...m, [id]: 'Gerando o PDF (pode levar até 1 minuto)…' }));
    previaContrato({ empresa: e.empresa, faixa: e.faixa, dados: e.dados }).then((r) => {
      setPdfPend(null);
      if (!r.ok || !r.pdf) { setMsg((m) => ({ ...m, [id]: r.erro || 'Não consegui gerar o PDF.' })); return; }
      const bin = Uint8Array.from(atob(r.pdf), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bin], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setMsg((m) => ({ ...m, [id]: 'PDF aberto em outra aba.' }));
    }, () => { setPdfPend(null); setMsg((m) => ({ ...m, [id]: 'Não consegui gerar o PDF.' })); });
  }

  const pendencias = comContrato
    ? [...escolhidos].map(([id, e]) => ({ id, falta: faltando(e.dados) })).filter((x) => x.falta.length)
    : [];
  const bloqueado = pending || escolhidos.size === 0 || !inicio || pendencias.length > 0 || (comContrato && !assinantes.pronto);

  function cadastrar() {
    if (bloqueado) return;
    const [y, m, d] = inicio.split('-');
    const acao = comContrato
      ? ', mandar o contrato de associação pela Clicksign e, depois da assinatura, as boas-vindas'
      : boas ? ', e mandar as boas-vindas' : '';
    if (!window.confirm(`Cadastrar ${escolhidos.size} corretor(es) na trilha do Max, com início em ${d}/${m}/${y}${acao}?`)) return;
    setRes(null);
    start(async () => {
      const r = await cadastrarNovatos(
        [...escolhidos].map(([corretor_id, e]) => ({
          corretor_id, padrinho_id: e.padrinho,
          contrato: comContrato ? { empresa: e.empresa, faixa: e.faixa, dados: e.dados } : null,
        })),
        inicio, boas, comContrato,
      );
      setRes(r);
      if (r.cadastrados.length) {
        const feitos = new Set(r.cadastrados);
        setEscolhidos((mp) => new Map([...mp].filter(([id]) => !feitos.has(porId.get(id)?.nome ?? ''))));
      }
    });
  }

  const inp = 'mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

  return (
    <div className="space-y-5">
      <div>
        <span className="block text-xs font-medium text-slate-500">Corretores</span>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {lista.map((c) => {
            const semCel = !c.temCelular;
            return (
              <li key={c.id}>
                <label className={`flex items-center gap-3 px-3 py-2 text-sm ${semCel ? 'cursor-default text-slate-400' : 'cursor-pointer hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={escolhidos.has(c.id)} disabled={semCel} onChange={() => alternar(c.id)} className="size-4" />
                  <span className="flex-1">{c.nome}</span>
                  {semCel && <span className="text-xs">sem celular no cadastro</span>}
                  {!semCel && c.trilha && <span className="text-xs text-amber-700">já na trilha ({c.trilha})</span>}
                </label>
              </li>
            );
          })}
          {lista.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nenhum corretor com esse nome.</li>}
        </ul>
        <p className="mt-1 text-xs text-slate-500">Cadastrar de novo quem já está na trilha reinicia a data de início dele.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-500">Início da trilha</span>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={comContrato} onChange={(e) => setComContrato(e.target.checked)} className="size-4" />
          Enviar o contrato de associação antes (Clicksign)
        </label>
        {!comContrato && (
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={boas} onChange={(e) => setBoas(e.target.checked)} className="size-4" />
            Mandar as boas-vindas pelo Max
          </label>
        )}
      </div>

      {comContrato && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          {assinantes.pronto ? (
            <>
              <p><b>REMAX Ville:</b> {assinantes.empresas.ville}</p>
              <p><b>Team Samia:</b> {assinantes.empresas.samia}</p>
              <p><b>Testemunhas:</b> {assinantes.testemunhas.join(' e ')}</p>
              <p className="mt-1">Vencimento dia 05 · foro de São Paulo/SP · o pedido vai pelo WhatsApp de cada um (Clicksign).</p>
            </>
          ) : (
            <p className="text-rose-700">Os dados das empresas e das testemunhas ainda não estão no banco (rode o SQL do contrato no Supabase).</p>
          )}
          <p className="mt-2">
            Para puxar os dados do hub, arraste este botão para a barra de favoritos do navegador:{' '}
            <a ref={fav} onClick={(e) => e.preventDefault()} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-800" title="Arraste para a barra de favoritos">
              Copiar para o painel
            </a>
            . No hub, abra Usuários → Editar do corretor, clique no favorito e volte aqui em &quot;Colar dados do hub&quot;.
          </p>
        </div>
      )}

      {escolhidos.size > 0 && (
        <div>
          <span className="block text-xs font-medium text-slate-500">{comContrato ? 'Padrinho e contrato de cada um' : 'Padrinho de cada um'}</span>
          <ul className="mt-1 space-y-3">
            {[...escolhidos].map(([id, e]) => {
              const falta = comContrato ? faltando(e.dados) : [];
              return (
                <li key={id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 font-medium text-slate-900">{porId.get(id)?.nome}</span>
                    <select value={e.padrinho ?? ''} onChange={(ev) => atualizar(id, (x) => ({ ...x, padrinho: ev.target.value ? Number(ev.target.value) : null }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">Padrinho a definir</option>
                      {padrinhos.filter((p) => p.id !== id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>

                  {comContrato && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs text-slate-500">Contrato com
                          <select value={e.empresa} onChange={(ev) => { const emp = ev.target.value as Empresa; atualizar(id, (x) => ({ ...x, empresa: emp, faixa: faixasDe(emp).includes(x.faixa) ? x.faixa : 40 })); }} className={inp}>
                            {EMPRESAS.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-slate-500">Plano de partilha
                          <select value={e.faixa} onChange={(ev) => atualizar(id, (x) => ({ ...x, faixa: Number(ev.target.value) as Faixa }))} className={inp}>
                            {faixasDe(e.empresa).map((f) => <option key={f} value={f}>{FAIXA_ROTULO(f, e.empresa)}</option>)}
                          </select>
                        </label>
                        <button type="button" onClick={() => colarHub(id)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
                          Colar dados do hub
                        </button>
                        <button type="button" onClick={() => verPdf(id)} disabled={pdfPend !== null || falta.length > 0} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          {pdfPend === id ? 'Gerando…' : 'Ver contrato (PDF)'}
                        </button>
                      </div>
                      {msg[id] && <p className="mt-2 text-xs text-slate-600">{msg[id]}</p>}
                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        {CAMPOS.map((f) => (
                          <label key={f.k} className={`text-xs text-slate-500 ${f.larg ?? ''}`}>
                            {f.rot}
                            <input value={e.dados[f.k]} onChange={(ev) => atualizar(id, (x) => ({ ...x, dados: { ...x.dados, [f.k]: ev.target.value } }))} className={inp} />
                          </label>
                        ))}
                      </div>
                      {falta.length > 0 && <p className="mt-2 text-xs text-amber-700">Falta: {falta.join(', ')}.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={cadastrar}
        disabled={bloqueado}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Cadastrando…' : `Cadastrar${escolhidos.size ? ` (${escolhidos.size})` : ''}${comContrato ? ' e enviar contrato' : ''}`}
      </button>
      {pendencias.length > 0 && <p className="text-xs text-amber-700">Complete os dados do contrato de: {pendencias.map((p) => porId.get(p.id)?.nome).join(', ')}.</p>}

      {res && (
        <div className="space-y-2 text-sm">
          {res.cadastrados.length > 0 && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
              Na trilha: {res.cadastrados.join(', ')}. <Link href="/treinamento" className="font-medium underline">Ver no treinamento</Link>
            </p>
          )}
          {res.avisos.map((f, i) => (
            <p key={'a' + i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">{f.nome}: {f.aviso}</p>
          ))}
          {res.falhas.map((f, i) => (
            <p key={i} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{f.nome}: {f.erro}</p>
          ))}
        </div>
      )}
    </div>
  );
}

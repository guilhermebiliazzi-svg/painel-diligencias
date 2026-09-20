'use client';

import { useState } from 'react';
import type { Contato, PessoaNaUnidade, ResultadoUnidade } from '@/lib/directd';

// CPF fica mascarado na lista: para decidir com quem falar basta o nome. O
// número inteiro só aparece depois da consulta de contato, que é quem de fato
// precisa dele.
function cpfCurto(c: string) {
  return c.length === 11 ? `${c.slice(0, 3)}.***.***-${c.slice(9)}` : c;
}
function cpfCheio(c: string) {
  return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c;
}
function fone(n: string) {
  const ddd = n.slice(0, 2);
  const r = n.slice(2);
  return r.length === 9
    ? `(${ddd}) ${r.slice(0, 5)}-${r.slice(5)}`
    : `(${ddd}) ${r.slice(0, 4)}-${r.slice(4)}`;
}
function dataBr(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

const CAMPOS = [
  ['cep', 'CEP', '01310-100', 'sm:col-span-2'],
  ['rua', 'Rua', 'Avenida Paulista', 'sm:col-span-4'],
  ['numero', 'Número', '1000', 'sm:col-span-2'],
  ['unidade', 'Unidade', '44', 'sm:col-span-2'],
  ['bairro', 'Bairro', 'Bela Vista', 'sm:col-span-2'],
  ['cidade', 'Cidade', 'São Paulo', 'sm:col-span-4'],
  ['uf', 'UF', 'SP', 'sm:col-span-2'],
] as const;

type Campo = (typeof CAMPOS)[number][0];

const VAZIO: Record<Campo, string> = {
  cep: '', rua: '', numero: '', unidade: '', bairro: '', cidade: '', uf: '',
};

async function pedir<T>(rota: string, corpo: unknown): Promise<T> {
  const r = await fetch(rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
  return j as T;
}

export default function BuscaUnidade() {
  const [form, setForm] = useState<Record<Campo, string>>(VAZIO);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [res, setRes] = useState<ResultadoUnidade | null>(null);
  const [contatos, setContatos] = useState<Record<string, Contato>>({});

  function mudar(k: Campo, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function procurar() {
    setErro('');
    setRes(null);
    setContatos({});
    setBuscando(true);
    try {
      setRes(await pedir<ResultadoUnidade>('/api/captacao/unidade', form));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        O vínculo da base é <b>cadastral, não registral</b>. Quem aparece aqui pode ser o
        proprietário, um ex-morador ou um inquilino — isto não prova propriedade, matrícula
        prova. Serve para saber com quem falar.
      </div>

      <div
        style={{ backgroundColor: '#ffffff' }}
        className="mt-4 rounded-2xl border border-slate-200 p-5 shadow-sm"
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          {CAMPOS.map(([k, rotulo, dica, span]) => (
            <div key={k} className={`col-span-2 ${span}`}>
              <label
                htmlFor={k}
                className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {rotulo}
              </label>
              <input
                id={k}
                value={form[k]}
                placeholder={dica}
                maxLength={k === 'uf' ? 2 : undefined}
                onChange={(e) => mudar(k, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') procurar();
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={procurar}
            disabled={buscando}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
          >
            {buscando ? 'Procurando…' : 'Procurar'}
          </button>
          <span className="text-sm text-slate-500">Esta busca não consome saldo.</span>
        </div>
      </div>

      {erro && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {erro}
        </p>
      )}

      {res && res.quantidade === 0 && (
        <div
          style={{ backgroundColor: '#ffffff' }}
          className="mt-4 rounded-2xl border border-slate-200 p-5 text-sm shadow-sm"
        >
          <b className="text-slate-900">
            Ninguém consta ligado a {res.unidade} neste endereço.
          </b>
          <p className="mt-1 text-slate-600">
            Vale conferir a grafia do endereço e o CEP.
          </p>
        </div>
      )}

      {res && res.quantidade > 0 && (
        <div
          style={{ backgroundColor: '#ffffff' }}
          className="mt-4 rounded-2xl border border-slate-200 p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {res.unidade} · {res.quantidade} {res.quantidade === 1 ? 'pessoa' : 'pessoas'}
          </p>

          <ul className="mt-2 divide-y divide-slate-200">
            {res.pessoas.map((p) => (
              <Pessoa
                key={p.cpf}
                pessoa={p}
                contato={contatos[p.cpf]}
                aoAchar={(c) => setContatos((m) => ({ ...m, [p.cpf]: c }))}
              />
            ))}
          </ul>

          {res.descartadosPorPrefixo > 0 && (
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              {res.descartadosPorPrefixo} registro(s) de unidades vizinhas foram descartados: a
              base casa o complemento por prefixo, então “{res.unidade}” também traz{' '}
              {res.unidade}0, {res.unidade}1 e assim por diante.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Pessoa({
  pessoa,
  contato,
  aoAchar,
}: {
  pessoa: PessoaNaUnidade;
  contato?: Contato;
  aoAchar: (c: Contato) => void;
}) {
  // Dois toques antes de gastar: o primeiro arma, o segundo cobra, e desarma
  // sozinho em 6 s. Mesmo padrão do "Limpar ficha" da ficha de captação — um
  // toque sem querer não vira conta.
  const [armado, setArmado] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');

  async function clicar() {
    if (!armado) {
      setArmado(true);
      setTimeout(() => setArmado(false), 6000);
      return;
    }
    setArmado(false);
    setBuscando(true);
    setErro('');
    try {
      aoAchar(await pedir<Contato>('/api/captacao/contato', { cpf: pessoa.cpf }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <li className="py-4">
      <p className="font-semibold text-slate-900">{pessoa.nome}</p>
      <p className="mt-0.5 text-sm text-slate-500">
        {cpfCurto(pessoa.cpf)}
        {pessoa.nascimento && ` · nasc. ${dataBr(pessoa.nascimento)}`}
        {pessoa.nomeMae && ` · mãe: ${pessoa.nomeMae}`}
      </p>

      {!contato && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={clicar}
            disabled={buscando}
            className={
              'rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition disabled:opacity-50 ' +
              (armado
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-50')
            }
          >
            {buscando
              ? 'Buscando…'
              : armado
                ? 'Confirmar — vai consumir saldo'
                : 'Buscar contato'}
          </button>
          {!erro && <span className="text-sm text-slate-500">consome saldo</span>}
          {erro && <span className="text-sm text-red-700">{erro}</span>}
        </div>
      )}

      {contato && <CartaoContato c={contato} />}
    </li>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </div>
  );
}

function CartaoContato({ c }: { c: Contato }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Bloco titulo="CPF">
        {cpfCheio(c.cpf)}
        {c.obito && (
          <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
            consta falecido
          </span>
        )}
      </Bloco>

      <Bloco titulo="Telefones">
        {c.telefones.length === 0 ? (
          <span className="text-slate-500">a base não trouxe telefone.</span>
        ) : (
          c.telefones.map((t) => (
            <div key={t.numero}>
              <a href={`tel:+55${t.numero}`} className="text-blue-700 hover:underline">
                {fone(t.numero)}
              </a>
              {t.celular && (
                <a
                  href={`https://wa.me/55${t.numero}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                >
                  WhatsApp
                </a>
              )}
            </div>
          ))
        )}
      </Bloco>

      {c.emails.length > 0 && (
        <Bloco titulo="E-mails">
          {c.emails.map((e) => (
            <div key={e}>
              <a href={`mailto:${e}`} className="text-blue-700 hover:underline">
                {e}
              </a>
            </div>
          ))}
        </Bloco>
      )}

      {c.alerta && <p className="mb-3 text-sm font-semibold text-red-700">{c.alerta}</p>}

      {c.parentescos.length > 0 && (
        <Bloco titulo="Parentescos">
          {c.parentescos.map((p, i) => (
            <div key={`${p.cpf}-${i}`}>
              {p.nome}
              {p.vinculo && ` — ${p.vinculo}`}
            </div>
          ))}
        </Bloco>
      )}

      {(c.rendaEstimada || c.classeSocial) && (
        <Bloco titulo="Perfil">
          {[
            c.rendaEstimada && `renda estimada ${c.rendaEstimada}`,
            c.classeSocial && `classe ${c.classeSocial}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Bloco>
      )}
    </div>
  );
}

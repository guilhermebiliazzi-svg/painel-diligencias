'use client';

// Uma linha por unidade, como o Iconatus: o SQL do apartamento vem do cadastro
// do IPTU (que sabe quais unidades existem) e o provável proprietário vem da
// DirectD (que sabe quem mora). Nenhuma das duas bases faz as duas coisas.

import { useRef, useState } from 'react';
import type { Contato, Endereco, PessoaNaUnidade, ResultadoUnidade } from '@/lib/directd';
import type { PredioIptu, UnidadeIptu } from '@/lib/iptu';
import { eleger, montarCpf, type Selo } from './cruzamento';
import { Pessoa, pedir } from './pessoa';

type Estado = {
  buscando?: boolean;
  erro?: string;
  pessoas?: PessoaNaUnidade[];
  descartados?: number;
};

const ESPERA_ENTRE_UNIDADES_MS = 400;

function moeda(v: number | null) {
  return v === null ? '—' : `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
}
function fracao(v: number | null) {
  return v === null ? '—' : v.toFixed(4);
}

const SELOS: Record<Selo, { texto: string; classe: string }> = {
  certidao: {
    texto: 'certidão',
    classe: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  unico: {
    texto: 'único vínculo',
    classe: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  ambiguo: {
    texto: 'não confirmado',
    classe: 'border-amber-200 bg-amber-50 text-amber-700',
  },
};

export default function TabelaPredio({
  predio,
  endereco,
  confere,
  cruzando,
  prefixo3,
}: {
  predio: PredioIptu;
  endereco: Endereco;
  confere: (p: PessoaNaUnidade) => boolean;
  cruzando: boolean;
  prefixo3: string | null;
}) {
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [aberta, setAberta] = useState<string | null>(null);
  const [contatos, setContatos] = useState<Record<string, Contato>>({});
  const [emLote, setEmLote] = useState(false);
  // useRef e não useState: o laço precisa ler o valor NOVO a cada volta, e o
  // state ficaria congelado no closure.
  const parar = useRef(false);

  const moradias = predio.unidades.filter((u) => !u.acessorio);
  const acessorios = predio.unidades.length - moradias.length;
  const prontas = moradias.filter((u) => estados[u.sql]?.pessoas).length;

  async function buscar(u: UnidadeIptu) {
    if (!u.consulta) return;
    setEstados((m) => ({ ...m, [u.sql]: { buscando: true } }));
    try {
      const r = await pedir<ResultadoUnidade>('/api/captacao/unidade', {
        ...endereco,
        unidade: u.consulta,
      });
      setEstados((m) => ({
        ...m,
        [u.sql]: { pessoas: r.pessoas, descartados: r.descartadosPorPrefixo },
      }));
    } catch (e) {
      setEstados((m) => ({
        ...m,
        [u.sql]: { erro: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  async function buscarTodas() {
    parar.current = false;
    setEmLote(true);
    for (const u of moradias) {
      if (parar.current) break;
      if (estados[u.sql]?.pessoas) continue;
      await buscar(u);
      // Uma pausinha entre unidades: são 11 chamadas por apartamento e não
      // vale a pena bater na DirectD sem respirar.
      await new Promise((r) => setTimeout(r, ESPERA_ENTRE_UNIDADES_MS));
    }
    setEmLote(false);
  }

  return (
    <div
      style={{ backgroundColor: '#ffffff' }}
      className="mt-4 overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
    >
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-base font-semibold text-slate-900">
          {predio.logradouro}
          {predio.numero !== null && `, ${predio.numero}`}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          {[predio.referencia, predio.bairro, predio.cep].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          <b className="text-slate-800">{predio.unidades.length} unidades</b>
          {acessorios > 0 && ` (${acessorios} vaga/box, sem morador)`} · setor {predio.setor},
          quadra {predio.quadra} · condomínio {predio.condominio}
          {predio.anoConstrucao !== null && ` · construído em ${predio.anoConstrucao}`}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={emLote ? () => (parar.current = true) : buscarTodas}
            className={
              'rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm transition ' +
              (emLote
                ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                : 'bg-slate-900 text-white hover:bg-slate-700')
            }
          >
            {emLote ? 'Parar' : 'Buscar todas as unidades'}
          </button>
          <span className="text-xs text-slate-500">
            {prontas} de {moradias.length} unidades consultadas · não consome saldo, mas leva
            cerca de 40 s por unidade
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">SQL</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">Unidade</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">
                Provável proprietário
              </th>
              <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Área</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Fração</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Venal</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Desde</th>
            </tr>
          </thead>
          <tbody>
            {predio.unidades.map((u) => {
              const e = estados[u.sql] ?? {};
              const abertaAqui = aberta === u.sql;
              return (
                <Linha
                  key={u.sql}
                  u={u}
                  estado={e}
                  aberta={abertaAqui}
                  confere={confere}
                  cruzando={cruzando}
                  prefixo3={prefixo3}
                  contatos={contatos}
                  aoBuscar={() => buscar(u)}
                  aoAbrir={() => setAberta(abertaAqui ? null : u.sql)}
                  aoAcharContato={(cpf, c) => setContatos((m) => ({ ...m, [cpf]: c }))}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-200 px-5 py-4 text-xs leading-relaxed text-slate-500">
        SQL, área, fração e valor venal vêm do cadastro do IPTU da prefeitura. O nome vem do
        vínculo cadastral de endereço da DirectD, que <b>não prova propriedade</b>: quem
        aparece pode ser o dono, um ex-dono ou um inquilino. Só a linha marcada{' '}
        <b>certidão</b> tem confirmação documental. Para confirmar as outras, tire a certidão
        de dados cadastrais com o SQL da linha e informe o nome ou os 3 primeiros dígitos do
        CPF no campo acima.
      </p>
    </div>
  );
}

function Linha({
  u,
  estado,
  aberta,
  confere,
  cruzando,
  prefixo3,
  contatos,
  aoBuscar,
  aoAbrir,
  aoAcharContato,
}: {
  u: UnidadeIptu;
  estado: Estado;
  aberta: boolean;
  confere: (p: PessoaNaUnidade) => boolean;
  cruzando: boolean;
  prefixo3: string | null;
  contatos: Record<string, Contato>;
  aoBuscar: () => void;
  aoAbrir: () => void;
  aoAcharContato: (cpf: string, c: Contato) => void;
}) {
  const pessoas = estado.pessoas;
  const { pessoa, selo, outros } = eleger(pessoas ?? [], cruzando ? confere : undefined);

  return (
    <>
      <tr className="border-b border-slate-100 align-middle last:border-b-0 hover:bg-slate-50/60">
        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-500">
          {u.sql}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-900">
          {u.complemento || '—'}
        </td>
        <td className="min-w-[260px] px-4 py-2.5">
          {u.acessorio ? (
            <span className="text-xs text-slate-400">vaga/box — sem morador</span>
          ) : estado.buscando ? (
            <span className="text-xs text-slate-500">buscando…</span>
          ) : estado.erro ? (
            <span className="text-xs text-red-700">{estado.erro}</span>
          ) : !pessoas ? (
            <button
              onClick={aoBuscar}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 shadow-sm transition hover:bg-amber-50"
            >
              Buscar
            </button>
          ) : !pessoa ? (
            <span className="text-xs text-slate-400">ninguém consta</span>
          ) : (
            <button onClick={aoAbrir} className="text-left">
              <span className="font-semibold text-slate-900">{pessoa.nome}</span>
              {selo && (
                <span
                  className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SELOS[selo].classe}`}
                >
                  {SELOS[selo].texto}
                </span>
              )}
              {outros > 0 && (
                <span className="ml-2 text-xs text-slate-500">
                  +{outros} {outros === 1 ? 'pessoa' : 'pessoas'}
                </span>
              )}
            </button>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-700">
          {u.areaConstruida === null ? '—' : `${u.areaConstruida} m²`}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-700">
          {fracao(u.fracaoIdeal)}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-700">
          {moeda(u.venal)}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-700">
          {u.anoInicio ?? '—'}
        </td>
      </tr>

      {aberta && pessoas && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={7} className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Todos os vínculos de {u.complemento} — {pessoas.length}{' '}
              {pessoas.length === 1 ? 'pessoa' : 'pessoas'}
            </p>
            <ul className="divide-y divide-slate-200">
              {pessoas.map((p) => (
                <Pessoa
                  key={p.idDirectd || p.cpf}
                  pessoa={p}
                  contato={contatos[p.cpf]}
                  noIptu={cruzando && confere(p)}
                  cpfMontado={prefixo3 ? montarCpf(prefixo3, p.cpf) : null}
                  aoAchar={(c) => aoAcharContato(p.cpf, c)}
                />
              ))}
            </ul>
            {(estado.descartados ?? 0) > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {estado.descartados} registro(s) de unidades vizinhas foram descartados: a base
                casa o complemento por prefixo.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

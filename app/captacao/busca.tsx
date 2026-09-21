'use client';

import { useState } from 'react';
import type { Contato, PessoaNaUnidade, ResultadoUnidade } from '@/lib/directd';
import type { PredioIptu } from '@/lib/iptu';
import TabelaPredio from './predio';
import { Pessoa, pedir } from './pessoa';
import {
  bateComIptu,
  bateComNome,
  ehNome,
  montarCpf,
  padraoDoIptu,
} from './cruzamento';

// As regras puras moraram aqui e agora vivem em ./cruzamento. O reexport
// mantém `import { … } from './busca'` funcionando para quem já usava.
export {
  bateComIptu,
  bateComNome,
  conferirReconstrucao,
  digitosVerificadores,
  ehNome,
  montarCpf,
  padraoDoIptu,
} from './cruzamento';


const CAMPOS = [
  ['cep', 'CEP', '01310-100', 'sm:col-span-2'],
  ['rua', 'Rua', 'Avenida Paulista', 'sm:col-span-4'],
  ['numero', 'Número', '1000', 'sm:col-span-2'],
  ['unidade', 'Unidade', '44 — vazio monta a tabela do prédio', 'sm:col-span-2'],
  ['bairro', 'Bairro', 'Bela Vista', 'sm:col-span-2'],
  ['cidade', 'Cidade', 'São Paulo', 'sm:col-span-4'],
  ['uf', 'UF', 'SP', 'sm:col-span-2'],
] as const;

type Campo = (typeof CAMPOS)[number][0];

const VAZIO: Record<Campo, string> = {
  cep: '', rua: '', numero: '', unidade: '', bairro: '', cidade: '', uf: '',
};

export default function BuscaUnidade() {
  const [form, setForm] = useState<Record<Campo, string>>(VAZIO);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [res, setRes] = useState<ResultadoUnidade | null>(null);
  const [predio, setPredio] = useState<PredioIptu | null>(null);
  const [contatos, setContatos] = useState<Record<string, Contato>>({});
  // Fica FORA do `form`: é conferência local, nunca vai para a DirectD.
  const [iptu, setIptu] = useState('');

  const porNome = ehNome(iptu);
  // Três dígitos da certidão + os seis da DirectD reconstroem o CPF inteiro.
  const prefixo3 =
    !porNome && /^\d{3}$/.test(iptu.replace(/\D/g, '')) ? iptu.replace(/\D/g, '') : null;
  const padraoIptu = porNome ? null : padraoDoIptu(iptu);
  const iptuInvalido = iptu.trim().length > 0 && !porNome && padraoIptu === null;
  const confere = (p: PessoaNaUnidade) =>
    porNome ? bateComNome(p.nome, iptu) : bateComIptu(p.cpf, padraoIptu);
  const cruzando = porNome ? iptu.trim().length > 1 : padraoIptu !== null;

  function mudar(k: Campo, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function procurar() {
    setErro('');
    setRes(null);
    setPredio(null);
    setContatos({});
    setBuscando(true);
    try {
      // Sem unidade, o caminho é a TABELA DO PRÉDIO: o cadastro do IPTU diz
      // quais apartamentos existem e qual o SQL de cada um — coisa que a
      // DirectD não sabe. A consulta de morador vira uma linha de cada vez.
      if (!form.unidade.trim()) {
        const r = await pedir<{ achou: boolean; predio?: PredioIptu }>(
          '/api/captacao/predio',
          { cep: form.cep, numero: form.numero }
        );
        if (r.achou && r.predio) {
          setPredio(r.predio);
          return;
        }
        // O prédio não está no cadastro (ou é imóvel fora de SP): cai no
        // comportamento antigo, que lista todo mundo ligado ao endereço.
        setRes(await pedir<ResultadoUnidade>('/api/captacao/unidade', form));
        return;
      }
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

        <div className="mt-4 border-t border-slate-200 pt-4">
          <label
            htmlFor="iptu"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            O que a certidão do IPTU mostra — nome ou CPF (opcional)
          </label>
          <input
            id="iptu"
            value={iptu}
            placeholder="SERGIO EDU****   ou   701   ou   ***.456.789-**"
            onChange={(e) => setIptu(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:max-w-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            {iptuInvalido
              ? 'Ou só os primeiros dígitos (ex.: 701), ou a máscara inteira com 11 posições (***.456.789-**).'
              : 'O nome é o caminho mais seguro: a certidão mostra os 3 primeiros dígitos do CPF e esta lista traz os 6 do meio — os números não se cruzam. Nada aqui consome saldo.'}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={procurar}
            disabled={buscando}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
          >
            {buscando ? 'Procurando…' : 'Procurar'}
          </button>
          <span className="text-sm text-slate-500">
            Não consome saldo. Sem a unidade, monta a tabela do prédio — para isso precisa do CEP e do número.
          </span>
        </div>
      </div>

      {erro && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {erro}
        </p>
      )}

      {predio && (
        <TabelaPredio
          predio={predio}
          endereco={{
            cep: form.cep, rua: form.rua, numero: form.numero,
            bairro: form.bairro, cidade: form.cidade, uf: form.uf,
          }}
          confere={confere}
          cruzando={cruzando}
          prefixo3={prefixo3}
        />
      )}

      {res && res.quantidade === 0 && (
        <div
          style={{ backgroundColor: '#ffffff' }}
          className="mt-4 rounded-2xl border border-slate-200 p-5 text-sm shadow-sm"
        >
          <b className="text-slate-900">
            Ninguém consta ligado a {res.predioInteiro ? 'este endereço' : res.unidade}.
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
            {res.predioInteiro ? 'Prédio inteiro' : res.unidade} · {res.quantidade}{' '}
            {res.quantidade === 1 ? 'pessoa' : 'pessoas'}
          </p>

          {res.predioInteiro && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Busca sem complemento: são todas as pessoas ligadas ao endereço. A base não
              devolve o apartamento de cada uma — para saber a unidade, repita a busca
              preenchendo o campo.
            </p>
          )}

          {res.totalNaBase > res.quantidade + res.descartadosPorPrefixo && (
            <p className="mt-1 text-xs leading-relaxed text-amber-700">
              A DirectD diz ter encontrado {res.totalNaBase} pessoas neste filtro, mas
              devolveu {res.quantidade + res.descartadosPorPrefixo}. A lista abaixo pode
              estar incompleta — vale estreitar o endereço.
            </p>
          )}

          {cruzando && <AvisoIptu pessoas={res.pessoas} confere={confere} porNome={porNome} />}

          <ul className="mt-2 divide-y divide-slate-200">
            {[...res.pessoas]
              .sort((a, b) => Number(confere(b)) - Number(confere(a)))
              .map((p) => (
                <Pessoa
                  key={p.cpf}
                  pessoa={p}
                  contato={contatos[p.cpf]}
                  noIptu={cruzando && confere(p)}
                  cpfMontado={prefixo3 ? montarCpf(prefixo3, p.cpf) : null}
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

function AvisoIptu({
  pessoas,
  confere,
  porNome,
}: {
  pessoas: PessoaNaUnidade[];
  confere: (p: PessoaNaUnidade) => boolean;
  porNome: boolean;
}) {
  const batem = pessoas.filter(confere);

  if (batem.length === 0) {
    return (
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        Nenhum CPF da lista bate com o da notificação do IPTU. O contribuinte do IPTU não
        está entre as pessoas que a base liga a este endereço — pode ser espólio, empresa,
        ou alguém que nunca constou aqui.
      </p>
    );
  }
  if (batem.length > 1) {
    return (
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        {batem.length} pessoas batem com o que você informou — não chega para distinguir.
        {porNome
          ? ' Tente o nome completo.'
          : ' Lembre que os números da certidão e os desta lista ocupam posições diferentes do CPF; o nome separa melhor.'}
      </p>
    );
  }
  return (
    <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">
      O IPTU está no CPF de <b>{batem[0].nome}</b>. Confere com o nome que aparece na
      notificação antes de usar.
    </p>
  );
}

'use client';

import { useState } from 'react';
import type { Contato, PessoaNaUnidade, ResultadoUnidade } from '@/lib/directd';

// A DirectD devolve os SEIS DÍGITOS DO MEIO (posições 4 a 9). Mostrar cru
// confunde; mostrar na posição certa deixa claro o que se tem e o que falta.
function cpfParcial(c: string) {
  if (c.length === 6) return `***.${c.slice(0, 3)}.${c.slice(3)}-**`;
  if (c.length === 11) return `${c.slice(0, 3)}.***.***-${c.slice(9)}`;
  return c;
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
// A notificação de lançamento do IPTU mostra o CPF do contribuinte com parte
// dos dígitos escondida (ex.: ***.456.789-**). Como a lista daqui traz o CPF
// inteiro, dá para cruzar e descobrir em nome de quem está o IPTU — de graça,
// sem a consulta paga. E é um sinal bem mais forte de propriedade que o
// vínculo cadastral de endereço.
//
// A comparação é por POSIÇÃO e aceita qualquer máscara: tudo que não é dígito
// vira curinga. Assim funciona com *, x, # ou espaço, sem precisar saber de
// antemão como a prefeitura escondeu.
export function padraoDoIptu(entrada: string): string | null {
  const bruto = entrada.replace(/[.\-\s/]/g, '');
  if (!bruto) return null;

  // Máscara completa, do jeito que a notificação mostra: ***.456.789-**
  if (bruto.length === 11) return bruto.replace(/\D/g, '?');

  // Só os primeiros dígitos, que é o que a certidão de dados cadastrais
  // entrega (ex.: "701"). Vira prefixo: 701????????.
  if (bruto.length < 11 && /^\d+$/.test(bruto)) {
    return bruto + '?'.repeat(11 - bruto.length);
  }

  return null;
}

// A DirectD devolve os SEIS DÍGITOS DO MEIO do CPF (posições 4 a 9) e a
// certidão do IPTU mostra os TRÊS PRIMEIROS (posições 1 a 3). Os conjuntos não
// se tocam — cruzar número com número é impossível entre essas duas fontes.
// Por isso o campo também aceita NOME: a certidão costuma trazer o nome do
// contribuinte, e a lista daqui traz o nome inteiro.
/**
 * Os dois últimos dígitos do CPF não são informação: são CALCULADOS dos nove
 * primeiros. Então a certidão (posições 1 a 3) e a DirectD (posições 4 a 9)
 * juntas fecham o CPF inteiro, sem chute.
 */
export function digitosVerificadores(nove: string): string | null {
  if (!/^\d{9}$/.test(nove)) return null;
  const dv = (base: string) => {
    const peso0 = base.length + 1;
    const soma = base.split('').reduce((t, d, i) => t + Number(d) * (peso0 - i), 0);
    const r = (soma * 10) % 11;
    return String(r === 10 ? 0 : r);
  };
  const d10 = dv(nove);
  return d10 + dv(nove + d10);
}

/** Prefixo da certidão (3) + miolo da DirectD (6) -> CPF completo (11). */
export function montarCpf(prefixo: string, miolo: string): string | null {
  const p = prefixo.replace(/\D/g, '');
  const m = miolo.replace(/\D/g, '');
  if (p.length !== 3 || m.length !== 6) return null;
  const dvs = digitosVerificadores(p + m);
  return dvs ? p + m + dvs : null;
}

/**
 * Confere se o CPF reconstruído é MESMO daquela pessoa.
 *
 * Isto é o coração do método. Montar prefixo + miolo sempre produz um CPF
 * válido — os verificadores eu calculo, não observo —, então validade não
 * prova nada. Quem prova é a consulta: o filtro já deu de graça o nome, o ano
 * de nascimento e um pedaço do nome da mãe, mascarados; a consulta por CPF
 * devolve os três sem máscara. Três sinais independentes batendo é confirmação;
 * um divergindo já descarta.
 */
export function conferirReconstrucao(
  pessoa: { nome: string; nomeMae: string; nascimento: string },
  contato: { nome: string; nomeMae: string; nascimento: string }
): { veredito: 'confirma' | 'nega' | 'insuficiente'; sinais: string[] } {
  const limpo = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  const ano = (t: string) => (t.match(/(\d{4})/) || [])[1] || '';

  const sinais: string[] = [];
  let confere = 0;
  let nega = 0;

  if (pessoa.nome && contato.nome) {
    // O filtro às vezes devolve o nome cortado ("SERGIO EDU****"): nesse caso
    // basta o começo bater, senão a comparação inteira acusaria diferença.
    const cortado = /[*#]/.test(pessoa.nome);
    const esq = limpo(cortado ? pessoa.nome.split(/[*#]/)[0] : pessoa.nome);
    const dir = limpo(contato.nome);
    const bate = esq ? (cortado ? dir.startsWith(esq) : esq === dir) : false;
    if (esq) {
      sinais.push(bate ? 'nome confere' : 'nome diferente');
      if (bate) confere++;
      else nega++;
    }
  }
  const a1 = ano(pessoa.nascimento), a2 = ano(contato.nascimento);
  if (a1 && a2) {
    const bate = a1 === a2;
    sinais.push(bate ? 'ano de nascimento confere' : 'ano de nascimento diferente');
    if (bate) confere++;
    else nega++;
  }
  // O nome da mãe vem parcialmente escondido no filtro: compara só as palavras
  // que apareceram inteiras.
  const palavras = limpo(pessoa.nomeMae).split(' ').filter((w) => w.length > 2);
  if (palavras.length && contato.nomeMae) {
    const mae = limpo(contato.nomeMae);
    const bate = palavras.every((w) => mae.includes(w));
    sinais.push(bate ? 'nome da mãe confere' : 'nome da mãe diferente');
    if (bate) confere++;
    else nega++;
  }

  if (nega > 0) return { veredito: 'nega', sinais };
  if (confere >= 2) return { veredito: 'confirma', sinais };
  return { veredito: 'insuficiente', sinais };
}

export function ehNome(entrada: string): boolean {
  return /[a-zA-ZÀ-ÿ]/.test(entrada);
}

function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compara o nome da certidão com o nome da lista. Aceita nome mascarado
 * ("SERGIO EDU****"): os asteriscos viram fim de prefixo, e basta o começo
 * bater. Sem máscara, exige que cada palavra informada apareça no nome.
 */
export function bateComNome(nomeDaLista: string, entrada: string): boolean {
  const alvo = normalizar(nomeDaLista);
  if (!alvo) return false;

  const mascarado = /[*#]/.test(entrada);
  const busca = normalizar(entrada.split(/[*#]/)[0]);
  if (!busca) return false;

  if (mascarado) return alvo.startsWith(busca);
  return busca.split(' ').every((palavra) => alvo.split(' ').includes(palavra));
}

export function bateComIptu(cpf: string, padrao: string | null): boolean {
  if (!padrao || cpf.length !== 11) return false;
  for (let i = 0; i < 11; i++) {
    if (padrao[i] !== '?' && padrao[i] !== cpf[i]) return false;
  }
  return true;
}

function dataBr(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

const CAMPOS = [
  ['cep', 'CEP', '01310-100', 'sm:col-span-2'],
  ['rua', 'Rua', 'Avenida Paulista', 'sm:col-span-4'],
  ['numero', 'Número', '1000', 'sm:col-span-2'],
  ['unidade', 'Unidade', '44 — vazio traz o prédio', 'sm:col-span-2'],
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
            Esta busca não consome saldo. Sem a unidade, traz o condomínio inteiro.
          </span>
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

function Pessoa({
  pessoa,
  contato,
  noIptu,
  cpfMontado,
  aoAchar,
}: {
  pessoa: PessoaNaUnidade;
  contato?: Contato;
  noIptu?: boolean;
  cpfMontado?: string | null;
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
      // A consulta paga precisa de 11 dígitos. Só o CPF reconstruído serve.
      aoAchar(await pedir<Contato>('/api/captacao/contato', { cpf: cpfMontado || '' }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <li className="py-4">
      <p className="font-semibold text-slate-900">
        {pessoa.nome}
        {noIptu && (
          <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            bate com o IPTU
          </span>
        )}
      </p>
      <p className="mt-0.5 text-sm text-slate-500">
        {cpfMontado ? cpfCheio(cpfMontado) : cpfParcial(pessoa.cpf)}
        {pessoa.nascimento && ` · nasc. ${dataBr(pessoa.nascimento)}`}
        {pessoa.nomeMae && ` · mãe: ${pessoa.nomeMae}`}
      </p>

      {!contato && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={clicar}
            disabled={buscando || !cpfMontado}
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
          {!cpfMontado && (
            <span className="text-sm text-slate-500">
              precisa dos 3 dígitos da certidão
            </span>
          )}
          {!erro && <span className="text-sm text-slate-500">consome saldo</span>}
          {erro && <span className="text-sm text-red-700">{erro}</span>}
        </div>
      )}

      {contato && (
        <>
          {cpfMontado && <Veredito pessoa={pessoa} contato={contato} />}
          <CartaoContato c={contato} />
        </>
      )}
    </li>
  );
}

function Veredito({
  pessoa,
  contato,
}: {
  pessoa: PessoaNaUnidade;
  contato: Contato;
}) {
  const { veredito, sinais } = conferirReconstrucao(pessoa, contato);
  const cor =
    veredito === 'confirma'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : veredito === 'nega'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-amber-200 bg-amber-50 text-amber-900';
  const texto =
    veredito === 'confirma'
      ? 'CPF confirmado: os dados batem com esta pessoa.'
      : veredito === 'nega'
        ? 'Este CPF NÃO é desta pessoa — o prefixo da certidão é de outro candidato.'
        : 'Não deu para confirmar: a base devolveu pouca coisa para comparar.';
  return (
    <p className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${cor}`}>
      <b>{texto}</b>
      {sinais.length > 0 && <> — {sinais.join(', ')}.</>}
    </p>
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

// Regras puras do cruzamento: máscara do IPTU, nome, reconstrução do CPF e
// eleição do provável proprietário. Fica fora dos componentes para poder ser
// testado sem React e usado tanto pela busca de unidade quanto pela tabela do
// prédio.
import type { PessoaNaUnidade } from '@/lib/directd';

// A DirectD devolve os SEIS DÍGITOS DO MEIO (posições 4 a 9). Mostrar cru
// confunde; mostrar na posição certa deixa claro o que se tem e o que falta.
export function cpfParcial(c: string) {
  if (c.length === 6) return `***.${c.slice(0, 3)}.${c.slice(3)}-**`;
  if (c.length === 11) return `${c.slice(0, 3)}.***.***-${c.slice(9)}`;
  return c;
}
export function cpfCheio(c: string) {
  return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c;
}
export function fone(n: string) {
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

export function normalizar(t: string): string {
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

export function dataBr(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export type Selo = 'certidao' | 'unico' | 'ambiguo';

export type Eleito = {
  pessoa: PessoaNaUnidade | null;
  selo: Selo | null;
  /** Quantos outros nomes a base liga à mesma unidade. */
  outros: number;
};

/**
 * Quem é o PROVÁVEL proprietário da unidade.
 *
 * A base é cadastral: numa mesma unidade costumam aparecer o dono, o ex-dono e
 * o inquilino, sem nada que os separe. Por isso a eleição é declarada, não
 * adivinhada:
 *
 *   certidao — o que você digitou da certidão/notificação do IPTU casou com um
 *              nome só. É o único caso em que há prova documental.
 *   unico    — a base liga uma pessoa só à unidade. Provável, não provado.
 *   ambiguo  — há mais de um candidato e nada para desempatar. Mostra o
 *              primeiro e diz quantos ficaram atrás.
 *
 * Nunca inventa um critério de desempate (mais novo, primeiro da lista como se
 * fosse ranking): a base não devolve data de vínculo, então qualquer ordem
 * seria falsa precisão.
 */
export function eleger(
  pessoas: PessoaNaUnidade[],
  confere?: (p: PessoaNaUnidade) => boolean
): Eleito {
  if (!pessoas.length) return { pessoa: null, selo: null, outros: 0 };

  if (confere) {
    const batem = pessoas.filter(confere);
    if (batem.length === 1) {
      return { pessoa: batem[0], selo: 'certidao', outros: pessoas.length - 1 };
    }
  }
  if (pessoas.length === 1) return { pessoa: pessoas[0], selo: 'unico', outros: 0 };
  return { pessoa: pessoas[0], selo: 'ambiguo', outros: pessoas.length - 1 };
}

// Captação — quem consta ligado a UMA unidade, e como falar com a pessoa.
//
// Duas etapas, e só a segunda custa dinheiro:
//
//   1. FilterNaturalPerson (Pesquisa Avançada) — NÃO consome saldo.
//      Endereço + complemento -> CPF, nome, nome da mãe, nascimento.
//   2. CadastroPessoaFisicaPlus (catálogo APIv3) — CONSOME saldo.
//      CPF -> telefones, e-mails, óbito, parentescos.
//
// A etapa 2 poderia usar o ProcessingIds/ViewSearch do produto novo, mas aquilo
// é assíncrono, exige polling e devolve exatamente o mesmo payload do Cadastro
// PF Plus, que no catálogo APIv3 é uma chamada síncrona por CPF. Para captação
// — uma unidade por vez — a chamada direta ganha em tudo.
//
// AVISO SOBRE O DADO: o vínculo da DirectD é CADASTRAL, não registral. Quem
// aparece ligado ao "Ap 44" pode ser o proprietário, um ex-morador, um inquilino
// ou um dependente. Isto NÃO prova propriedade — matrícula prova. A tela diz
// "consta ligado a esta unidade", nunca "o proprietário é".

const APIV3 = (process.env.DIRECTD_BASE || 'https://apiv3.directd.com.br').replace(/\/+$/, '');
// O manual da Pesquisa Avançada deixa a base como {base-url-directdata}.
// Descoberta em 20/09 lendo o bundle do painel da DirectD e confirmada pelo
// contraste: api.app.directd.com.br responde 405 (rota existe, só aceita POST)
// e apiv3.directd.com.br responde 404 (rota não existe lá). Fica em env para o
// caso de mudarem.
const AVANCADA = (
  process.env.DIRECTD_BASE_AVANCADA || 'https://api.app.directd.com.br'
).replace(/\/+$/, '');
// Grafia que a base guarda — testado em 20/09. Não é "APTO 44" nem o número solto.
const PREFIXO = process.env.DIRECTD_PREFIXO_UNIDADE ?? 'Ap ';

const TEMPO_LIMITE_MS = 45_000;

export class ErroDirectD extends Error {}

export type Endereco = {
  cep?: string; rua?: string; numero?: string;
  bairro?: string; cidade?: string; uf?: string;
};

export type PessoaNaUnidade = {
  cpf: string; nome: string; nomeMae: string; nascimento: string; idDirectd: string;
};

export type ResultadoUnidade = {
  unidade: string;
  /** true quando veio sem complemento: a lista é o condomínio inteiro. */
  predioInteiro: boolean;
  quantidade: number;
  pessoas: PessoaNaUnidade[];
  descartadosPorPrefixo: number;
  /** numberOfPeople que a DirectD diz ter achado — pode ser maior que a lista. */
  totalNaBase: number;
};

export type Contato = {
  cpf: string; nome: string; nascimento: string; idade: number | null; nomeMae: string;
  telefones: { numero: string; celular: boolean }[];
  whatsapp: string[];
  emails: string[];
  rendaEstimada: string; classeSocial: string;
  obito: boolean;
  parentescos: { nome: string; cpf: string; vinculo: string }[];
  alerta: string | null;
};

function digitos(v: unknown): string {
  return String(v ?? '').replace(/\D+/g, '');
}

function token(): string {
  const t = (process.env.DIRECTD_TOKEN || '').trim();
  if (!t) throw new ErroDirectD('DIRECTD_TOKEN não está configurado no projeto.');
  return t;
}

async function comPrazo(url: string, init: RequestInit): Promise<Response> {
  const corte = AbortSignal.timeout(TEMPO_LIMITE_MS);
  try {
    return await fetch(url, { ...init, signal: corte, cache: 'no-store' });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new ErroDirectD('A DirectD não respondeu a tempo.');
    }
    throw e;
  }
}

function conferirResposta(r: Response, texto: string) {
  // 404 no filtro é "nenhum resultado", não rota errada: é assim que o próprio
  // painel da DirectD responde uma busca que não achou ninguém (conferido em
  // 20/09 no app.directd.com.br). Quem trata isso como erro mostra
  // "HTTP 404" para o corretor em vez de "ninguém encontrado".
  if (r.status === 404) return;
  if (r.status === 401) throw new ErroDirectD('A DirectD recusou o token (401). Confira DIRECTD_TOKEN.');
  if (r.status === 403) {
    throw new ErroDirectD(
      'A DirectD respondeu 403: o produto não está liberado para esta empresa, ou não há saldo.'
    );
  }
  if (!r.ok) throw new ErroDirectD(`A DirectD respondeu HTTP ${r.status}: ${texto.slice(0, 200)}`);
}

/**
 * As 11 buscas: 1 do alvo + 10 de ruído, para a subtração de prefixos.
 *
 * O campo `complement` casa por PREFIXO: pedir "Ap 4" traz também Ap 40..49 e
 * Ap 400..499. E a resposta do filtro NÃO devolve o endereço — só id, CPF, nome,
 * nome da mãe e nascimento —, então não dá para separar depois olhando o dado.
 * Como o filtro é gratuito, pedimos também os prefixos sujos e subtraímos. Um
 * nível de dígito basta: "Ap 40" já cobre "Ap 400".."Ap 409".
 */
export function montarConsultas(endereco: Endereco, unidade: string) {
  const d = digitos(unidade);

  const base: Record<string, string> = {
    postalCode: digitos(endereco.cep),
    street: (endereco.rua || '').trim(),
    number: String(endereco.numero || '').trim(),
    neighborhood: (endereco.bairro || '').trim(),
    city: (endereco.cidade || '').trim(),
    state: (endereco.uf || '').trim().toUpperCase(),
  };
  for (const k of Object.keys(base)) if (!base[k]) delete base[k];
  if (!Object.keys(base).length) {
    throw new ErroDirectD('Informe ao menos um campo de endereço (CEP, ou rua e número).');
  }

  // Sem unidade: uma consulta só, sem `complement`. A base devolve todo mundo
  // ligado ao endereço — o condomínio inteiro. Não há prefixo, logo não há o
  // que subtrair, e as 11 chamadas viram 1.
  if (!d) {
    return {
      alvo: '',
      predioInteiro: true,
      consultas: [{ papel: 'alvo' as const, corpo: base }],
    };
  }

  const alvo = PREFIXO + d;
  const consultas: { papel: 'alvo' | 'ruido'; corpo: Record<string, string> }[] = [
    { papel: 'alvo', corpo: { ...base, complement: alvo } },
  ];
  for (let i = 0; i <= 9; i++) {
    consultas.push({ papel: 'ruido', corpo: { ...base, complement: alvo + i } });
  }
  return { alvo, predioInteiro: false, consultas };
}

/** Etapa GRATUITA. Quem consta ligado à unidade. */
export async function pessoasNaUnidade(
  endereco: Endereco,
  unidade: string
): Promise<ResultadoUnidade> {
  const t = token();
  const { alvo, predioInteiro, consultas } = montarConsultas(endereco, unidade);

  // As 11 vão em paralelo: em série seriam 11 idas e voltas e a tela ficaria
  // pensando por dezenas de segundos.
  const respostas = await Promise.all(
    consultas.map(async (c) => {
      const r = await comPrazo(`${AVANCADA}/api/AdvancedSearch/FilterNaturalPerson`, {
        method: 'POST',
        headers: { Token: t, 'Content-Type': 'application/json' },
        body: JSON.stringify(c.corpo),
      });
      const texto = await r.text();
      conferirResposta(r, texto);
      if (r.status === 404) return { listFilters: [], numberOfPeople: 0 };
      try {
        return JSON.parse(texto) as {
          listFilters?: Record<string, unknown>[];
          numberOfPeople?: number;
        };
      } catch {
        throw new ErroDirectD('A DirectD devolveu algo que não é JSON.');
      }
    })
  );

  const pessoas = new Map<string, PessoaNaUnidade>();
  const ruido = new Set<string>();

  respostas.forEach((resposta, i) => {
    for (const p of resposta.listFilters ?? []) {
      const cpf = digitos(p.cpf);
      if (!cpf) continue;
      if (consultas[i].papel === 'ruido') {
        ruido.add(cpf);
        continue;
      }
      pessoas.set(cpf, {
        cpf,
        nome: String(p.fullName ?? '').trim(),
        nomeMae: String(p.motherName ?? '').trim(),
        nascimento: String(p.dateOfBirth ?? '').trim(),
        idDirectd: String(p.id ?? ''),
      });
    }
  });

  const naUnidade = [...pessoas.values()]
    .filter((p) => !ruido.has(p.cpf))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    unidade: alvo,
    predioInteiro,
    quantidade: naUnidade.length,
    pessoas: naUnidade,
    // Se a DirectD diz ter achado mais gente do que veio na lista, a tela avisa
    // em vez de deixar o corretor achar que aquilo é o prédio todo.
    totalNaBase: Number(respostas[0]?.numberOfPeople ?? naUnidade.length),
    // A subtração erra num caso: alguém ligado ao Ap 4 E ao Ap 40 (mudou de
    // unidade no mesmo prédio) sai da lista. Raro, mas sumiria sem avisar — por
    // isso o número vai para a tela.
    descartadosPorPrefixo: pessoas.size - naUnidade.length,
  };
}

function numeroDe(t: unknown): string {
  if (typeof t === 'string') return digitos(t);
  const o = (t ?? {}) as Record<string, unknown>;
  return digitos(o.ddd ?? o.DDD) + digitos(o.telefone ?? o.numero ?? o.Telefone ?? o.Numero);
}

/** Etapa PAGA. Um CPF, uma consulta, uma cobrança. */
export async function contatoPorCpf(cpfEntrada: string): Promise<Contato> {
  const t = token();
  const cpf = digitos(cpfEntrada);
  // Guarda antes de gastar: um CPF malformado viraria cobrança por um 400.
  if (cpf.length !== 11) throw new ErroDirectD(`CPF inválido (${cpf.length} dígitos). Esperado 11.`);

  const url = `${APIV3}/api/CadastroPessoaFisicaPlus?CPF=${cpf}&TOKEN=${encodeURIComponent(t)}`;
  const r = await comPrazo(url, { method: 'GET' });
  const texto = await r.text();
  if (r.status === 404) {
    throw new ErroDirectD('A DirectD não localizou este CPF.');
  }
  conferirResposta(r, texto);

  let corpo: Record<string, unknown>;
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new ErroDirectD('A DirectD devolveu algo que não é JSON.');
  }

  const meta = (corpo.MetaDados ?? corpo.metaDados ?? {}) as Record<string, unknown>;
  const dado = (corpo.Retorno ?? corpo.retorno) as Record<string, unknown> | null;

  // A APIv3 pode criar a consulta em modo assíncrono (201/202) e devolver
  // Retorno nulo. Tratar isso como "sem telefone" seria mentir para o corretor.
  if (!dado) {
    const uid = String(meta.ConsultaUid ?? meta.consultaUid ?? '');
    throw new ErroDirectD(
      uid
        ? `A DirectD criou a consulta em modo assíncrono (uid ${uid}) e o resultado ainda não veio. Tente de novo em alguns segundos.`
        : String(meta.Mensagem ?? meta.mensagem ?? 'A consulta não devolveu dados para este CPF.')
    );
  }

  const telefones = ((dado.telefones ?? dado.Telefones ?? []) as unknown[])
    .map((x) => numeroDe(x))
    .filter((n) => n.length >= 10)
    // Celular = DDD + 9 + 8 dígitos. É o que serve para WhatsApp.
    .map((n) => ({ numero: n, celular: /^\d{2}9\d{8}$/.test(n) }))
    .sort((a, b) => Number(b.celular) - Number(a.celular));

  const emails = ((dado.emails ?? dado.Emails ?? []) as unknown[])
    .map((e) =>
      typeof e === 'string' ? e : String((e as Record<string, unknown>)?.email ?? '')
    )
    .map((e) => e.trim())
    .filter(Boolean);

  const obito = Boolean(dado.obito ?? dado.Obito);

  return {
    cpf: digitos(dado.cpf ?? dado.Cpf) || cpf,
    nome: String(dado.nome ?? dado.Nome ?? '').trim(),
    nascimento: String(dado.dataNascimento ?? '').trim(),
    idade: (dado.idade as number) ?? null,
    nomeMae: String(dado.nomeMae ?? '').trim(),
    telefones,
    whatsapp: telefones.filter((t2) => t2.celular).map((t2) => '55' + t2.numero),
    emails,
    rendaEstimada: String(dado.rendaEstimada ?? '').trim(),
    classeSocial: String(dado.classeSocial ?? '').trim(),
    // Para captação estes dois valem mais que a renda: se o titular morreu, a
    // conversa é de inventário; e os parentescos são o caminho até os herdeiros.
    obito,
    parentescos: ((dado.parentescos ?? dado.Parentescos ?? []) as Record<string, unknown>[]).map(
      (p) => ({
        nome: String(p.nome ?? '').trim(),
        cpf: digitos(p.cpf),
        vinculo: String(p.tipoParentesco ?? p.vinculo ?? '').trim(),
      })
    ),
    alerta: obito
      ? 'Titular consta como falecido — a captação passa pelo espólio e pelos herdeiros.'
      : null,
  };
}

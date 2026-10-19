// Texto do contrato de LOCAÇÃO e do contrato de ADMINISTRAÇÃO, montado a partir do
// cadastro do contrato (adm_contratos + adm_contratos.minuta), do imóvel, das partes
// (adm_contrato_partes) e da conta de repasse.
//
// Base: os contratos feitos à mão para a Rua Haddock Lobo, 999, apto 81 (Google Docs
// "Contrato de Locação Rua Hadock Lobo" e "Contrato de Administração Rua Hadock Lobo",
// out/2026). A cláusula de garantia vem de lib/clausulas-garantia.ts.
//
// Saída: lista de blocos (título, cláusula, parágrafo, assinatura) que
// lib/contrato-docx.ts transforma em .docx. Funções puras: dá para testar sem banco.

import {
  clausulaCapitalizacao, clausulaCaucao, clausulaFiador, clausulaSeguro,
  type Capitalizadora, type Cobertura, type Seguradora,
} from "@/lib/clausulas-garantia";
import { COM_CONJUGE, REGIMES, fmtCpfCnpj, soDigitos, type Parte } from "@/lib/contrato-partes";
import {
  dataPorExtenso, fmtData, nomeMes, numComExtenso, partesData, percentualComExtenso,
  reaisComExtenso, somarDias, somarMeses,
} from "@/lib/extenso";
import { BANCOS } from "@/lib/bancos";

export type Bloco =
  | { t: "titulo"; texto: string }
  | { t: "rotulo"; texto: string }          // "IDENTIFICAÇÃO DAS PARTES", "OBJETO:"…
  | { t: "clausula"; texto: string }        // "CLÁUSULA 1ª - DO OBJETO DO CONTRATO"
  | { t: "par"; texto: string }             // parágrafo justificado; **negrito** permitido
  | { t: "item"; texto: string }            // inciso "I - …"
  | { t: "local_data"; texto: string }
  | { t: "assinatura"; papel: string; nome: string }
  | { t: "testemunhas"; lista: { nome?: string | null; cpf?: string | null }[] };

export type Minuta = {
  garantia?: {
    seguradora?: Seguradora | null;
    coberturas?: Cobertura[];
    quitacao_ville?: boolean;
    capitalizacao?: { empresa?: Capitalizadora | null; valor?: number | null; proposta?: string | null; titular_terceiro?: string | null };
    caucao?: { valor?: number | null };
  };
  condicoes?: {
    administrada?: boolean; // false = a Ville só intermedeia; o inquilino paga direto ao locador
    primeiro_aluguel_ville?: boolean;
    multa_rescisoria_alugueis?: number | null;
    isencao_multa_meses?: number | null;
    data_assinatura?: string | null;
    cidade_assinatura?: string | null;
    testemunhas?: { nome?: string | null; cpf?: string | null }[];
  };
  administracao?: { valor_minimo?: number | null; comissao_venda?: number | null };
};

export type DadosContrato = {
  contrato: Record<string, any>;
  imovel: Record<string, any> | null;
  partes: Parte[];
  conta: { titular?: string; cpf_cnpj?: string; banco_ispb?: string; agencia?: string; conta?: string; tipo_conta?: string } | null;
};

const VILLE = "VILLE JARDINS NEGÓCIOS IMOBILIÁRIOS LTDA.";
const VILLE_QUALIF =
  "VILLE JARDINS NEGÓCIOS IMOBILIÁRIOS LTDA. (REMAX Ville), credenciada junto ao CRECI/SP sob número 37.196-J e inscrita no CNPJ sob nº 41.132.782/0001-08";

export const GARANTIA_NOME: Record<string, string> = {
  seguro_fianca: "Seguro Fiança",
  fiador: "Fiança",
  capitalizacao: "Título de Capitalização",
  caucao: "Caução",
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// ---------- flexão ----------
const fem = (p: Parte) => p.tipo_pessoa === "PJ" || p.genero === "F";
const o_a = (p: Parte, m: string, f: string) => (fem(p) ? f : m);

const ESTADO_CIVIL: Record<string, [string, string]> = {
  solteiro: ["solteiro", "solteira"],
  casado: ["casado", "casada"],
  uniao_estavel: ["convivente em união estável", "convivente em união estável"],
  divorciado: ["divorciado", "divorciada"],
  separado: ["separado judicialmente", "separada judicialmente"],
  viuvo: ["viúvo", "viúva"],
};

function regimeTxt(v?: string | null) {
  const r = REGIMES.find((x) => x.v === v)?.t;
  return r ? r.charAt(0).toLowerCase() + r.slice(1) : null;
}

function cpfTxt(v?: string | null) {
  const d = soDigitos(v);
  return d ? fmtCpfCnpj(d) : "____________";
}

// qualificação de uma parte, sem a designação final
export function qualificacao(p: Parte, opts: { comConjuge?: boolean } = {}): string {
  const nome = (p.nome || "____________").toUpperCase();
  if (p.tipo_pessoa === "PJ") {
    const rep = p.representacao?.trim() || "neste ato representada na forma de seu contrato social";
    return [
      `${nome}, sociedade inscrita no CNPJ sob o nº ${cpfTxt(p.cpf_cnpj)}`,
      `com sede na ${p.endereco || "____________"}`,
      rep.replace(/[.;,\s]+$/, ""),
    ].join(", ");
  }
  const ec = p.estado_civil ? ESTADO_CIVIL[p.estado_civil]?.[fem(p) ? 1 : 0] : null;
  const partes: string[] = [nome];
  if (p.nacionalidade) partes.push(p.nacionalidade);
  if (ec) {
    let e = ec;
    if (opts.comConjuge && p.estado_civil && COM_CONJUGE.has(p.estado_civil)) {
      const reg = regimeTxt(p.regime_bens);
      if (reg && p.estado_civil === "casado") e += ` sob o regime da ${reg}`;
    }
    partes.push(e);
  }
  if (p.profissao) partes.push(p.profissao);
  partes.push(`${o_a(p, "inscrito", "inscrita")} no CPF sob o nº ${cpfTxt(p.cpf_cnpj)}`);
  if (p.rg) partes.push(`portador${fem(p) ? "a" : ""} do RG nº ${p.rg}`);
  if (p.email) partes.push(`endereço eletrônico ${p.email}`);
  partes.push(`residente e ${o_a(p, "domiciliado", "domiciliada")} em ${p.endereco || "____________"}`);
  let s = partes.join(", ");
  if (opts.comConjuge && p.estado_civil && COM_CONJUGE.has(p.estado_civil) && p.conjuge?.nome) {
    const c = p.conjuge;
    const cp: string[] = [c.nome!.toUpperCase()];
    if (c.nacionalidade) cp.push(c.nacionalidade);
    if (c.profissao) cp.push(c.profissao);
    if (c.cpf) cp.push(`CPF nº ${cpfTxt(c.cpf)}`);
    if (c.rg) cp.push(`RG nº ${c.rg}`);
    s += `, e seu cônjuge ${cp.join(", ")}, que comparece na qualidade de anuente`;
  }
  return s;
}

// lista de partes de um papel, com a designação no fim
function blocoPartes(lista: Parte[], designacao: string, opts: { comConjuge?: boolean } = {}): string[] {
  if (!lista.length) return [`____________, doravante designado simplesmente ${designacao};`];
  if (lista.length === 1) {
    const p = lista[0];
    return [`${qualificacao(p, opts)}, doravante ${o_a(p, "designado", "designada")} simplesmente ${designacao};`];
  }
  return lista.map((p, i) =>
    i < lista.length - 1
      ? `${qualificacao(p, opts)};`
      : `${qualificacao(p, opts)}; doravante designados, em conjunto, simplesmente ${designacao};`
  );
}

function enderecoImovel(im: Record<string, any> | null): string {
  if (!im) return "____________";
  const partes = [
    [im.rua, im.numero].filter(Boolean).join(", "),
    im.complemento,
    im.bairro,
    [im.cidade, im.estado].filter(Boolean).join(" – "),
  ].filter(Boolean);
  let s = partes.join(", ");
  const cep = soDigitos(im.cep);
  if (cep.length === 8) s += `, ${cep.slice(0, 5)}-${cep.slice(5)}`;
  if (im.nro_contribuinte) s += `, Contribuinte: Nº. ${im.nro_contribuinte}`;
  return s;
}

const ordinal = (n: number) => `${n}ª`;
const paragrafo = (n: number, total: number) => (total === 1 ? "§ ÚNICO." : `§ ${n}º.`);

// numera os parágrafos de uma cláusula: [caput, ...paragrafos]
function comParagrafos(caput: string | null, pars: string[]): Bloco[] {
  const out: Bloco[] = [];
  if (caput) out.push({ t: "par", texto: caput });
  pars.forEach((p, i) => out.push({ t: "par", texto: `${paragrafo(i + 1, pars.length)} ${p}` }));
  return out;
}

export type Pendencia = string;

// "no Banco 341 - ITAÚ – Agência 1234 – Conta corrente 12345-6 em nome de FULANO, CPF …"
function contaTexto(k: DadosContrato["conta"]): string {
  if (!k) return "no Banco xxxx – Agência xxx – Conta corrente xxxxxx em nome de xxxxxxxx";
  const banco = k.banco_ispb ? BANCOS.find((b) => b.ispb === k.banco_ispb) : null;
  const bancoTxt = banco ? `${banco.codigo} - ${banco.nome.toUpperCase()}` : k.banco_ispb ? `ISPB ${k.banco_ispb}` : "xxxx";
  return `no Banco ${bancoTxt} – Agência ${k.agencia || "xxx"} – ${k.tipo_conta === "CONTA_POUPANCA" ? "Conta poupança" : "Conta corrente"} ${k.conta || "xxxxxx"} em nome de ${(k.titular || "").toUpperCase()}${k.cpf_cnpj ? `, ${soDigitos(k.cpf_cnpj).length === 14 ? "CNPJ" : "CPF"} ${fmtCpfCnpj(k.cpf_cnpj)}` : ""}`;
}

// ======================= CONTRATO DE LOCAÇÃO =======================
export function montarLocacao(d: DadosContrato): { blocos: Bloco[]; pendencias: Pendencia[] } {
  const c = d.contrato;
  const m: Minuta = (c.minuta && typeof c.minuta === "object" ? c.minuta : {}) as Minuta;
  const cond = m.condicoes || {};
  const g = m.garantia || {};
  const pend: Pendencia[] = [];
  const administrada = cond.administrada !== false;

  const locadores = d.partes.filter((p) => p.papel === "locador");
  const locatarios = d.partes.filter((p) => p.papel === "locatario");
  const fiadores = d.partes.filter((p) => p.papel === "fiador");
  if (!locadores.length) pend.push("Cadastre o locador em Partes do contrato.");
  if (!locatarios.length) pend.push("Cadastre o locatário em Partes do contrato.");

  const residencial = c.tipo_uso !== "comercial";
  const usoTxt = residencial ? "residencial" : "comercial";
  const aluguel = num(c.valor_primeiro_aluguel) ?? num(c.valor_atual_aluguel);
  if (!aluguel) pend.push("Informe o valor do aluguel.");
  const aluguelTxt = aluguel ? reaisComExtenso(aluguel) : "R$ ____________";
  const prazo = num(c.prazo_meses);
  const indeterminado = !!c.prazo_indeterminado;
  if (!prazo && !indeterminado) pend.push("Informe o prazo em meses.");
  const inicio: string | null = c.data_inicio || null;
  if (!inicio) pend.push("Informe a data de início.");
  const diaVenc = num(c.dia_vencimento) || 5;
  const categoria: string = c.garantia_categoria || "";
  const garantiaNome = GARANTIA_NOME[categoria];
  if (!garantiaNome) pend.push("Escolha a garantia (seguro fiança, fiador, título de capitalização ou caução).");

  const titulo = `CONTRATO DE LOCAÇÃO DE IMÓVEL ${residencial ? "RESIDENCIAL" : "COMERCIAL"}${garantiaNome ? ` — GARANTIA DE ${garantiaNome.toUpperCase()}` : ""}`;
  const B: Bloco[] = [{ t: "titulo", texto: titulo }, { t: "rotulo", texto: "IDENTIFICAÇÃO DAS PARTES CONTRATANTES:" }];
  for (const s of blocoPartes(locadores, "LOCADOR")) B.push({ t: "par", texto: s });
  for (const s of blocoPartes(locatarios, "LOCATÁRIO")) B.push({ t: "par", texto: s });
  if (categoria === "fiador") {
    if (!fiadores.length) pend.push("Garantia por fiador: cadastre o fiador em Partes do contrato.");
    for (const s of blocoPartes(fiadores, fiadores.length > 1 ? "FIADORES" : "FIADOR", { comConjuge: true })) B.push({ t: "par", texto: s });
  }
  const prazoTxt = indeterminado ? "por prazo indeterminado" : `pelo prazo de ${prazo ? numComExtenso(prazo) : "__"} meses`;
  B.push({ t: "par", texto: `Firma-se entre as partes o presente contrato de locação de imóvel ${usoTxt} ${prazoTxt}${garantiaNome ? `, com garantia de ${garantiaNome}` : ""}, conforme as cláusulas a seguir.` });

  // 1 — objeto
  B.push({ t: "clausula", texto: "CLÁUSULA 1ª - DO OBJETO DO CONTRATO" });
  B.push(...comParagrafos(
    `Por meio deste contrato, que firmam entre si o LOCADOR e o LOCATÁRIO, regula-se a locação do imóvel ${usoTxt} localizado à ${enderecoImovel(d.imovel)}.`,
    ["O presente instrumento é acompanhado do Anexo I - Relatório de Vistoria de Entrada, que descreve detalhadamente o imóvel e o seu estado de conservação, no momento de entrega deste ao LOCATÁRIO, o qual as partes aceitam expressamente, cabendo às partes a contestação em até 5 (cinco) dias úteis após a entrega do relatório."],
  ));
  if (!d.imovel?.nro_contribuinte) pend.push("O imóvel está sem número de contribuinte (IPTU).");

  // 2 — destinação
  B.push({ t: "clausula", texto: "CLÁUSULA 2ª - DA DESTINAÇÃO DO IMÓVEL" });
  B.push(...comParagrafos(
    `O imóvel terá a seguinte destinação: O imóvel se destina ao Uso ${residencial ? "Residencial" : "Comercial"}.`,
    ["O imóvel deverá ser utilizado exclusivamente para os fins anteriormente descritos, sob pena de aplicação de multa e de demais penalidades previstas neste contrato e na legislação cabível."],
  ));

  // 3 — sublocação
  B.push({ t: "clausula", texto: "CLÁUSULA 3ª - DA VEDAÇÃO À SUBLOCAÇÃO, À CESSÃO DE LOCAÇÃO E AO EMPRÉSTIMO DO IMÓVEL A TERCEIROS" });
  B.push({ t: "par", texto: "Os direitos de uso regulados neste contrato deverão ser exercidos exclusivamente pelo LOCATÁRIO, sendo vedada sua transferência para terceiros, seja através da cessão de locação, da sublocação ou do empréstimo." });

  // 4 — valor
  const p = inicio ? partesData(inicio) : null;
  const fimPeriodo = inicio ? somarDias(somarMeses(inicio, 1), -1) : null;
  let venc1: string | null = c.data_primeiro_aluguel || null;
  if (!venc1 && fimPeriodo) {
    const f = partesData(fimPeriodo)!;
    // primeiro dia de vencimento depois do fim do período
    let cand = somarMeses(`${f.a}-${String(f.m).padStart(2, "0")}-01`, 0);
    cand = `${cand.slice(0, 8)}${String(Math.min(diaVenc, 28)).padStart(2, "0")}`;
    if (cand <= fimPeriodo) cand = somarMeses(cand, 1);
    venc1 = cand;
  }
  const encargos: string[] = [];
  if (c.iptu_responsavel !== "locador") encargos.push("IPTU");
  if (c.condominio_responsavel !== "locador") encargos.push("condomínio");
  const diaIni = p?.d || 1;
  const diaFim = diaIni === 1 ? null : diaIni - 1;
  const mesLocaticio = diaIni === 1
    ? "o mês civil"
    : `o período compreendido entre o dia ${numComExtenso(diaIni)} de um mês e o dia ${numComExtenso(diaFim!)} do mês seguinte`;
  const pars4: string[] = [];
  if (encargos.length) {
    pars4.push(`Os encargos locatícios de ${encargos.join(" e ")}, com vencimento a partir da entrega das chaves, bem como seus reajustes, e os dias proporcionais do mês de entrega das chaves correrão por conta do LOCATÁRIO;`);
  }
  pars4.push(`O pagamento do aluguel e dos encargos locatícios ordinários deverão ser realizados até o dia ${String(diaVenc).padStart(2, "0")} (${numComExtenso(diaVenc).split(" (")[1]} de cada mês, sendo o aluguel referente ao mês vencido e os encargos referentes ao mês vigente. Considera-se mês de locação ${mesLocaticio}, de modo que o primeiro aluguel, referente ao período de ${fmtData(inicio)} a ${fmtData(fimPeriodo)}, vencerá em ${fmtData(venc1)}.`);
  const intermediacao = cond.primeiro_aluguel_ville !== false;
  if (intermediacao) {
    pars4.push(`A título de honorários pela presente intermediação, devidos pelo LOCADOR nos termos do art. 22, inciso VII, da Lei nº 8.245/1991, a ${VILLE_QUALIF}, fará jus ao valor equivalente ao primeiro aluguel integral, no valor de ${aluguelTxt}. Por determinação do LOCADOR, o primeiro aluguel, com vencimento em ${fmtData(venc1)}, será pago pelo LOCATÁRIO diretamente à ${VILLE}, por meio de transferência bancária para o Banco 033 - SANTANDER - Agência 3630 - Conta Corrente nº. 13007368-2, CNPJ 41.132.782/0001-08, sendo que o comprovante do pagamento deverá ser enviado ao endereço eletrônico ville@remax.com.br. O pagamento assim realizado dará ao LOCATÁRIO plena quitação do primeiro aluguel, não constituindo valor adicional ao aluguel ou encargo de responsabilidade do LOCATÁRIO.`);
  }
  const mesIni = p ? nomeMes(p.m) : "____";
  if (administrada) {
    pars4.push(`Os aluguéis e encargos locatícios serão cobrados mensalmente por meio de boleto único emitido e enviado pela ${VILLE}, administradora da locação, antes de seu vencimento, através de meio eletrônico - e-mail e DDA${encargos.length ? `, à exceção dos valores proporcionais relativos ao ${encargos.join(" e ")} referentes ao mês de ${mesIni}, os quais deverão ser devidamente calculados e reembolsados mediante depósito/transferência diretamente na conta bancária de titularidade do LOCADOR, anteriormente à entrega das chaves do imóvel` : ""}.`);
  } else {
    if (!d.conta) pend.push("Locação não administrada: informe a conta do locador para o pagamento do aluguel (seção Conta do locador).");
    pars4.push(`Os aluguéis${encargos.length ? " e encargos locatícios" : ""} serão pagos pelo LOCATÁRIO diretamente ao LOCADOR, até a data de cada vencimento, mediante depósito ou transferência bancária para a conta de titularidade do LOCADOR ${contaTexto(d.conta)}, servindo o comprovante de depósito ou transferência como recibo de pagamento.`);
  }
  const multa = num(c.multa_percentual) ?? 10;
  const mora = num(c.mora_percentual) ?? 1;
  pars4.push(`Em caso de mora no pagamento do aluguel, será aplicada multa de ${percentualComExtenso(multa)} sobre o valor devido, bem como juros mensais de ${percentualComExtenso(mora)}, ficando também sujeito a correção monetária, apurada conforme variação do IGP-M no período; e ainda, a pagamento de honorários de advogado que, porventura, o LOCADOR venha a constituir para defesa de seus direitos, mesmo que a respectiva cobrança se processe extrajudicialmente. Além dos honorários mencionados, o LOCATÁRIO arcará com as custas e despesas judiciais e extrajudiciais.`);
  const periodo = num(c.periodo_reajuste_meses) || 12;
  const indice = String(c.indice_reajuste || "IPCA").replace(/^IGPM$/, "IGP-M");
  pars4.push(`O aluguel será reajustado ${periodo === 12 ? "anualmente" : `a cada ${numComExtenso(periodo)} meses`}, sucessiva e cumulativamente, pelos índices de variação mensal acumulado do ${indice}, ou qualquer outro que venha a sucedê-lo, a ser aplicado a qualquer época da vigência ou prorrogação deste contrato. E, na hipótese de a variação do período apresentar índice negativo, o reajuste não será aplicado.`);
  pars4.push(
    "Correm a cargo do LOCATÁRIO as despesas de luz, gás, água e esgoto referentes ao imóvel alugado, e demais encargos que incidam ou venham a incidir sobre o imóvel locado, bem como multa, juros e correção provocados pelo atraso dos mesmos. Os encargos acima serão pagos diretamente pelo LOCATÁRIO, devendo apresentar os comprovantes de pagamento ao LOCADOR, sempre que solicitados.",
    "O LOCATÁRIO, em até 30 dias, deverá transferir ou pedir ligação da energia elétrica, gás e água, arcando com eventuais despesas decorrentes a partir da data de entrada no imóvel/entrega das chaves.",
    `O LOCATÁRIO deverá realizar, igualmente, o pagamento de todos os tributos e taxas referentes ao imóvel alugado (${[c.iptu_responsavel !== "locador" ? "IPTU" : null, "taxa de lixo", c.condominio_responsavel !== "locador" ? "taxas ordinárias de condomínio" : null].filter(Boolean).join(", ")}), assim como eventual prêmio de seguro complementar contra fogo.`,
    "O LOCATÁRIO, em até 10 (dez) dias, deverá contratar seguro contra incêndio e outros danos, tais como vendaval, danos elétricos e perda de aluguel, salientando que o mesmo terá como base o valor venal do imóvel. Tal contrato deverá contar com a vênia do LOCADOR e ter vigência enquanto perdurar a locação, devendo ser renovado anualmente, possuindo como beneficiário o LOCADOR no que concerne ao imóvel e seus acessórios e ao próprio LOCATÁRIO quanto aos bens de sua propriedade. O LOCATÁRIO deverá apresentar ao LOCADOR cópia da apólice contratada em até 5 (cinco) dias após sua emissão, bem como, a cada 12 (doze) meses, o comprovante de sua renovação.",
    "O LOCATÁRIO será responsável pela segurança da edificação locada a partir da data do recebimento das chaves, obrigando-se a indenizar o LOCADOR em caso de danos quando não tenha efetivado a contratação do seguro, assim como responsável por quaisquer multas às quais tenha dado causa, por desobediência às normas de civilidade e vizinhança vigentes na comarca do imóvel ou na convenção do condomínio.",
  );
  B.push({ t: "clausula", texto: "CLÁUSULA 4ª - DO VALOR DO ALUGUEL, DESPESAS E TRIBUTOS" });
  B.push(...comParagrafos(`A título de aluguel, o LOCATÁRIO se obriga a pagar a quantia de ${aluguelTxt};`, pars4));

  // 5 — prazo
  const termino = inicio && prazo ? somarDias(somarMeses(inicio, prazo), -1) : null;
  B.push({ t: "clausula", texto: "CLÁUSULA 5ª - DO PRAZO DO ALUGUEL" });
  B.push(...comParagrafos(
    indeterminado
      ? `O prazo de locação do referido imóvel é indeterminado, com início em ${fmtData(inicio)}, obrigando-se o LOCATÁRIO, ao término da locação, a restituir o imóvel completamente desocupado, em perfeito estado de conservação, excetuado aqueles que decorram do desgaste natural e compatíveis com uso avençado, limpeza e pleno funcionamento de seus pertences e acessórios, tal qual recebem neste ato.`
      : `O prazo de locação do referido imóvel é de ${prazo ? numComExtenso(prazo) : "__"} meses, com início em ${fmtData(inicio)} e término em ${fmtData(termino)}, data em que o LOCATÁRIO se obriga a restituir o imóvel completamente desocupado independente de qualquer notificação judicial ou extrajudicial, em perfeito estado de conservação, excetuado aqueles que decorram do desgaste natural e compatíveis com uso avençado, limpeza e pleno funcionamento de seus pertences e acessórios, tal qual recebem neste ato.`,
    [
      "A entrega das chaves pelo LOCATÁRIO deverá ser precedida de vistoria a fim de constar a necessidade de eventuais reparos, sendo de responsabilidade do LOCATÁRIO a realização dos mesmos. Enquanto perdurar a realização dos reparos necessários, os aluguéis e encargos que se vencerem no período correrão por conta do LOCATÁRIO, e deixarão de ser devidos somente quando finalizados os referidos reparos e efetivamente entregues as chaves, mediante termo próprio.",
      "Caso seja do interesse de ambas as partes, a locação poderá ser renovada ao término da presente, via elaboração de novo contrato de locação, com novas condições e valores.",
    ],
  ));

  // 6 — garantia
  B.push({ t: "clausula", texto: "CLÁUSULA 6ª - DA GARANTIA" });
  const locatariosPF = locatarios.filter((x) => x.tipo_pessoa === "PF").length;
  const locPlural = locatarios.length > 1;
  let gar: string[] = [];
  if (categoria === "seguro_fianca") {
    const s = g.seguradora as Seguradora | undefined;
    if (!s) {
      pend.push("Seguro fiança: escolha a seguradora.");
      gar = ["[ESCOLHA A SEGURADORA NO CADASTRO DO CONTRATO]"];
    } else if (s === "too" && !administrada) {
      // a Too só é usada nas locações administradas pela Ville
      pend.push("Seguro fiança Too só vale para locação administrada pela Ville: escolha outra seguradora.");
      gar = ["[SEGURO TOO SÓ PARA LOCAÇÃO ADMINISTRADA PELA VILLE: ESCOLHA OUTRA SEGURADORA]"];
    } else {
      gar = clausulaSeguro({ seguradora: s, coberturas: g.coberturas || [], locatariosPF, quitacaoVille: administrada && g.quitacao_ville !== false });
    }
  } else if (categoria === "capitalizacao") {
    const k = g.capitalizacao || {};
    if (!k.empresa) pend.push("Título de capitalização: escolha a empresa.");
    if (!num(k.valor)) pend.push("Título de capitalização: informe o valor.");
    if (!k.proposta) pend.push("Título de capitalização: informe o número da proposta.");
    const v = num(k.valor);
    gar = clausulaCapitalizacao({
      empresa: (k.empresa || "porto") as Capitalizadora,
      valor: v ? reaisComExtenso(v).replace(/^R\$ /, "") : "",
      proposta: k.proposta || "",
      titularTerceiro: k.titular_terceiro || null,
    });
  } else if (categoria === "caucao") {
    const v = num(g.caucao?.valor);
    if (!v) pend.push("Caução: informe o valor.");
    if (v && aluguel && v > aluguel * 3 + 0.01) pend.push("Caução acima de 3 aluguéis: a Lei 8.245/91 (art. 38, § 2º) limita a caução em dinheiro a 3 meses de aluguel.");
    gar = clausulaCaucao({ valor: v ? reaisComExtenso(v).replace(/^R\$ /, "") : "", locatarioPlural: locPlural });
  } else if (categoria === "fiador") {
    const ims = fiadores.flatMap((f) => f.imoveis || []);
    const vistos = new Set<string>();
    const unicos = ims.filter((i) => {
      const k = soDigitos(i.matricula) || i.descricao || "";
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    if (!unicos.length) pend.push("Fiador: envie a matrícula do imóvel dado em garantia.");
    gar = clausulaFiador({ plural: fiadores.length > 1, locatarioPlural: locPlural, imoveis: unicos });
  } else {
    gar = ["[GARANTIA NÃO DEFINIDA]"];
  }
  for (const t of gar) B.push({ t: "par", texto: t });
  if (categoria === "seguro_fianca" && (g.coberturas || []).some((x) => ["danos_imovel", "pintura_interna", "pintura_externa", "danos_moveis"].includes(x))) {
    pend.push("Coberturas de danos/pintura: o laudo de vistoria inicial precisa ser assinado por locador e locatário.");
  }

  // 7 a 10 — fixas
  B.push({ t: "clausula", texto: "CLÁUSULA 7ª - DOS DEVERES DO LOCADOR" });
  B.push({ t: "par", texto: "São deveres do LOCADOR:" });
  [
    "I - Entregar ao LOCATÁRIO o imóvel alugado em estado de servir ao uso a que se destina;",
    "II - Garantir, durante o tempo da locação, o uso pacífico do imóvel locado;",
    "III - Manter, durante a locação, a forma e o destino do imóvel;",
    "IV - Responder pelos vícios ou defeitos anteriores à locação;",
    "V - Pagar as taxas de administração imobiliária, se houver, e de intermediações, nestas compreendidas as despesas necessárias à aferição da idoneidade do LOCATÁRIO e/ou do FIADOR;",
    "VI - Exibir ao LOCATÁRIO, quando solicitado, os comprovantes relativos às parcelas que estejam sendo exigidas;",
  ].forEach((t) => B.push({ t: "item", texto: t }));
  B.push({ t: "clausula", texto: "CLÁUSULA 8ª - DOS DEVERES DO LOCATÁRIO" });
  B.push({ t: "par", texto: "São deveres do LOCATÁRIO:" });
  [
    `I - Pagar pontualmente o aluguel e os encargos da locação (${[...encargos, "seguro incêndio"].join(", ")}), no prazo estipulado, sob pena de ser constituído em mora, independente de interpelação ou notificação judicial ou extrajudicial;`,
    "II - Servir-se do imóvel para o uso convencionado ou presumido, compatível com a natureza deste e com o fim a que se destina, devendo tratá-lo com o mesmo cuidado como se seu fosse e trazendo-o sempre conservado, excetuados os desgastes comuns causados pelo tempo, no que diz respeito a pintura, azulejos, vidros, portas, janelas, travas e fechaduras, elétrica e hidráulica, tudo em boas condições de uso e higiene;",
    "III - Restituir o imóvel, finda a locação, inteiramente desocupado e no estado em que o recebeu, conforme o Anexo I - Relatório de Vistoria de Entrada, com as adaptações;",
    "IV - Levar imediatamente ao conhecimento do LOCADOR o surgimento de qualquer dano ou defeito estrutural cuja reparação incumba ao LOCADOR, bem como as eventuais turbações de terceiros;",
    "V - Realizar a imediata reparação dos danos verificados no imóvel ou nas suas instalações, provocadas por si, seus dependentes, familiares, visitantes ou prepostos;",
    "VI - Não modificar a estrutura interna ou externa do imóvel sem o consentimento prévio e por escrito do LOCADOR;",
    "VII - Entregar imediatamente ao LOCADOR os documentos de cobrança de tributos e encargos condominiais, bem como qualquer intimação, multa ou exigência de autoridade pública, ainda que dirigidas ao LOCATÁRIO, sob pena de ficar responsável por eventuais encargos moratórios em caso de atraso na comunicação;",
    "VIII - Permitir a vistoria do imóvel pelo LOCADOR ou por seu mandatário, mediante combinação prévia de dia e hora, bem como admitir que seja o mesmo visitado e examinado por terceiros, no caso de venda, promessa de venda, cessão ou promessa de cessão de direitos ou dação em pagamento;",
  ].forEach((t) => B.push({ t: "item", texto: t }));
  B.push({ t: "clausula", texto: "CLÁUSULA 9ª - DAS BENFEITORIAS" });
  B.push(...comParagrafos(
    "Toda e qualquer benfeitoria, sejam elas necessárias, úteis, voluptuárias e acessões, somente poderão ser introduzidas no imóvel com prévia autorização por escrito do LOCADOR;",
    [
      "As benfeitorias necessárias em função de vícios no imóvel serão de responsabilidade do LOCADOR, conforme disposto no item IV da CLÁUSULA 7ª.",
      "Qualquer benfeitoria não autorizada por escrito pelo LOCADOR não dará ao LOCATÁRIO direito à indenização ou retenção, ficando estas incorporadas ao imóvel, nada podendo exigir ou reclamar.",
      "Todas as despesas oriundas das benfeitorias, como alvarás, INSS, ISS etc. deverão ser custeadas pelo LOCATÁRIO, com exceção das despesas relativas às benfeitorias necessárias, que deverão ser custeadas pelo LOCADOR.",
      "Todavia, fica acordado entre as partes que qualquer benfeitoria ou modificação realizada sem expressa autorização do LOCADOR ou seu procurador será considerada de má-fé, sendo obrigação do LOCATÁRIO recompor o imóvel ao estado anterior.",
    ],
  ));
  B.push({ t: "clausula", texto: "CLÁUSULA 10ª - DO DIREITO DE PREFERÊNCIA" });
  B.push(...comParagrafos(
    "No caso de venda, promessa de venda, cessão ou promessa de cessão de direitos ou dação em pagamento, o LOCATÁRIO tem preferência para adquirir o imóvel locado, em igualdade de condições com terceiros, devendo o LOCADOR dar-lhe conhecimento do negócio mediante notificação judicial, extrajudicial ou outro meio de ciência inequívoca.",
    [
      "A comunicação deverá conter todas as condições do negócio e, em especial, o preço, a forma de pagamento, a existência de ônus reais, bem como o local e horário em que pode ser examinada a documentação pertinente.",
      "Após sua notificação, o LOCATÁRIO terá 30 (trinta) dias para manifestar-se, de maneira inequívoca, sobre a sua aceitação à proposta.",
      "O direito de preferência não alcança os casos de perda da propriedade ou venda por: decisão judicial; quaisquer formas de realização de garantia, inclusive mediante leilão extrajudicial; permuta; doação; integralização de capital; cisão; fusão; incorporação e constituição da propriedade fiduciária.",
    ],
  ));

  // 11 — rescisão
  const nMulta = num(cond.multa_rescisoria_alugueis) || 3;
  const isencao = cond.isencao_multa_meses === 0 ? 0 : num(cond.isencao_multa_meses) ?? 12;
  B.push({ t: "clausula", texto: "CLÁUSULA 11ª - DA RESCISÃO" });
  B.push(...comParagrafos(
    `Em caso de rescisão antecipada, a parte que der causa à rescisão deverá pagar à outra parte multa correspondente a ${numComExtenso(nMulta, true)} ${nMulta === 1 ? "vez" : "vezes"} o valor do último aluguel atualizado, abatida proporcionalmente conforme o tempo restante de cumprimento de contrato, sem prejuízo de indenização por eventuais perdas e danos.${isencao ? ` As partes acordam que após ${numComExtenso(isencao)} meses de contrato não haverá cobrança de multa por rescisão antecipada, sendo, no entanto, necessário aviso prévio de no mínimo 30 (trinta) dias.` : ""}`,
    [
      "Em caso de prorrogação do contrato por tempo indeterminado, as partes poderão denunciar por escrito o contrato, desde que com aviso prévio de, no mínimo, 30 (trinta) dias.",
      "Em caso de desapropriação total ou parcial do imóvel locado ou de sinistro que o torne inabitável, o presente instrumento ficará rescindido de pleno direito, independente de quaisquer indenizações das partes.",
      "Em caso de falecimento do LOCADOR, a locação transmite-se a seus herdeiros ou sucessores a qualquer título.",
      "Com a morte do LOCATÁRIO, ficam sub-rogados nos direitos e nos deveres expressos neste contrato sucessivamente o cônjuge sobrevivente ou o companheiro, os herdeiros necessários e as pessoas que viviam em sua dependência econômica, se residentes no imóvel alugado.",
    ],
  ));

  // 12 a 15 — fixas
  B.push({ t: "clausula", texto: "CLÁUSULA 12ª - DA VISTORIA E RESTITUIÇÃO DAS CHAVES" });
  B.push(...comParagrafos(
    "Obriga-se o LOCATÁRIO a comunicar por escrito com 30 (trinta) dias de antecedência que irá restituir as chaves do imóvel.",
    [
      "O LOCATÁRIO desde já autoriza o LOCADOR ou representante devidamente habilitado por escrito a vistoriar o imóvel ora locado quando entenderem conveniente, dentro do horário comercial e mediante comunicação com antecedência de 48 (quarenta e oito) horas.",
      "Caso seja constatado qualquer dano no imóvel ocasionado pelo LOCATÁRIO, obriga-se no prazo máximo de 15 (quinze) dias promover às suas custas os reparos necessários, a partir da comunicação formalmente realizada.",
      "Ultrapassado o prazo indicado e não sendo reparados os danos apurados pelo LOCATÁRIO, o LOCADOR obterá orçamentos de empresas especializadas para a realização dos reparos, que serão encaminhados para o LOCATÁRIO, que terá o prazo de 48 horas para a sua aprovação. Caso não haja nenhuma manifestação, fica desde já autorizado o LOCADOR a contratar a empresa ou prestador de serviço observando-se o preço médio obtido pelos orçamentos. Além dos valores suportados para os reparos, o LOCATÁRIO aceita e concorda expressamente a pagar a importância correspondente a 15% (quinze por cento) sobre os gastos, a título de administração das obras, montante este que deverá ser ressarcido integralmente ao LOCADOR, no prazo de 30 (trinta) dias a contar da comunicação dos respectivos desembolsos.",
      "A restituição das chaves ao LOCADOR somente será aceita após realização da vistoria de saída. Caso haja necessidade de execução de obras, somente após terminadas é que as chaves serão aceitas pelo LOCADOR, obrigando-se o LOCATÁRIO, neste caso, pelo pagamento dos aluguéis e encargos devidos como se o imóvel ainda estivesse ocupado.",
      "Na hipótese da devolução se proceder de forma diversa do aqui pactuado, fica o LOCADOR autorizado a executar as obras e reparos que se fizerem necessários, cobrando o custo executivamente do LOCATÁRIO mediante recibo de execução de tais obras ou reparos, nos termos do parágrafo 3º acima.",
    ],
  ));
  B.push({ t: "clausula", texto: "CLÁUSULA 13ª - DAS PENALIDADES" });
  B.push(...comParagrafos(
    "Salvo nos casos em que haja penalidade contratual específica prevista, a violação das cláusulas deste instrumento enseja a aplicação de multa correspondente a 3 (três) vezes o valor do último aluguel atualizado, sem prejuízo de demais cominações legais cabíveis.",
    [
      "Além das multas contratuais, será devida indenização suplementar pelas perdas, danos, lucros cessantes, danos indiretos e quaisquer outros prejuízos patrimoniais ou morais percebidos pela parte contrária. Em nenhuma hipótese o pagamento da multa aqui estipulada eximirá o LOCATÁRIO do pagamento dos aluguéis e encargos devidos, e de eventuais estragos e danos ocasionados no imóvel, que não decorrentes do desgaste natural do tempo e ainda não exonera a parte infratora das demais obrigações aqui pactuadas.",
      "As infrações ao presente contrato ensejam, ainda, a rescisão de pleno direito pela parte prejudicada, independente de notificação ou aviso prévio.",
      "A mera tolerância de uma das partes em relação ao descumprimento das cláusulas contidas neste instrumento não importa em renúncia, perdão, novação ou alteração da norma infringida.",
    ],
  ));
  B.push({ t: "clausula", texto: "CLÁUSULA 14ª - ADITAMENTO" });
  B.push(...comParagrafos(
    "Todo e qualquer acordo e/ou alteração contratual deverá ser tratada pelo LOCATÁRIO prévia e diretamente com o LOCADOR e deverá ser obrigatoriamente formalizado por escrito por meio de INSTRUMENTO PARTICULAR DE ADITAMENTO CONTRATUAL.",
    [
      administrada
        ? "Ressalvada a atuação da VILLE JARDINS NEGÓCIOS IMOBILIÁRIOS LTDA. como administradora desta locação, nos termos da CLÁUSULA 16ª, terceiras pessoas em geral, tais como outras imobiliárias, corretores de imóveis, administradoras e administradores, não estão autorizados e não têm poderes e não têm legitimidade para fazerem acordos com os locatários em nome dos locadores. A atuação da administradora não dispensa a assinatura do LOCADOR no instrumento de aditamento previsto no caput."
        : "Terceiras pessoas em geral, tais como imobiliárias, corretores de imóveis, administradoras e administradores, não estão autorizados e não têm poderes e não têm legitimidade para fazerem acordos com os locatários em nome dos locadores.",
      "Serão considerados inválidos, para fins de aditamento contratual, toda e qualquer comunicação e alteração contratual formulada de forma verbal e escrita via mensagem por WhatsApp, SMS, por e-mail, correspondências eletrônicas e fac-símile (fax) e qualquer outro meio de comunicação, mesmo diretamente com o LOCADOR ou com terceiros mandatários e administradoras e imobiliárias.",
    ],
  ));
  B.push({ t: "clausula", texto: "CLÁUSULA 15ª - DAS DISPOSIÇÕES FINAIS" });
  B.push(...comParagrafos(null, [
    "Nenhuma exigência dos Poderes Públicos será causa para a rescisão deste contrato, salvo vistoria judicial que prove estar a construção ameaçada de ruir.",
    "No caso de desapropriação do imóvel locado, total ou parcialmente, ficam as partes desobrigadas das cláusulas contratuais, reservada a cada uma a faculdade de agir contra o Poder desapropriante.",
    "O LOCATÁRIO desde já autoriza o LOCADOR a retomar a posse do imóvel na eventualidade de falência ou abandono do mesmo pelo LOCATÁRIO, independentemente de qualquer formalidade judicial.",
    "Este contrato obriga as partes contratantes, seus herdeiros e/ou sucessores.",
    "Durante toda a vigência deste contrato de locação, além das obrigações expressamente pactuadas pelas partes neste contrato de locação, o LOCATÁRIO é obrigado a cumprir o disposto no Art. 23 da Lei 8.245/1991, sob pena de rescisão contratual.",
    "Sob pena de caracterizar infração e rescisão contratual, fica o LOCATÁRIO obrigado a manter a garantia deste contrato pelo período que perdurar a locação, até a efetiva desocupação do imóvel e entrega das chaves.",
    "Não se considerará novação, no sentido legal da expressão, a tolerância com que o LOCADOR suportará os atrasos do LOCATÁRIO no cumprimento de suas obrigações contratuais.",
    "As partes assumem a responsabilidade pelas informações prestadas e legitimidade das assinaturas, declarando ter lido e discutido todos os termos e as cláusulas deste contrato, com as quais estão de pleno acordo, não podendo alegar desconhecimento.",
  ]));

  // 16 — administração (só quando a Ville administra)
  if (administrada) {
    B.push({ t: "clausula", texto: "CLÁUSULA 16ª - DA ADMINISTRAÇÃO DA LOCAÇÃO" });
    B.push(...comParagrafos(
      "A presente locação é administrada pela VILLE JARDINS NEGÓCIOS IMOBILIÁRIOS LTDA. (REMAX Ville), inscrita no CNPJ sob nº 41.132.782/0001-08 e no CRECI/SP sob nº 37.196-J, com sede na Rua Batataes, 148, Jardim Paulista, São Paulo – SP, por contratação do LOCADOR.",
      [
        "Os aluguéis e encargos locatícios serão pagos pelo LOCATÁRIO à administradora, na forma da CLÁUSULA 4ª, e os pagamentos assim realizados terão plena eficácia liberatória perante o LOCADOR.",
        "A administradora fica autorizada a representar o LOCADOR na cobrança dos aluguéis e encargos, no envio e recebimento de notificações e comunicações, na realização das vistorias de entrada, periódicas e de saída, no recebimento das chaves e nos demais atos de administração da locação, servindo o endereço eletrônico ville@remax.com.br para as comunicações do LOCATÁRIO.",
      ],
    ));
  }

  // 17 (ou 16) — foro
  B.push({ t: "clausula", texto: `CLÁUSULA ${administrada ? "17ª" : "16ª"} - DO FORO` });
  B.push({ t: "par", texto: "Os eventuais litígios que surjam do presente contrato serão apresentados e julgados no foro competente da comarca em que está localizado o imóvel alugado. Por estarem de justo acordo, as partes assinam o presente contrato, com acompanhamento de 02 (duas) testemunhas." });

  // assinaturas
  B.push({ t: "local_data", texto: `${cond.cidade_assinatura || "São Paulo"}, ${dataPorExtenso(cond.data_assinatura || hoje())}` });
  for (const x of locadores) B.push({ t: "assinatura", papel: "LOCADOR", nome: x.nome.toUpperCase() });
  for (const x of locatarios) B.push({ t: "assinatura", papel: "LOCATÁRIO", nome: x.nome.toUpperCase() });
  if (categoria === "fiador") {
    for (const f of fiadores) {
      B.push({ t: "assinatura", papel: "FIADOR", nome: f.nome.toUpperCase() });
      if (f.estado_civil && COM_CONJUGE.has(f.estado_civil) && f.conjuge?.nome) {
        B.push({ t: "assinatura", papel: "CÔNJUGE ANUENTE", nome: f.conjuge.nome.toUpperCase() });
      }
      if (f.estado_civil && COM_CONJUGE.has(f.estado_civil) && !f.conjuge?.nome && f.tipo_pessoa === "PF") {
        pend.push(`Fiador ${f.nome}: casado(a) — informe o cônjuge, que assina dando a outorga.`);
      }
    }
  }
  B.push({ t: "testemunhas", lista: cond.testemunhas || [] });

  // qualificação incompleta
  for (const x of d.partes) {
    if (x.papel === "fiador" && categoria !== "fiador") continue;
    const falta: string[] = [];
    if (!soDigitos(x.cpf_cnpj)) falta.push(x.tipo_pessoa === "PJ" ? "CNPJ" : "CPF");
    if (!x.endereco) falta.push(x.tipo_pessoa === "PJ" ? "sede" : "endereço");
    if (x.tipo_pessoa === "PF" && !x.rg) falta.push("RG");
    if (x.tipo_pessoa === "PF" && !x.estado_civil) falta.push("estado civil");
    if (x.tipo_pessoa === "PF" && !x.profissao) falta.push("profissão");
    if (falta.length) pend.push(`${x.nome}: falta ${falta.join(", ")}.`);
  }

  return { blocos: B, pendencias: pend };
}

// ======================= CONTRATO DE ADMINISTRAÇÃO =======================
export function montarAdministracao(d: DadosContrato): { blocos: Bloco[]; pendencias: Pendencia[] } {
  const c = d.contrato;
  const m: Minuta = (c.minuta && typeof c.minuta === "object" ? c.minuta : {}) as Minuta;
  const cond = m.condicoes || {};
  const adm = m.administracao || {};
  const pend: Pendencia[] = [];
  if (cond.administrada === false) pend.push("Locação não administrada: não há contrato de administração.");
  const locadores = d.partes.filter((p) => p.papel === "locador");
  if (!locadores.length) pend.push("Cadastre o locador em Partes do contrato.");

  const residencial = c.tipo_uso !== "comercial";
  const aluguel = num(c.valor_primeiro_aluguel) ?? num(c.valor_atual_aluguel);
  const minimo = num(adm.valor_minimo) ?? aluguel;
  if (!minimo) pend.push("Informe o valor mínimo do aluguel.");
  const prazo = num(c.prazo_meses) || 30;
  const indice = String(c.indice_reajuste || "IPCA").replace(/^IGPM$/, "IGP-M");
  const taxa = num(c.taxa_administracao);
  if (!taxa) pend.push("Informe a taxa de administração.");
  const venda = num(adm.comissao_venda) ?? 6;
  const tipoImovel = String(d.imovel?.tipo_imovel || "Imóvel").trim();

  const B: Bloco[] = [{ t: "titulo", texto: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ADMINISTRAÇÃO DE LOCAÇÃO" }];
  B.push({ t: "rotulo", texto: locadores.length > 1 ? "CONTRATANTES:" : "CONTRATANTE:" });
  if (!locadores.length) B.push({ t: "par", texto: "____________" });
  for (const p of locadores) B.push({ t: "par", texto: `${qualificacao(p)}.` });
  B.push({ t: "rotulo", texto: "CONTRATADO:" });
  B.push({ t: "par", texto: "VILLE JARDINS NEGOCIOS IMOBILIARIOS LTDA, inscrita no CRECI da 2a. Região sob nº 037.196-J e no CNPJ sob nº 41.132.782/0001-08, estabelecido na rua Batataes nº 148, na cidade de São Paulo, SP." });
  B.push({ t: "rotulo", texto: "OBJETO:" });
  B.push({ t: "par", texto: `${tipoImovel.charAt(0).toUpperCase() + tipoImovel.slice(1)} ${residencial ? "Residencial" : "Comercial"} localizado à ${enderecoImovel(d.imovel)}.` });
  B.push({ t: "par", texto: "Por este particular instrumento, as partes supramencionadas resolvem, de comum acordo e de livre e espontânea vontade, firmar o presente Contrato de Prestação de Serviços, cujo objeto se encontra declinado no preâmbulo e a reger-se pelas seguintes cláusulas e condições." });

  const C = (n: string, ...pars: string[]) => {
    B.push({ t: "clausula", texto: `${n}:` });
    pars.forEach((p) => B.push({ t: "par", texto: p }));
  };
  C("PRIMEIRA", `O CONTRATANTE é legítimo senhor e possuidor do imóvel sito no endereço do preâmbulo, que se encontra atualmente livre e desocupado de pessoas e coisas, tendo interesse em alugá-lo para fins ${residencial ? "residenciais" : "comerciais"}, pelo valor mensal mínimo de ${minimo ? reaisComExtenso(minimo) : "R$ ____________"}, razão pela qual pretende se utilizar dos serviços do CONTRATADO para promover a seleção dos pretendentes à sua locação e sua subsequente administração.`);
  C("SEGUNDA",
    "Para essa finalidade, se compromete o CONTRATADO a efetuar completo levantamento das informações cadastrais dos eventuais pretendentes, de modo a poder selecionar dentre estes, aquele que vier a ser considerado como o mais indicado.",
    "§ ÚNICO: A indicação do pretendente pelo CONTRATADO não obriga o CONTRATANTE, que poderá a seu exclusivo critério, recusá-lo e indicar outro, desde que mediante expressa autorização e sob sua inteira responsabilidade.");
  C("TERCEIRA", `Selecionado o pretendente e obtida a garantia locatícia, com aprovação do CONTRATANTE, compromete-se o CONTRATADO a elaborar e celebrar o respectivo contrato, nele estabelecido o prazo de vigência da locação, desde já estabelecido pelo mínimo de ${prazo} meses, com a menção de que caberá ao inquilino o pagamento de todos os encargos, inclusive o prêmio de seguro-incêndio, desde já estabelecida cobertura mínima pelo valor venal de referência do imóvel e reajuste anual do aluguel pelos índices do (${indice}).`);
  if (!d.conta) pend.push("Cadastre a conta de repasse do locador (seção Conta de repasse).");
  const contaTxt = contaTexto(d.conta);
  C("QUARTA",
    `Pela intermediação da locação será devido ao CONTRATADO o valor equivalente ao primeiro aluguel integral do imóvel e pela administração da locação, será devido ao CONTRATADO o percentual de ${taxa ? percentualComExtenso(taxa) : "__% (__ por cento)"} sobre o valor de cada aluguel mensal.`,
    `§ PRIMEIRO: O aluguel será cobrado do inquilino e depositados na conta do CONTRATANTE, uma vez deduzida a remuneração estabelecida no “caput”, até o segundo dia útil subsequente ao do seu efetivo recebimento ${contaTxt}.`,
    "§ SEGUNDO: Os valores de IPTU e condomínio poderão ser incluídos discriminados no boleto de cobrança, podendo ser repassados juntamente com o aluguel ou pagos diretamente pela CONTRATADA a critério do CONTRATANTE.");
  C("QUINTA", "Caso a Imobiliária pague qualquer inadimplemento do inquilino, opera-se a cessão parcial dos Direitos do Locador em relação ao pagamento efetuado, inclusive de eventuais multas penais ou moratórias devidas pelo inquilino. Nesses casos, o Locador autoriza a Imobiliária a ceder sua posição contratual ou qualquer de seus direitos e/ou obrigações decorrentes deste Contrato.");
  B.push({ t: "clausula", texto: "SEXTA:" });
  B.push({ t: "par", texto: "Além do já estabelecido nas cláusulas anteriores, obriga-se o CONTRATADO:" });
  [
    "Verificar o estado do imóvel, antes e após o término da locação, lavrando para isso os necessários termos de vistoria;",
    "Divulgar, pelos meios usuais e a seu critério, a oferta da locação;",
    "Cobrar os alugueres e respectivos encargos de IPTU e Condomínio nas épocas convencionadas, deles deduzindo os honorários devidos;",
    "Providenciar nos reparos que se fizerem necessários para a conservação do imóvel na vigência da locação, mediante expressa autorização do CONTRATANTE e à vista de orçamentos elaborados por profissionais competentes;",
    "Notificar e cobrar eventuais inadimplementos do inquilino e prestar todo auxílio caso seja necessário ingressar com ação de cobrança e despejo;",
  ].forEach((t) => B.push({ t: "item", texto: t }));
  B.push({ t: "clausula", texto: "SÉTIMA:" });
  B.push({ t: "par", texto: "Em contrapartida se obriga o CONTRATANTE durante a vigência deste contrato:" });
  [
    "Não interferir na relação jurídica existente entre o CONTRATADO e o inquilino e/ou fiadores, sem prévia ciência do CONTRATADO;",
    "Não receber, sob qualquer hipótese, diretamente do inquilino e/ou fiador, valores referentes à locação ou as chaves do imóvel;",
    "Informar ao CONTRATADO, quando da decisão de comercialização do imóvel todos os valores e condições, para que o CONTRATADO providencie a notificação do direito de preferência ao inquilino.",
  ].forEach((t) => B.push({ t: "item", texto: t }));
  C("OITAVA", "O CONTRATADO fica isento de qualquer responsabilidade por fatos alheios à administração da locação, como arrombamentos, ocupação indevida, cessão irregular da locação e eventuais danos a ele causados em razão desses fatos.");
  C("NONA", "O presente instrumento terá o mesmo prazo de vigência do contrato de locação, sendo reservado ao CONTRATADO o direito de rescindir o presente contrato, sem motivo justificado, desde que mediante expresso aviso com antecedência mínima de trinta dias, uma vez prestadas as contas devidas na sua vigência e entregue ao CONTRATANTE toda a documentação em seu poder.");
  C("DÉCIMA", "Ao CONTRATANTE, por sua vez, caberá o mesmo direito, após ressarcimento de eventuais despesas pendentes ou antecipações efetuadas. Uma vez comprovada a falta de cumprimento de qualquer obrigação por parte do CONTRATADO, o presente instrumento poderá ser rescindido pelo CONTRATANTE sem aviso-prévio.");
  C("DÉCIMA PRIMEIRA", `Caso o imóvel objeto deste contrato venha a ser vendido, prometido à venda, permutado ou ter seus direitos cedidos ao inquilino, ao seu cônjuge ou companheiro, a seus ascendentes ou descendentes, ou a pessoa jurídica da qual qualquer deles seja sócio, durante a vigência da locação ou de suas prorrogações, ou em até 12 (doze) meses após o seu término, será devida ao CONTRATADO, pela intermediação, remuneração de ${percentualComExtenso(venda)} sobre o valor total da transação, a ser paga pelo CONTRATANTE na data da assinatura do primeiro instrumento que formalizar o negócio, independentemente de o CONTRATADO ter participado das tratativas e ainda que o presente contrato tenha sido rescindido.`);
  C("DÉCIMA SEGUNDA",
    "Fica eleito o Foro da Comarca de São Paulo, para a solução das questões decorrentes do presente instrumento, renunciando as partes a qualquer outro, por mais privilegiado que lhes possa ser.",
    "E por estarem assim justas e contratadas, assinam o presente, em duas vias de igual teor e forma e na presença de duas testemunhas, para que surta seus legais e jurídicos efeitos, obrigando-se por si, seus herdeiros e/ou sucessores, ao fiel cumprimento de todas as suas cláusulas e condições.");

  B.push({ t: "local_data", texto: `${cond.cidade_assinatura || "São Paulo"}, ${dataPorExtenso(cond.data_assinatura || hoje())}` });
  for (const x of locadores) B.push({ t: "assinatura", papel: "CONTRATANTE", nome: x.nome.toUpperCase() });
  B.push({ t: "assinatura", papel: "CONTRATADO", nome: "VILLE JARDINS NEGÓCIOS IMOBILIÁRIOS LTDA" });
  B.push({ t: "testemunhas", lista: cond.testemunhas || [] });

  for (const x of locadores) {
    const falta: string[] = [];
    if (!soDigitos(x.cpf_cnpj)) falta.push(x.tipo_pessoa === "PJ" ? "CNPJ" : "CPF");
    if (!x.endereco) falta.push(x.tipo_pessoa === "PJ" ? "sede" : "endereço");
    if (falta.length) pend.push(`${x.nome}: falta ${falta.join(", ")}.`);
  }
  return { blocos: B, pendencias: pend };
}

function hoje(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// nome do arquivo: "Contrato de Locação - Rua Haddock Lobo, 999 apto 81 - 18-10-2026"
export function nomeArquivo(tipo: "locacao" | "administracao", imovel: Record<string, any> | null): string {
  const end = imovel ? [imovel.rua, imovel.numero].filter(Boolean).join(", ") + (imovel.complemento ? ` ${imovel.complemento}` : "") : "imóvel";
  const d = hoje().split("-").reverse().join("-");
  return `${tipo === "locacao" ? "Contrato de Locação" : "Contrato de Administração"} - ${end} - ${d}`.replace(/[\\/:*?"<>|]+/g, "-");
}

// ---- validação da minuta gravada em adm_contratos.minuta (whitelist) ----
const SEG_OK = new Set(["porto", "tokio", "too", "pottencial"]);
const COB_OK = new Set(["danos_imovel", "pintura_interna", "pintura_externa", "multa_rescisoria", "danos_moveis"]);
const CAP_OK = new Set(["porto", "icatu"]);

export function normalizarMinuta(b: any): Minuta {
  const t = (v: unknown, max = 200) => {
    const s = String(v ?? "").replace(/\s+/g, " ").trim();
    return s ? s.slice(0, max) : null;
  };
  const n = (v: unknown) => {
    const x = num(v);
    return x !== null && x >= 0 && x < 1e9 ? Math.round(x * 100) / 100 : null;
  };
  const g = b?.garantia || {};
  const k = g.capitalizacao || {};
  const cd = b?.condicoes || {};
  const ad = b?.administracao || {};
  const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
  return {
    garantia: {
      seguradora: SEG_OK.has(g.seguradora) ? g.seguradora : null,
      coberturas: Array.isArray(g.coberturas) ? g.coberturas.filter((x: string) => COB_OK.has(x)) : [],
      quitacao_ville: g.quitacao_ville !== false,
      capitalizacao: {
        empresa: CAP_OK.has(k.empresa) ? k.empresa : null,
        valor: n(k.valor),
        proposta: t(k.proposta, 80),
        titular_terceiro: t(k.titular_terceiro, 200),
      },
      caucao: { valor: n(g.caucao?.valor) },
    },
    condicoes: {
      administrada: cd.administrada !== false,
      primeiro_aluguel_ville: cd.primeiro_aluguel_ville !== false,
      multa_rescisoria_alugueis: n(cd.multa_rescisoria_alugueis),
      isencao_multa_meses: n(cd.isencao_multa_meses),
      data_assinatura: data(cd.data_assinatura),
      cidade_assinatura: t(cd.cidade_assinatura, 80),
      testemunhas: (Array.isArray(cd.testemunhas) ? cd.testemunhas : []).slice(0, 2).map((x: any) => ({
        nome: t(x?.nome, 150),
        cpf: soDigitos(x?.cpf) ? fmtCpfCnpj(x.cpf) : null,
      })),
    },
    administracao: { valor_minimo: n(ad.valor_minimo), comissao_venda: n(ad.comissao_venda) },
  };
}

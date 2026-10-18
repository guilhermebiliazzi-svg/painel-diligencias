// Cláusulas de garantia do contrato de locação.
//
// Seguro fiança e título de capitalização: TEXTO OFICIAL de cada seguradora /
// sociedade de capitalização (arquivos enviados pelo Guilherme em 18/10/2026,
// guardados em claude/clausulas_garantia_locacao_textos.md no projeto EVA).
// As seguradoras exigem o texto sem alteração ("documentos inadequados podem
// resultar em perda de direito à indenização"), então aqui só se preenchem os
// campos em branco e se escolhe quais blocos entram. Não reescrever.
//
// Fiador e caução: modelos da Ville (cláusula 6ª enviada em 18/10/2026).

export const SEGURADORAS = [
  { v: "porto", t: "Porto Seguro" },
  { v: "tokio", t: "Tokio Marine" },
  { v: "too", t: "Too Seguros" },
  { v: "pottencial", t: "Pottencial" },
] as const;
export type Seguradora = (typeof SEGURADORAS)[number]["v"];

export const COBERTURAS = [
  { v: "danos_imovel", t: "Danos ao imóvel" },
  { v: "pintura_interna", t: "Pintura interna" },
  { v: "pintura_externa", t: "Pintura externa" },
  { v: "multa_rescisoria", t: "Multa rescisória" },
  { v: "danos_moveis", t: "Danos aos móveis" },
] as const;
export type Cobertura = (typeof COBERTURAS)[number]["v"];

export const CAPITALIZADORAS = [
  { v: "porto", t: "Porto Seguro Capitalização" },
  { v: "icatu", t: "Icatu Capitalização" },
] as const;
export type Capitalizadora = (typeof CAPITALIZADORAS)[number]["v"];

const VILLE_QUITACAO =
  "VILLE JARDINS NEGÓCIOS IMOBILIÁRIOS LTDA., inscrita no CNPJ sob o nº 41.132.782/0001-08";

type TextoSeguro = {
  base: string[];
  // parágrafo dos locatários solidários: "pf_varios" = só quando há mais de um
  // locatário pessoa física (Porto e Tokio); nas outras já está na base.
  solidario?: string;
  coberturas: Partial<Record<Cobertura, string[]>>;
  fim?: (o: { quitacaoVille: boolean }) => string[];
};

export const TEXTO_SEGURO: Record<Seguradora, TextoSeguro> = {
  // Porto Seguro Cia. de Seguros Gerais — Anexo I do Manual do Corretor (set/2026)
  porto: {
    base: [
      "O seguro de Fiança Locatícia contratado pelo(s) LOCADOR(ES) junto a PORTO SEGURO CIA. DE SEGUROS GERAIS, em que a vigência inicial será a data de protocolo da proposta ou data distinta acordada entre as partes e a vigência final será a data do término do contrato de locação, garantirá está locação, nos termos do inciso III, do artigo 37 da Lei do Inquilinato, mediante pagamento de prêmio, ressalvadas as exceções previstas nas condições gerais.",
      "A PORTO SEGURO CIA. DE SEGUROS GERAIS, disponibiliza a possibilidade de contratação de produtos com condições diferentes em relação ao Limite Máximo de Garantia (LMG). No SEGURO FIANÇA LOCATÍCIA TRADICIONAL, o LMG é a soma dos limites máximos de indenização (LMI) das coberturas contratadas.",
      "No SEGURO FIANÇA LOCATÍCIA ESSENCIAL, o LMG da apólice é igual ao LMI da cobertura de ALUGUEL. Quando contratada apenas a Cobertura Básica - Não Pagamento de Aluguéis, o Limite Máximo de Garantia da apólice será igual ao Limite Máximo de Indenização desta mesma cobertura. Quando houver a contratação de coberturas adicionais, o Limite Máximo de Garantia da apólice será menor que a soma dos Limites Máximos de Indenização das coberturas contratadas.",
      "São de conhecimento do(s) LOCADOR(es) e LOCATÁRIO(S) as Condições Gerais do seguro de Fiança Locatícia, sendo que para a contratação da apólice, LOCADOR(es) e LOCATÁRIO(s) definiram previamente, mediante acordo, a seguradora, o corretor de seguros e os limites da apólice. Para efeito desta garantia, LOCADOR (es) e LOCATÁRIO(s) acordam que os prêmios iniciais e renovações do seguro de fiança locatícia, calculados conforme NORMAS VIGENTES, serão pagos pelo(s) LOCATÁRIOS(s). de acordo com o inciso XI, do artigo 23 da lei do inquilinato, sob pena de rescisão desta locação, com o consequente despejo e cancelamento da apólice. Na hipótese de inadimplência do(s) LOCATÁRIO(s), o(s) LOCADOR(es) poderá(ão) efetuar o pagamento dos prêmios, para que a apólice permaneça vigente.",
      "Em caso de prorrogação do contrato de locação, com alterações que influenciam nas condições iniciais de aceitação, a seguradora se reservará ao direito de realizar nova análise do risco. LOCADOR(ES) e LOCATÁRIO (S) declaram que até a data da contratação do seguro, todas as obrigações contratuais foram cumpridas pelas partes, tendo o (s) LOCATÁRIO (s) adimplido pontualmente todos os alugueis e encargos da locação. Declaram ainda que não há sinistro a reclamar, quanto a alugueis e encargos, bem como estão cientes que não haverá cobertura securitária para os aluguéis e encargos vencidos e vincendos, caso seja identificado que o primeiro inadimplemento tenha ocorrido antes da contratação do seguro, ficando a seguradora, desobrigada e isenta de toda e qualquer responsabilidade, ainda que haja reclamação futura de inadimplência anterior a data de contratação do seguro.",
      "A apólice garantirá exclusivamente as coberturas especificadas na proposta de seguro. Eventuais débitos decorrentes do presente contrato, não pagos pelo(s) LOCATÁRIO (s) após regularmente instados a tanto serão comunicados às entidades mantenedoras de bancos de dados de proteção ao crédito (Serasa, SPC, etc.), quer pelos Locadores, quer pela Seguradora. Tais débitos incluem todas as despesas com as medidas judiciais cabíveis. Notificações em geral, inclusive sobre eventuais débitos decorrentes do presente contrato poderão ser realizadas ao(s) LOCATÁRIO(S), via e-mail.",
      "As Partes convencionam que a Seguradora sub-rogar-se-á automaticamente no(s) direito(s) do(s) LOCADOR(es) pelos débitos em aberto do(s) LOCATÁRIO (s) com o pagamento do(s) adiantamento(s) da indenização ou da indenização final ao(s) LOCADOR(es).",
    ],
    solidario:
      "Para exercer os direitos e dar cumprimento às obrigações desse contrato, os LOCATÁRIOS declaram-se solidários entre si e constituem-se reciprocamente PROCURADORES, conferindo se mutuamente poderes especiais para receber citações, notificações e intimações, confessar, desistir, e assinar tudo quanto se tornar necessário, transigir em Juízo ou fora dele, fazer acordos, firmar compromissos judiciais ou extrajudiciais, receber e dar quitação.",
    coberturas: {
      danos_imovel: [
        "Quando contratada a cobertura adicional de Danos ao Imóvel, passa a ter validade a seguinte cláusula: LOCADOR (es) e LOCATÁRIO(s) declara(m) que o Laudo de Vistoria Inicial, com descrição do estado do imóvel, foi elaborado antes da posse do imóvel, bem como o(s) LOCATÁRIO(s) concorda(m) com o conteúdo do laudo .O(s) LOCATÁRIO(s) declaram para todos os fins e efeitos de direito que recebe(m) o imóvel locado no estado em que se encontra de conservação e uso, identificado no Relatório referente ao estado de uso e conservação do imóvel o qual é parte integrante deste contrato, assinado por todos os contratantes, obrigando-se e comprometendo-se a devolvê-lo nesse estado, independentemente de qualquer aviso ou notificação prévia, e qualquer que seja o motivo de devolução, sob pena de incorrer nas cominações previstas neste contrato ou estipuladas em lei, além da obrigação de indenizar por danos ou prejuízos decorrentes da inobservância dessa obrigação, salvo as deteriorações decorrentes do uso normal do imóvel.",
      ],
      pintura_interna: [
        "Quando contratada a cobertura adicional de Pintura Interna, passa a ter validade a seguinte cláusula: LOCADOR (es) e LOCATÁRIO(s) declara(m) que o Laudo de Vistoria Inicial, com descrição do estado do imóvel, foi elaborado antes da posse do imóvel, bem como o(s) LOCATÁRIO(s) concorda(m) com o conteúdo do laudo. Declara(m) o(s) locatário(s), para todos os fins e efeitos de direito, que recebe(m) o imóvel locado com Pintura Interna NOVA, e assim obriga-se, ao final da locação, a pintá-lo e devolvê-lo no mesmo estado em que recebeu, sob pena de incorrer nas cominações previstas neste contrato ou estipuladas em lei. O(s) locatário(s) declara(m) ainda estar ciente de que, não devolvendo o imóvel pintado internamente, a Seguradora indenizará o locador pelo ônus da pintura, e terá direito de reaver o valor que tiver sido pago. O Segurado poderá comunicar o Sinistro a Porto Seguro no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel.",
      ],
      pintura_externa: [
        "Quando contratada a cobertura adicional de Pintura Externa, passa a ter validade a seguinte cláusula: LOCADOR (es) e LOCATÁRIO(s) declara(m) que o Laudo de Vistoria Inicial, com descrição do estado do imóvel, foi elaborado antes da posse do imóvel, bem como o(s) LOCATÁRIO(s) concorda(m) com o conteúdo do laudo. Declara(m) o(s) locatário(s), para todos os fins e efeitos de direito, que recebe(m) o imóvel locado com Pintura Externa NOVA, e assim obriga-se, ao final da locação, a pintá-lo e devolvê-lo no mesmo estado que recebeu, sob pena de incorrer nas cominações previstas neste contrato ou estipuladas em lei. O(s) locatário(s) declara(m) ainda estar ciente de que não devolvendo o imóvel pintado externamente, a Seguradora indenizará o locador pelo ônus da pintura, e terá direito de reaver o valor que tiver sido pago.",
      ],
    },
  },

  // Tokio Marine — Anexo 1 do Manual do Corretor (Modelo TOKIO)
  tokio: {
    base: [
      "O seguro de Fiança Locatícia contratado pelo LOCADOR junto a TOKIO MARINE SEGURADORA, cuja vigência inicial será a data de protocolo da proposta e a vigência final será a data do término do contrato de locação ou a data do próximo reajuste do aluguel, garantirá esta locação, nos termos do inciso III, do artigo 37 da Lei do Inquilinato, mediante pagamento de prêmio. Para a presente contratação, ficou acordado que a vigência do seguro será pelo prazo do contrato. Havendo a realização de novo contrato, prorrogação deste ou decorridos 5 anos do contrato a aceitação do seguro ficará sujeita à nova análise do risco, ressalvadas as exceções previstas nas condições gerais. São de conhecimento do LOCADOR e LOCATÁRIO(S) as Condições Gerais do seguro de Fiança Locatícia. Para efeito desta garantia, os prêmios iniciais e renovações, calculados conforme NORMAS VIGENTES, serão pagos pelo(s) Locatário(s), de acordo com o inciso XI, do artigo 23 da lei do inquilinato, sob pena de rescisão desta locação, com o consequente despejo e cancelamento da apólice. A apólice garantirá exclusivamente as coberturas especificadas na proposta de seguro. Eventuais débitos decorrentes do presente contrato, não pagos pelo(s) Locatário(s) após regularmente instados a tanto serão comunicados às entidades mantenedoras de bancos de dados de proteção ao crédito (Serasa, SPC, etc.), quer pelo Locador(a), quer pela Seguradora. Tais débitos incluem todas as despesas com as medidas judiciais cabíveis.",
    ],
    solidario:
      "Para exercer os direitos e dar cumprimento às obrigações desse contrato, os LOCATÁRIOS declaram-se solidários entre si e constituem-se reciprocamente PROCURADORES, conferindo se mutuamente poderes especiais para receber citações, notificações e intimações, confessar, desistir, e assinar tudo quanto se tornar necessário, transigir em Juízo ou fora dele, fazer acordos, firmar compromissos judiciais ou extrajudiciais, receber e dar quitação.",
    coberturas: {
      danos_imovel: [
        "O locatário declara para todos os fins e efeitos de direito, que recebe o imóvel locado no estado em que se encontra de conservação e uso, identificado no Laudo de Vistoria Inicial o qual é parte integrante deste contrato, assinado por todos os contratantes, obrigando-se e comprometendo-se a devolvê-lo nesse estado, independentemente de qualquer aviso ou notificação prévia e qualquer que seja o motivo de devolução, sob pena de incorrer nas cominações previstas neste contrato ou estipuladas em lei, além da obrigação de indenizar por danos ou prejuízos decorrentes da inobservância dessa obrigação, salvo as deteriorações decorrentes do uso normal do imóvel.",
      ],
      pintura_interna: [
        "Declara o locatário, para todos os fins e efeitos de direito, que recebe o imóvel locado com Pintura Interna NOVA, e assim obriga-se, ao final da locação, a pintá-lo e devolvê-lo no mesmo estado em que recebeu, sob pena de incorrer nas cominações previstas neste contrato ou estipuladas em lei. O locatário declara ainda estar ciente de que, não devolvendo o imóvel pintado internamente, a Seguradora indenizará o locador pelo ônus da pintura, e terá direito de reaver o valor que tiver sido pago. O Segurado deverá comunicar o Sinistro a TOKIO MARINE no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel.",
      ],
      pintura_externa: [
        "Declara o locatário, para todos os fins e efeitos de direito, que recebe o imóvel locado com Pintura Externa NOVA, e assim obriga-se, ao final da locação, a pintá-lo e devolvê-lo no mesmo estado que recebeu, sob pena de incorrer nas cominações previstas neste contrato ou estipuladas em lei. O locatário declara ainda estar ciente de que não devolvendo o imóvel pintado externamente, a Seguradora indenizará o locador pelo ônus da pintura, e terá direito de reaver o valor que tiver sido pago. O Segurado deverá comunicar o Sinistro a TOKIO MARINE no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel. Esta cobertura é válida somente para imóveis residenciais e não residenciais do tipo “casa”, onde o locatário ocupa a totalidade do imóvel alugado.",
      ],
    },
  },

  // Too Seguros S.A.
  too: {
    base: [
      "1. O Seguro de Fiança Locatícia será contratado junto à TOO SEGUROS S.A., pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 33.245.762/0001-07, com sede na Avenida Paulista, 1374, 13º andar, Bela Vista, São Paulo/SP, CEP 01.310-100 (“SEGURADORA”), cuja vigência seguirá o disposto na Proposta de Contratação do Seguro, garantirá esta locação, nos termos do inciso III do art. 37 da Lei do Inquilinato, mediante pagamento de Prêmio.",
      "1.1. LOCADOR e LOCATÁRIO declaram que conhecem e aceitam as Condições Gerais do Seguro Fiança Locatícia.",
      "1.2. O Prêmio do Seguro, calculado conforme suas Condições Gerais e legislação aplicável, será pago pelo LOCATÁRIO, de acordo com o inciso XI do art. 23 da Lei do Inquilinato, sob pena de rescisão desta locação, com o consequente despejo e cancelamento da apólice.",
      "1.3. A Apólice garantirá exclusivamente as coberturas especificadas na Proposta de Contratação. As Partes reconhecem e aceitam que a responsabilidade da SEGURADORA em relação à cobertura Multas Contratuais estará limitada ao valor previsto na Apólice de Seguro.",
      "1.4. Eventuais débitos decorrentes do presente Contrato, não pagos pelo LOCATÁRIO após regularmente instado para tanto, serão comunicados às entidades mantenedoras de bancos de dados de proteção ao crédito (Serasa, SPC, etc.), quer pelo LOCADOR, quer pela SEGURADORA.",
      "1.4.1. Os débitos mencionados no item anterior incluem todas as despesas com as medidas judiciais cabíveis.",
      "1.4.2. Havendo mais de um LOCATÁRIO, declaram-se solidários entre si, concedendo uns aos outros poderes para recebimento de citação.",
    ],
    coberturas: {
      danos_imovel: [
        "2. Quando contratada a cobertura adicional de Danos ao Imóvel: O LOCATÁRIO declara, para todos os fins e efeitos de direito, que recebe o imóvel locado no estado de conservação e uso em que se encontra, identificado no relatório referente ao estado de uso e conservação do imóvel, o qual é parte integrante deste Contrato, assinado por todos os contratantes, obrigando-se e comprometendo-se a devolvê-lo nesse estado, independentemente de qualquer aviso ou notificação prévia, e qualquer que seja o motivo de devolução, sob pena de incorrer nas cominações previstas neste Contrato ou estipuladas em lei, além da obrigação de indenizar o LOCADOR por danos ou prejuízos decorrentes da inobservância dessa obrigação, salvo as deteriorações decorrentes do uso normal do imóvel.",
      ],
      pintura_interna: [
        "3. Quando contratada a cobertura adicional de Pintura Interna: Declara o LOCATÁRIO, para todos os fins e efeitos de direito, que recebe o imóvel locado com pintura interna nova e assim obriga-se, ao final da locação, a pintá-lo e devolvê-lo no mesmo estado que recebeu, sob pena de incorrer nas cominações previstas neste Contrato ou estipuladas em lei. O LOCATÁRIO declara ainda estar ciente de que não devolvendo o imóvel pintado internamente, a SEGURADORA indenizará o LOCADOR pelo ônus da pintura, e terá direito de reaver o valor que tiver sido pago. O LOCADOR deverá comunicar o Sinistro à SEGURADORA no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel.",
      ],
      pintura_externa: [
        "4. Quando contratada a cobertura adicional de Pintura Externa: Declara o locatário, para todos os fins e efeitos de direitos, que recebe o imóvel com pintura externa nova e assim obriga-se, ao final da locação, a pintá-lo e devolvê-lo no mesmo estado que recebeu, sob pena de incorrer nas cominações previstas neste Contrato ou estipulados em lei. O LOCATÁRIO declara ainda estar ciente de que não devolvendo o imóvel pintado externamente a SEGURADORA indenizará o LOCADOR pelo ônus da pintura e terá direito de reaver o valor que tiver sido pago. O LOCADOR deverá comunicar o Sinistro à SEGURADORA no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel.",
      ],
      danos_moveis: [
        "5. Quando contratada a cobertura adicional de Danos aos Móveis: O LOCATÁRIO declara, para todos os fins e efeitos de direito, que os móveis existentes no imóvel locado se encontram no estado de conservação e uso identificado no relatório referente ao estado de uso e conservação dos móveis, o qual é parte integrante deste Contrato, assinado por todos os contratantes, obrigando-se e comprometendo-se a devolvê-los nesse estado, independentemente de qualquer aviso ou notificação prévia, e qualquer que seja o motivo de devolução, sob pena de incorrer nas cominações previstas neste Contrato ou estipuladas em lei, além da obrigação de indenizar o LOCADOR por danos ou prejuízos decorrentes da inobservância dessa obrigação, salvo as deteriorações decorrentes do uso normal dos móveis.",
      ],
    },
    // parágrafo opcional da Too: quem recebe e dá quitação das indenizações
    fim: ({ quitacaoVille }) =>
      quitacaoVille
        ? [`Na ocorrência de inadimplência garantida pela Apólice de Seguro, o LOCADOR autoriza ${VILLE_QUITACAO} a receber e dar quitação para os valores apurados e indenizáveis pela Seguradora.`]
        : [],
  },

  // Pottencial Seguradora S.A. — "Seguro Pottencial Aluguel" (versão 12/2025)
  pottencial: {
    base: [
      "As Partes anuem com a emissão de seguro fiança locatícia para garantia do presente contrato, nos termos do art. 37, III da Lei nº 8.245/1991 (Lei de Locações), a ser contratado pelo(a) LOCATÁRIO(A), junto à Pottencial Seguradora S.A., tendo como Segurado o LOCADOR e declaram ter negociado e anuído com a indicação do corretor de seguros, as coberturas e limites de indenização contratados, cujos termos e condições do contrato de seguro estão disponíveis para consulta através do link https://pottencial.com.br/certidoes-legais/condicoes-gerais/.",
      "O seguro estará vigente pelo período previsto na apólice emitida. Ocorrendo prorrogação de prazo do presente contrato de locação com alteração das condições anteriormente estabelecidas entre as partes, mediante formalização de aditivo ou em razão de prorrogação por prazo indeterminado por força de lei ou ato normativo, a Seguradora deverá ser comunicada para reanálise de aceitação do risco.",
      "Para efeito desta garantia, os prêmios iniciais e de renovações do seguro fiança serão pagos pelo LOCATÁRIO(A), de acordo com o inciso XI, do artigo 23 da lei do inquilinato. Exclusivamente em caso de o pagamento do prêmio ser efetivada através de fatura, o LOCATÁRIO desde já anui com a realização do pagamento do prêmio à IMOBILIÁRIA para posterior repasse da quantia à Seguradora.",
      "A apólice garantirá exclusivamente as coberturas especificadas na proposta de seguro.",
      "Inadimplência - Em caso de inadimplência do LOCATÁRIO(A), a SEGURADORA concederá prazo ao LOCADOR(A) para pagamento do prêmio, nos termos previstos nas Condições Gerais do seguro, sob pena de cancelamento do seguro e rescisão desta locação por infração contratual, com o consequente despejo.",
      "Notificações – O(A) LOCADOR(A) e LOCATÁRIO(A) declara(m) que todos os dados informados para contratação do seguro estão corretos, estando cientes de que serão considerados pela SEGURADORA para envio de quaisquer notificações e/ou comunicações previstas na legislação vigente e Condições Gerais do seguro, sendo presumidos válidos para todos os fins de direito. O (A) LOCADOR(A) e o(a) LOCATÁRIO(A) poderão outorgar poderes à terceiros para recebimento de tais notificações e/ou comunicações, inclusive o(a) corretor/corretora de seguros ou a imobiliária, hipótese em que serão indicados os dados destes terceiros para contratação do seguro. Sendo necessário ajuste de qualquer dado, o(a) LOCADOR(A) ou o(a) LOCATÁRIO(A) deverão, a qualquer momento, entrar em contato com a SEGURADORA através da Central de Atendimento 0800 606 7688 ou pelo e-mail atendimento.corretora@pottencial.com.br para alteração ou correção.",
      "Pagamento de indenizações e Sub-rogação. Em caso de pagamento de qualquer indenização securitária, a SEGURADORA sub-rogar-se-á automaticamente no direito do LOCADOR(A) de cobrar os débitos em aberto em face do(a) LOCATÁRIO(A).",
      "Restrição Financeira. Eventuais débitos decorrentes do presente contrato ou do contrato de seguro não pagos pelo LOCATÁRIO(A) serão comunicados às entidades mantenedoras de bancos de dados de proteção ao crédito (Serasa, SPC, etc.), quer pelo LOCADOR(A), quer pela SEGURADORA, inclusive de todas as despesas havidas com as medidas judiciais cabíveis.",
      "Locatário Solidário – Havendo mais de um LOCATÁRIO(A) para exercer os direitos e dar cumprimento às obrigações desse contrato, ao firmarem esta locação, os LOCATÁRIOS(AS) declaram-se solidários entre si e constituem-se reciprocamente PROCURADORES, conferindo-se mutuamente poderes especiais para receber citações, notificações e intimações, confessar, desistir, e assinar tudo quanto se tornar necessário, transigir em juízo ou fora dele, fazer acordos, firmar compromissos judiciais ou extrajudiciais, receber e dar quitação, no âmbito deste contrato.",
    ],
    coberturas: {
      multa_rescisoria: [
        "Cobertura adicional de Multa Rescisória (contratação opcional) – Em caso de contratação desta cobertura adicional, o(a) LOCATÁRIO(A) reconhece que a entrega antecipada do imóvel antes da vigência final do contrato de locação configura quebra contratual, estando, portanto, obrigado ao pagamento de multa por rescisão que, caso não adimplida, poderá ensejar o pagamento da indenização securitária pela SEGURADORA. O(A) LOCATÁRIO(A) declara, ainda, estar ciente de que, não realizando o pagamento da multa prevista ao(a) LOCADOR(A), a SEGURADORA efetuará a indenização, com consequente pedido de ressarcimento em face do(a) LOCATÁRIO(A).",
        "O Segurado deverá comunicar o Sinistro à Pottencial no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel.",
      ],
      danos_imovel: [
        "Cobertura adicional de Danos ao Imóvel (contratação opcional) – Em caso de contratação desta cobertura adicional, o(a) LOCATÁRIO(A) declara para todos os fins e efeitos de direito, que recebe o imóvel locado no estado em que se encontra de conservação e uso, identificado no Laudo (Relatório) de Vistoria Inicial assinado por todos os contratantes, o qual é parte integrante deste contrato, obrigando-se e comprometendo-se o(a) LOCATÁRIO(A) a devolvê-lo nesse estado, independentemente de qualquer aviso ou notificação prévia e qualquer que seja o motivo de devolução, sob pena de incorrer nas cominações previstas neste contrato ou estipuladas em lei, além da obrigação de indenizar por danos ou prejuízos decorrentes da inobservância dessa obrigação, salvo as deteriorações decorrentes do uso normal do imóvel. O(A) LOCATÁRIO(A) declara, ainda, estar ciente de que, não realizando o pagamento dos prejuízos ao(a) LOCADOR(A), a SEGURADORA efetuará a indenização nos termos dos limites e condições contratuais do seguro, com consequente pedido de ressarcimento em face do(a) LOCATÁRIO(A). LOCADOR(A) e LOCATÁRIO(A) declaram que o Laudo (Relatório) de Vistoria Inicial com descrição do estado do imóvel foi elaborado antes da posse do imóvel, estando de acordo com todo o conteúdo do laudo. É imprescindível e obrigatória a apresentação do Relatório do Estado do Uso de Conservação do imóvel, assinado pelo Locador(a) e Locatário(a) como condição para pagamento de indenização pela SEGURADORA.",
        "O Segurado deverá comunicar o Sinistro à Pottencial o no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel.",
      ],
      pintura_interna: [
        "Cobertura adicional de Pintura Interna Nova (contratação opcional) – Caso contratada esta cobertura, declara o(a) LOCATÁRIO (A), para todos os fins e efeitos de direito, que recebe o imóvel locado com Pintura Interna NOVA e, assim, obriga-se, ao final da locação, a pintá-lo e devolvê-lo no mesmo estado em que recebeu, sob pena de arcar com os valores devidos ao(a) LOCADOR(A) para realização de nova pintura. O(A) LOCATÁRIO(A) declara ainda estar ciente de que, não devolvendo o imóvel pintado internamente, e estando a respectiva cobertura contratada na proposta de seguro, a SEGURADORA indenizará o(a) LOCADOR(A) pelos prejuízos havidos com a nova pintura, e terá direito de reaver o valor que tiver sido pago, nos termos dos limites e condições contratuais do seguro, em face do(a) LOCATÁRIO(A).",
        "O Segurado deverá comunicar o Sinistro à Pottencial no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel.",
      ],
      pintura_externa: [
        "Cobertura adicional de Pintura Externa Nova (cobertura opcional) – A cobertura é exclusiva para imóveis residenciais e não residenciais (casas para fins comerciais), na qual o locatário ocupa a área global do imóvel alugado. Declara o(a) LOCATÁRIO(A), para todos os fins e efeitos de direito, que recebe o imóvel locado com Pintura Externa NOVA, e assim obriga-se, ao final da locação, a pintá-lo e devolvê-lo no mesmo estado que recebeu, sob pena de arcar com os valores devidos ao(a) LOCADOR(A) para realização de nova pintura O(A) LOCATÁRIO(A) declara ainda estar ciente de que, não devolvendo o imóvel pintado internamente, e estando a respectiva cobertura contratada na proposta de seguro, a SEGURADORA indenizará o(a) LOCADOR(A) pelos prejuízos havidos com a nova pintura, e terá direito de reaver o valor que tiver sido pago, nos termos dos limites e condições contratuais do seguro, em face do(a) LOCATÁRIO(A).",
        "O(A) Segurado(a) deverá comunicar o Sinistro a Pottencial no prazo máximo de 15 (quinze) dias a contar da desocupação do imóvel.",
      ],
    },
  },
};

// quais seguradoras usam o parágrafo de solidários só com vários locatários PF
const SOLIDARIO_SO_PF_VARIOS: Seguradora[] = ["porto", "tokio"];

export function coberturasDe(s: Seguradora | null | undefined): Cobertura[] {
  if (!s || !TEXTO_SEGURO[s]) return [];
  return COBERTURAS.map((c) => c.v).filter((c) => !!TEXTO_SEGURO[s].coberturas[c]);
}

export function clausulaSeguro(o: {
  seguradora: Seguradora;
  coberturas: Cobertura[];
  locatariosPF: number;
  quitacaoVille: boolean;
}): string[] {
  const t = TEXTO_SEGURO[o.seguradora];
  const out = [...t.base];
  if (t.solidario && (!SOLIDARIO_SO_PF_VARIOS.includes(o.seguradora) || o.locatariosPF > 1)) out.push(t.solidario);
  for (const c of COBERTURAS.map((x) => x.v)) {
    if (o.coberturas.includes(c) && t.coberturas[c]) out.push(...(t.coberturas[c] as string[]));
  }
  if (t.fim) out.push(...t.fim({ quitacaoVille: o.quitacaoVille }));
  return out;
}

// ---- título de capitalização ----
export function clausulaCapitalizacao(o: {
  empresa: Capitalizadora;
  valor: string; // "R$ 15.300,00 (quinze mil e trezentos reais)" — sem o "R$ " do modelo
  proposta: string;
  titularTerceiro?: string | null;
}): string[] {
  const v = o.valor || "____________________";
  const n = o.proposta || "__________________________";
  if (o.empresa === "icatu") {
    return [
      `Como garantia das obrigações assumidas neste contrato, o(a) LOCATÁRIO(A), por ser de seu interesse, dá em Caução ao(à) LOCADOR(A), o(s) Título(s) de Capitalização de Pagamento Único da modalidade Instrumento de Garantia, no valor total de R$ ${v}, subscrito(s), neste ato, junto à ICATU CAPITALIZAÇÃO S/A, através da(s) Proposta(s) de nº(s) ${n}.`,
      "PARÁGRAFO PRIMEIRO - No ato da contratação do título de capitalização, o LOCATÁRIO(A) (titular) cede 100% (cem por cento) do seu direito sobre a quota de capitalização ao LOCADOR(A), sendo que somente ocorrerá o aperfeiçoamento desta cessão quando o LOCATÁRIO(A) deixar de cumprir com as obrigações do contrato de locação.",
      "PARÁGRAFO SEGUNDO - No caso de inobservância pelo(a) LOCATÁRIO(A) das cláusulas do contrato de locação, ficam o(a) LOCADOR(A) ou a Administradora que o represente desde já autorizado(s) a resgatar o título de capitalização, desde que a documentação exigida pela sociedade de capitalização seja apresentada, respeitando o disposto nas condições gerais do título de capitalização.",
      "PARÁGRAFO TERCEIRO - Para o resgate do título de capitalização, seja na situação a que se refere o parágrafo anterior ou no caso de desocupação do imóvel e entrega das chaves sem a existência de quaisquer débitos, o(a) LOCADOR(A) confere à Administradora todos os poderes para praticar os atos inerentes à administração do imóvel, bem como resgatar o título de capitalização dado em garantia, passar recibos e dar quitação.",
      "PARÁGRAFO QUARTO - Ao término do prazo de vigência do(s) Título(s), fica o(a) LOCATÁRIO(A) obrigado(a) a renová-lo(s) enquanto perdurar a locação, no mesmo plano, mediante reaplicação dos saldos atualizados, ficando, também, o(s) Títulos(s) oriundo(s) da reaplicação caucionado(s) como garantia de avença locatícia até a efetiva desocupação do imóvel e entrega das chaves.",
      "PARÁGRAFO QUINTO - Para o resgate do título de capitalização pelo LOCATÁRIO(A) durante a vigência deste contrato de locação, será necessário a anuência expressa do(a) LOCADOR(A) junto à ICATU CAPITALIZAÇÃO S/A.",
      "PARÁGRAFO SEXTO - Por este instrumento, autorizo a Icatu Capitalização S/A a RENOVAR AUTOMATICAMENTE, com o valor de resgate do Título de capitalização, sempre em meu nome, dando origem a uma nova Proposta, Título e Número da Sorte, permanecendo este caucionado em garantia da locação, desde que este novo título mantenha as Condições Gerais do Título inicial, sendo de minha responsabilidade informar expressamente à Icatu Capitalização qualquer alteração cadastral, bem como a me manifestar acerca de eventual não renovação do título de capitalização com a antecedência mínima de 30 dias da respectiva data de vencimento.",
    ];
  }
  const abertura = o.titularTerceiro
    ? `A presente locação é garantida pelo(s) Titulo(s) de Capitalização emitido(s) pela Porto Seguro Capitalização S.A., no valor nominal de R$ ${v} subscrito(s) pela Porto Seguro Capitalização S.A., representado pelo formulário n.º ${n} de Titularidade do(a) Sr.(a) ${o.titularTerceiro}, o(a) qual não é codevedor(a) na relação obrigacional deste contrato, respondendo por eventuais débitos locatícios tão somente o valor de resgate do(s) Título(s) de Capitalização ora dado(s) em garantia, o que é de expresso conhecimento e concordância do(s) LOCADOR(A) e do(a) LOCATÁRIO(A).`
    : `Para garantir as obrigações assumidas neste contrato, o(a) LOCATÁRIO(a), por ser de seu interesse, dá neste ato, em Caução ao(à) LOCADOR(A), o(s) Título(s) de Capitalização no valor nominal de R$ ${v}, subscrito(s) pela Porto Seguro Capitalização S.A., representado pela proposta/formulário n.º ${n}.`;
  return [
    abertura,
    "Parágrafo primeiro: se o(a) LOCATÁRIO(A) não observar quaisquer das cláusulas do presente contrato de locação, fica, desde já, o(a) LOCADOR(A) ou a Administradora que o represente, autorizado a resgatar o(s) Título(s) de capitalização, a qualquer momento, mesmo antes do prazo final de capitalização, respeitando a tabela de resgate, inclusive com a correção devida, independentemente de interpelação judicial ou extrajudicial, a fim de que o valor do resgate quite eventual importância que lhe seja devida em razão de débitos oriundos deste contrato, respeitando os termos descritos nas condições gerais do título de capitalização.",
    "Paragrafo segundo: a hipótese do(a) LOCÁTARIO(A) contestar o valor apresentado e ajuizar a competente ação cautelar de prestação de contas, correrão por conta do(a) mesmo(a) todas as despesas consequentes, inclusive custas e honorários advocatícios.",
    "Parágrafo terceiro: durante a vigência deste contrato de locação, o resgaste do título de capitalização pelo LOCATÁRIO (A) somente poderá ocorrer com expressa anuência do (a) LOCADOR (A).",
    "Parágrafo quarto: ao término do prazo de locação, desde que cumpridas pelo(a) LOCATÁRIO(A) todas as obrigações decorrentes deste contrato, inclusive, a desocupação do imóvel e entrega das chaves sem a existência de qualquer débito do (a) LOCATÁRIO (A) para com o LOCADOR (A), será liberado junto à Porto Seguro Capitalização S.A. a caução do(s) Título(s), apresentado(s). Para tanto, deverá ser apresentado documento rescisório da locação firmado pelos(as) LOCADOR(A) e LOCATÁRIO(A), com o reconhecimento de firma das assinaturas, bem como outros documentos requeridos pela Sociedade de Capitalização.",
    "Paragrafo quinto: para efeito do cumprimento do disposto no parágrafo primeiro a autorização concedida ao (à) LOCADOR (A)/Administradora, para resgatar o título decorre da própria natureza jurídica desta modalidade de título de capitalização denominada “instrumento de Garantia”, que visa assegurar o cumprimento de obrigações assumidas contratualmente perante terceiros, nos termos da Resolução CNSP n° 384/2020 e Circular Susep n° 656/2022.",
  ];
}

// ---- fiador (modelo Ville) ----
export function clausulaFiador(o: {
  plural: boolean; // mais de um fiador (casal conta como dois quando os dois assinam como fiadores)
  locatarioPlural: boolean;
  imoveis: { cartorio?: string | null; matricula?: string | null; descricao?: string | null }[];
}): string[] {
  const L = o.locatarioPlural ? "os LOCATÁRIOS" : "o LOCATÁRIO";
  const ims = o.imoveis.filter((i) => i.matricula || i.descricao);
  const out = [
    `O Cumprimento de todas as obrigações previstas neste contrato, inclusive o pagamento pontual do aluguel, seus reajustes, suas majorações, encargos locatícios como IPTU e outros incidentes sobre o imóvel locado, estarão garantidos por meio de fiança dada ${o.plural ? "pelos FIADORES anteriormente qualificados" : "pelo FIADOR anteriormente qualificado"}. ${o.plural ? "Os FIADORES declaram serem proprietários" : "O FIADOR declara ser proprietário"} ${ims.length > 1 ? "dos seguintes imóveis" : "do seguinte imóvel"}:`,
  ];
  for (const im of ims.length ? ims : [{ cartorio: "", matricula: "", descricao: "" }]) {
    out.push(`**${(im.cartorio || "____________________").toUpperCase()}**`);
    out.push(`Matrícula: ${im.matricula || "__________"}`);
    out.push(`Imóvel: ${im.descricao || "____________________"}`);
  }
  out.push(
    `§ 1º. ${o.plural ? "Os FIADORES obrigam-se como principais pagadores e devedores solidários" : "O FIADOR obriga-se como principal pagador e devedor solidário"} com ${L} por todas as obrigações deste contrato, renunciando expressamente ao benefício de ordem previsto no art. 827 do Código Civil, bem como aos benefícios dos arts. 835, 837, 838 e 839 do mesmo diploma.`,
    `§ 2º. A responsabilidade ${o.plural ? "dos FIADORES perdurará" : "do FIADOR perdurará"} até a efetiva restituição do imóvel e entrega das chaves, mediante termo próprio, ainda que a locação seja prorrogada por prazo indeterminado, abrangendo reajustes, majorações legais ou contratuais do aluguel, encargos, multas, danos ao imóvel, custas e honorários advocatícios.`,
    `§ 3º. Em caso de morte, insolvência, exoneração ou alienação/oneração do imóvel indicado ${o.plural ? "pelos FIADORES" : "pelo FIADOR"}, ${L} deverá apresentar nova garantia idônea em até 30 (trinta) dias da notificação, sob pena de rescisão contratual, nos termos do art. 40, parágrafo único, da Lei 8.245/91.`,
    `§ 4º. ${o.plural ? "Os FIADORES autorizam" : "O FIADOR autoriza"} que citações, intimações e notificações sejam realizadas nos endereços físico e eletrônico indicados em sua qualificação.`,
  );
  return out;
}

// ---- caução (modelo Ville) ----
export function clausulaCaucao(o: { valor: string; locatarioPlural: boolean }): string[] {
  const L = o.locatarioPlural ? "os LOCATÁRIOS" : "o LOCATÁRIO";
  const doL = o.locatarioPlural ? "dos LOCATÁRIOS" : "do LOCATÁRIO";
  return [
    `Como garantia do fiel cumprimento de todas as obrigações assumidas neste contrato, ${L} ${o.locatarioPlural ? "prestam" : "presta"}, neste ato, depósito caução no valor de R$ ${o.valor || "__________"}, em favor do LOCADOR, mediante transferência bancária a ser realizada na data da assinatura deste instrumento.`,
    `§ 1º. O valor do depósito caução será depositado em caderneta de poupança, em conformidade com o disposto no art. 38, § 2º, da Lei nº 8.245/91, revertendo em favor ${doL} todos os rendimentos e correções dela decorrentes, que serão restituídos juntamente com o valor principal ao término da locação, mediante comprovação da entrega do imóvel em perfeitas condições de conservação e da quitação integral de todas as obrigações contratuais, incluindo aluguéis, encargos, tributos e eventuais reparos.`,
    `§ 2º. O LOCADOR fica desde já autorizado a utilizar o valor do depósito caução para quitação de quaisquer débitos pendentes ${doL}, sejam relativos a aluguéis, encargos, tributos, multas ou indenizações por danos ao imóvel.`,
    `§ 3º. Em caso de utilização parcial ou total do depósito caução durante a vigência do contrato, ${L} ${o.locatarioPlural ? "obrigam-se" : "obriga-se"} a recompor o valor original em até 15 (quinze) dias, sob pena de configuração de infração contratual sujeita às penalidades previstas neste instrumento.`,
    `§ 4º. O depósito caução aqui prestado permanecerá válido e exigível durante toda a vigência da locação, inclusive em caso de prorrogação, até a efetiva desocupação do imóvel e entrega das chaves ao LOCADOR.`,
  ];
}

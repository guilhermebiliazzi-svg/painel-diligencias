// Partes do contrato de locação (locadores, locatários e fiadores) com a qualificação
// que vai no texto do contrato. Compartilhado entre a tela (cliente) e a API.
//
// Os documentos de cada parte (RG/CNH, comprovante, certidão, contrato social,
// matrícula do imóvel do fiador) ficam em adm_contrato_documentos, categoria
// "documentos_partes", ligados pela coluna parte_id. A leitura automática
// (n8n "Painel — Ler documento da parte", Gemini) devolve os dados de cada tipo e
// `aplicarLeitura` preenche os campos vazios; o que diverge vira sugestão na tela.

export type Papel = "locador" | "locatario" | "fiador";
export type TipoPessoa = "PF" | "PJ";

export type Conjuge = {
  nome?: string | null;
  cpf?: string | null;
  rg?: string | null;
  nacionalidade?: string | null;
  profissao?: string | null;
};

export type ImovelGarantia = {
  cartorio?: string | null;
  matricula?: string | null;
  descricao?: string | null;
};

export type Parte = {
  id?: number | null;
  papel: Papel;
  ordem?: number | null;
  tipo_pessoa: TipoPessoa;
  nome: string;
  cpf_cnpj?: string | null;
  rg?: string | null;
  genero?: "M" | "F" | null;
  nacionalidade?: string | null;
  estado_civil?: string | null;
  regime_bens?: string | null;
  profissao?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  representacao?: string | null;
  conjuge?: Conjuge | null;
  imoveis?: ImovelGarantia[] | null;
};

export const PAPEIS: { v: Papel; t: string; plural: string; novo: string }[] = [
  { v: "locador", t: "Locador", plural: "Locadores", novo: "+ Adicionar locador" },
  { v: "locatario", t: "Locatário", plural: "Locatários", novo: "+ Adicionar locatário" },
  { v: "fiador", t: "Fiador", plural: "Fiadores", novo: "+ Adicionar fiador" },
];
export const PAPEIS_VALIDOS = new Set<string>(PAPEIS.map((p) => p.v));

export const ESTADOS_CIVIS = [
  { v: "solteiro", t: "Solteiro(a)" },
  { v: "casado", t: "Casado(a)" },
  { v: "uniao_estavel", t: "União estável" },
  { v: "divorciado", t: "Divorciado(a)" },
  { v: "separado", t: "Separado(a) judicialmente" },
  { v: "viuvo", t: "Viúvo(a)" },
] as const;
export const ESTADOS_CIVIS_VALIDOS = new Set<string>(ESTADOS_CIVIS.map((e) => e.v));
export const COM_CONJUGE = new Set(["casado", "uniao_estavel"]);

export const REGIMES = [
  { v: "comunhao_parcial", t: "Comunhão parcial de bens" },
  { v: "comunhao_universal", t: "Comunhão universal de bens" },
  { v: "separacao_total", t: "Separação total de bens" },
  { v: "separacao_obrigatoria", t: "Separação obrigatória de bens" },
  { v: "participacao_aquestos", t: "Participação final nos aquestos" },
] as const;
export const REGIMES_VALIDOS = new Set<string>(REGIMES.map((r) => r.v));

// ---- documentos das partes ----
export const TIPOS_DOC_PARTE = [
  { v: "identidade", t: "RG ou CNH", curto: "RG/CNH" },
  { v: "comprovante_endereco", t: "Comprovante de endereço", curto: "Comprovante" },
  { v: "certidao_estado_civil", t: "Certidão de casamento ou nascimento", curto: "Certidão" },
  { v: "contrato_social", t: "Contrato social", curto: "Contrato social" },
  { v: "cartao_cnpj", t: "Cartão CNPJ", curto: "Cartão CNPJ" },
  { v: "matricula_fiador", t: "Matrícula do imóvel do fiador", curto: "Matrícula" },
] as const;
export type TipoDocParte = (typeof TIPOS_DOC_PARTE)[number]["v"];
export const TIPOS_DOC_PARTE_VALIDOS = new Set<string>(TIPOS_DOC_PARTE.map((t) => t.v));

export function rotuloDoc(tipo: string | null | undefined, curto = false): string {
  const t = TIPOS_DOC_PARTE.find((x) => x.v === tipo);
  return t ? (curto ? t.curto : t.t) : "Documento";
}

// quais documentos a tela pede para cada parte
export function slotsDocs(papel: Papel, tipo: TipoPessoa): { tipo: TipoDocParte; rotulo: string }[] {
  if (tipo === "PJ") {
    return [
      { tipo: "contrato_social", rotulo: "Contrato social" },
      { tipo: "cartao_cnpj", rotulo: "Cartão CNPJ" },
      { tipo: "identidade", rotulo: "RG ou CNH do representante" },
    ];
  }
  const s: { tipo: TipoDocParte; rotulo: string }[] = [
    { tipo: "identidade", rotulo: "RG ou CNH" },
    { tipo: "comprovante_endereco", rotulo: "Comprovante de endereço" },
    { tipo: "certidao_estado_civil", rotulo: "Certidão de casamento ou nascimento" },
  ];
  if (papel === "fiador") s.push({ tipo: "matricula_fiador", rotulo: "Matrícula do imóvel" });
  return s;
}

// ---- formatação ----
export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function fmtCpfCnpj(v: unknown): string {
  const d = soDigitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return String(v ?? "");
}

export function tipoPorDocumento(v: unknown): TipoPessoa {
  return soDigitos(v).length === 14 ? "PJ" : "PF";
}

function limpo(v: unknown): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s && !/^(null|undefined|n\/?a|-)$/i.test(s) ? s : null;
}

// "Rua X, nº 12, apto 3, Bairro, Cidade/UF, CEP 00000-000"
export function montarEndereco(e: {
  logradouro?: unknown; numero?: unknown; complemento?: unknown; bairro?: unknown;
  cidade?: unknown; uf?: unknown; cep?: unknown;
}): string | null {
  const log = limpo(e.logradouro);
  if (!log) return null;
  const partes = [log];
  const num = limpo(e.numero);
  if (num) partes.push(/^\d/.test(num) ? `nº ${num}` : num);
  const comp = limpo(e.complemento);
  if (comp) partes.push(comp);
  const bai = limpo(e.bairro);
  if (bai) partes.push(bai);
  const cid = limpo(e.cidade);
  const uf = limpo(e.uf);
  if (cid || uf) partes.push([cid, uf].filter(Boolean).join("/"));
  const cep = soDigitos(e.cep);
  if (cep.length === 8) partes.push(`CEP ${cep.slice(0, 5)}-${cep.slice(5)}`);
  return partes.join(", ");
}

// ---- normalização (API) ----
export function normalizarParte(b: any): { ok: true; parte: Parte } | { ok: false; error: string } {
  const papel = String(b?.papel || "");
  if (!PAPEIS_VALIDOS.has(papel)) return { ok: false, error: "Papel inválido." };
  const tipo: TipoPessoa = b?.tipo_pessoa === "PJ" ? "PJ" : "PF";
  const nome = limpo(b?.nome);
  if (!nome) return { ok: false, error: tipo === "PJ" ? "Informe a razão social." : "Informe o nome." };
  const t = (v: unknown, max = 300) => {
    const s = limpo(v);
    return s ? s.slice(0, max) : null;
  };
  const doc = soDigitos(b?.cpf_cnpj);
  if (doc && doc.length !== (tipo === "PJ" ? 14 : 11)) {
    return { ok: false, error: tipo === "PJ" ? "CNPJ deve ter 14 dígitos." : "CPF deve ter 11 dígitos." };
  }
  const ec = String(b?.estado_civil || "");
  const rb = String(b?.regime_bens || "");
  const genero = b?.genero === "M" || b?.genero === "F" ? b.genero : null;

  let conjuge: Conjuge | null = null;
  if (tipo === "PF" && COM_CONJUGE.has(ec) && b?.conjuge && typeof b.conjuge === "object") {
    const c = {
      nome: t(b.conjuge.nome, 200),
      cpf: soDigitos(b.conjuge.cpf) ? fmtCpfCnpj(b.conjuge.cpf) : null,
      rg: t(b.conjuge.rg, 60),
      nacionalidade: t(b.conjuge.nacionalidade, 60),
      profissao: t(b.conjuge.profissao, 100),
    };
    if (Object.values(c).some(Boolean)) conjuge = c;
  }

  let imoveis: ImovelGarantia[] | null = null;
  if (papel === "fiador" && Array.isArray(b?.imoveis)) {
    const l = b.imoveis
      .map((i: any) => ({
        cartorio: t(i?.cartorio, 300),
        matricula: t(i?.matricula, 40),
        descricao: limpo(i?.descricao)?.slice(0, 4000) || null,
      }))
      .filter((i: ImovelGarantia) => i.cartorio || i.matricula || i.descricao)
      .slice(0, 10);
    if (l.length) imoveis = l;
  }

  return {
    ok: true,
    parte: {
      papel: papel as Papel,
      tipo_pessoa: tipo,
      nome: nome.slice(0, 250),
      cpf_cnpj: doc ? fmtCpfCnpj(doc) : null,
      rg: tipo === "PF" ? t(b?.rg, 60) : null,
      genero: tipo === "PF" ? genero : null,
      nacionalidade: tipo === "PF" ? t(b?.nacionalidade, 60) : null,
      estado_civil: tipo === "PF" && ESTADOS_CIVIS_VALIDOS.has(ec) ? ec : null,
      regime_bens: tipo === "PF" && COM_CONJUGE.has(ec) && REGIMES_VALIDOS.has(rb) ? rb : null,
      profissao: tipo === "PF" ? t(b?.profissao, 100) : null,
      email: t(b?.email, 200),
      telefone: t(b?.telefone, 40),
      endereco: t(b?.endereco, 400),
      representacao: tipo === "PJ" ? t(b?.representacao, 1500) : null,
      conjuge,
      imoveis,
    },
  };
}

// ---- leitura automática -> campos ----
export type Divergencia = { campo: string; rotulo: string; atual: string; lido: string; aplicar: (p: Parte) => Parte };

const comparavel = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

function semelhante(a: unknown, b: unknown) {
  const x = comparavel(a), y = comparavel(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

const NACIONALIDADE: Record<string, string> = { M: "brasileiro", F: "brasileira" };

function rgComOrgao(d: any): string | null {
  const rg = limpo(d?.rg);
  if (!rg) return null;
  const org = limpo(d?.rg_orgao);
  return org && !rg.toUpperCase().includes(org.toUpperCase().split("/")[0]) ? `${rg} ${org}` : rg;
}

export function textoRepresentacao(adm: any): string | null {
  const nome = limpo(adm?.nome);
  if (!nome) return null;
  const cargo = limpo(adm?.cargo);
  const pedacos = [
    `neste ato representada por ${cargo ? "seu(sua) " + cargo.toLowerCase() + " " : ""}${nome}`,
    limpo(adm?.nacionalidade),
    limpo(adm?.estado_civil),
    limpo(adm?.profissao),
  ].filter(Boolean) as string[];
  const rg = rgComOrgao(adm);
  if (rg) pedacos.push(`portador(a) do RG nº ${rg}`);
  const cpf = soDigitos(adm?.cpf);
  if (cpf.length === 11) pedacos.push(`inscrito(a) no CPF sob nº ${fmtCpfCnpj(cpf)}`);
  return pedacos.join(", ");
}

// Preenche os campos vazios com o que o documento trouxe; o que já estava preenchido
// e diverge volta como sugestão (a pessoa decide na tela).
export function aplicarLeitura(
  parte: Parte,
  tipo: string,
  dados: any
): { parte: Parte; preenchidos: string[]; divergencias: Divergencia[] } {
  let p: Parte = { ...parte, conjuge: parte.conjuge ? { ...parte.conjuge } : null, imoveis: parte.imoveis ? [...parte.imoveis] : null };
  const preenchidos: string[] = [];
  const divergencias: Divergencia[] = [];
  if (!dados || typeof dados !== "object") return { parte: p, preenchidos, divergencias };

  const campo = (k: keyof Parte, rotulo: string, valor: string | null | undefined) => {
    const v = limpo(valor);
    if (!v) return;
    const atual = limpo(p[k] as any);
    if (!atual) {
      p = { ...p, [k]: v };
      preenchidos.push(rotulo);
    } else if (!semelhante(atual, v)) {
      divergencias.push({ campo: String(k), rotulo, atual, lido: v, aplicar: (x) => ({ ...x, [k]: v }) });
    }
  };

  if (tipo === "identidade") {
    if (p.tipo_pessoa === "PJ") {
      // RG/CNH do representante da empresa
      const rep = textoRepresentacao({ nome: dados.nome, cpf: dados.cpf, rg: dados.rg, rg_orgao: dados.rg_orgao, nacionalidade: dados.nacionalidade });
      if (rep && !limpo(p.representacao)) {
        p.representacao = rep;
        preenchidos.push("Representação");
      }
    } else {
      campo("nome", "Nome", dados.nome);
      const cpf = soDigitos(dados.cpf);
      if (cpf.length === 11) campo("cpf_cnpj", "CPF", fmtCpfCnpj(cpf));
      campo("rg", "RG", rgComOrgao(dados));
      const g = dados.genero === "M" || dados.genero === "F" ? dados.genero : null;
      if (g && !p.genero) {
        p.genero = g;
        preenchidos.push("Gênero");
      }
      const nac = limpo(dados.nacionalidade);
      const nacTxt = nac && /^brasil/i.test(nac) ? NACIONALIDADE[g || p.genero || "M"] : nac;
      campo("nacionalidade", "Nacionalidade", nacTxt);
    }
  } else if (tipo === "comprovante_endereco") {
    campo("endereco", p.tipo_pessoa === "PJ" ? "Sede" : "Endereço", montarEndereco(dados));
  } else if (tipo === "certidao_estado_civil") {
    const ec = String(dados.situacao_atual || "");
    if (ESTADOS_CIVIS_VALIDOS.has(ec)) campo("estado_civil", "Estado civil", ec);
    const rb = String(dados.regime_bens || "");
    if (COM_CONJUGE.has(p.estado_civil || ec) && REGIMES_VALIDOS.has(rb)) campo("regime_bens", "Regime de bens", rb);
    if (COM_CONJUGE.has(p.estado_civil || ec) && Array.isArray(dados.conjuges)) {
      // o cônjuge é o nome da certidão que menos se parece com o da própria parte
      const tokens = (v: unknown) =>
        new Set(String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2));
      const meus = tokens(p.nome);
      const pontos = (c: any) => {
        const t = tokens([c?.nome_antes, c?.nome_depois, c?.nome_atual].filter(Boolean).join(" "));
        let n = 0;
        for (const x of t) if (meus.has(x)) n++;
        return n;
      };
      const ordenados = [...dados.conjuges].filter(Boolean).sort((a: any, b: any) => pontos(a) - pontos(b));
      const outro =
        ordenados.length === 1
          ? pontos(ordenados[0]) === 0 ? ordenados[0] : null
          : ordenados.length > 1 && pontos(ordenados[0]) < pontos(ordenados[1]) ? ordenados[0] : null;
      const nomeC = limpo(outro?.nome_atual || outro?.nome_depois || outro?.nome_antes);
      if (nomeC) {
        const c = p.conjuge || {};
        if (!limpo(c.nome)) {
          p.conjuge = { ...c, nome: nomeC };
          preenchidos.push("Nome do cônjuge");
        } else if (!semelhante(c.nome, nomeC)) {
          divergencias.push({
            campo: "conjuge.nome", rotulo: "Nome do cônjuge", atual: String(c.nome), lido: nomeC,
            aplicar: (x) => ({ ...x, conjuge: { ...(x.conjuge || {}), nome: nomeC } }),
          });
        }
        const cpfC = soDigitos(outro?.cpf);
        if (cpfC.length === 11 && !limpo(p.conjuge?.cpf)) {
          p.conjuge = { ...(p.conjuge || {}), cpf: fmtCpfCnpj(cpfC) };
          preenchidos.push("CPF do cônjuge");
        }
      }
    }
  } else if (tipo === "contrato_social" || tipo === "cartao_cnpj") {
    if (p.tipo_pessoa === "PJ") {
      campo("nome", "Razão social", dados.razao_social);
      const cnpj = soDigitos(dados.cnpj);
      if (cnpj.length === 14) campo("cpf_cnpj", "CNPJ", fmtCpfCnpj(cnpj));
      campo("endereco", "Sede", montarEndereco(dados));
      const adm = Array.isArray(dados.administradores) ? dados.administradores[0] : null;
      const rep = adm ? textoRepresentacao(adm) : null;
      if (rep && !limpo(p.representacao)) {
        p.representacao = rep;
        preenchidos.push("Representação");
      }
    }
  } else if (tipo === "matricula_fiador") {
    const im: ImovelGarantia = {
      cartorio: limpo(dados.cartorio),
      matricula: limpo(dados.matricula),
      descricao: limpo(dados.descricao),
    };
    if (im.matricula || im.descricao) {
      const lista = p.imoveis || [];
      const ja = lista.findIndex((x) => im.matricula && soDigitos(x.matricula) === soDigitos(im.matricula));
      if (ja < 0) {
        p.imoveis = [...lista.filter((x) => x.cartorio || x.matricula || x.descricao), im];
        preenchidos.push("Imóvel em garantia");
      } else {
        const atual = lista[ja];
        const novo = {
          cartorio: atual.cartorio || im.cartorio,
          matricula: atual.matricula || im.matricula,
          descricao: atual.descricao || im.descricao,
        };
        p.imoveis = lista.map((x, i) => (i === ja ? novo : x));
        if (novo.descricao !== atual.descricao || novo.cartorio !== atual.cartorio) preenchidos.push("Imóvel em garantia");
      }
    }
  }

  return { parte: p, preenchidos, divergencias };
}

// resumo de uma linha para o cartão fechado
export function resumoParte(p: Parte): string {
  const ec = ESTADOS_CIVIS.find((e) => e.v === p.estado_civil)?.t;
  const itens =
    p.tipo_pessoa === "PJ"
      ? [p.cpf_cnpj ? "CNPJ " + p.cpf_cnpj : null, p.endereco]
      : [p.cpf_cnpj ? "CPF " + p.cpf_cnpj : null, ec, p.profissao];
  return itens.filter(Boolean).join(" · ");
}

// o que falta para a qualificação no contrato
export function pendencias(p: Parte): string[] {
  const f: string[] = [];
  if (p.tipo_pessoa === "PJ") {
    if (!p.cpf_cnpj) f.push("CNPJ");
    if (!p.endereco) f.push("sede");
    if (!p.representacao) f.push("representação");
  } else {
    if (!p.cpf_cnpj) f.push("CPF");
    if (!p.rg) f.push("RG");
    if (!p.nacionalidade) f.push("nacionalidade");
    if (!p.estado_civil) f.push("estado civil");
    if (!p.profissao) f.push("profissão");
    if (!p.endereco) f.push("endereço");
    if (p.estado_civil && COM_CONJUGE.has(p.estado_civil) && p.papel === "fiador" && !p.conjuge?.nome) f.push("cônjuge");
  }
  return f;
}

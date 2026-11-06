// Contrato de associação do corretor novato (modelo "Contrato de Associação -
// Corretor PF"). O modelo é o mesmo para a REMAX Ville e para o team da Samia:
// só muda a empresa contratante (e quem assina por ela).
//
// O PDF é preenchido pelo n8n (WF-R1, acao "pdf", modelo em base_conhecimento) e
// enviado ao Clicksign pelo WF-R1 (acao "assinar_pdf" → Enviar_PDF_Assinatura).
// Empresa, quem assina por ela e as testemunhas ficam em onb_contrato_partes.

export type Empresa = 'ville' | 'samia';
export const EMPRESAS: { id: Empresa; nome: string }[] = [
  { id: 'ville', nome: 'REMAX Ville' },
  { id: 'samia', nome: 'Team Samia (PJ da Samia)' },
];

// Plano de partilha: % do associado, mensalidade e os textos por extenso.
export type Faixa = 40 | 45 | 60 | 70;
export const FAIXAS: Record<Faixa, { mensal: string; mensalExt: string; assoc: string; imob: string; imobPct: number }> = {
  40: { mensal: '250,00', mensalExt: 'duzentos e cinquenta reais', assoc: 'quarenta', imob: 'sessenta', imobPct: 60 },
  45: { mensal: '300,00', mensalExt: 'trezentos reais', assoc: 'quarenta e cinco', imob: 'cinquenta e cinco', imobPct: 55 },
  60: { mensal: '3.000,00', mensalExt: 'três mil reais', assoc: 'sessenta', imob: 'quarenta', imobPct: 40 },
  70: { mensal: '5.000,00', mensalExt: 'cinco mil reais', assoc: 'setenta', imob: 'trinta', imobPct: 30 },
};
// Team Samia: o contrato é com a PJ da Samia e a partilha é outra (o restante fica com a Ville).
// A mensalidade é a mesma da faixa.
const SAMIA: Partial<Record<Faixa, { imob: string; imobPct: number }>> = {
  40: { imob: 'vinte', imobPct: 20 },
  45: { imob: 'quinze', imobPct: 15 },
};
export const faixasDe = (e: Empresa): Faixa[] => (e === 'samia' ? [40, 45] : [40, 45, 60, 70]);
export function partilha(e: Empresa, f: Faixa): { imob: string; imobPct: number } {
  return e === 'samia' ? SAMIA[f]! : { imob: FAIXAS[f].imob, imobPct: FAIXAS[f].imobPct };
}
export const FAIXA_ROTULO = (f: Faixa, e: Empresa = 'ville') =>
  `${f}% corretor · ${partilha(e, f).imobPct}% ${e === 'samia' ? 'Samia' : 'Ville'} · mensalidade R$ ${FAIXAS[f].mensal}`;
const VENCIMENTO = { dia: '05', ext: 'cinco' };
const FORO = { comarca: 'São Paulo', estado: 'São Paulo' };

export type DadosAssociado = {
  nome: string;
  nacionalidade: string;
  estado_civil: string;
  creci: string;
  creci_uf: string;
  rg: string;
  rg_orgao: string;
  rg_uf: string;
  cpf: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  email: string;
  telefone: string;
};

export type ContratoNovato = { empresa: Empresa; faixa: Faixa; dados: DadosAssociado };

export type Parte = {
  razao: string; cnpj: string; endereco: string; numero: string; complemento: string; bairro: string;
  municipio: string; estado: string; creci_uf: string; creci: string;
  assina: { nome: string; email: string; phone: string; cpf: string };
};
export type Testemunha = { nome: string; rg: string; cpf: string; email: string; phone: string };

export const VAZIO: DadosAssociado = {
  nome: '', nacionalidade: 'brasileira', estado_civil: '', creci: '', creci_uf: 'SP', rg: '', rg_orgao: 'SSP', rg_uf: 'SP',
  cpf: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: 'São Paulo', estado: 'SP', email: '', telefone: '',
};

const UFS: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF',
  'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC',
  'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const uf = (s: string) => {
  const t = String(s ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return UFS[semAcento(t)] ?? t;
};
const dig = (s: string) => String(s ?? '').replace(/\D/g, '');
export const fmtCpf = (s: string) => {
  const d = dig(s);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(s ?? '').trim();
};

// Dados copiados do hub.minharemax.com pelo favorito "Copiar para o painel".
export type DadosHub = Partial<Record<'nome' | 'cpf' | 'rg' | 'email' | 'telefone' | 'nacionalidade' | 'estado_civil' | 'profissao' | 'cep' | 'endereco' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'estado' | 'creci', string>>;

export function lerHub(texto: string): DadosHub | null {
  const t = String(texto ?? '').trim();
  const i = t.indexOf('HUBREMAX');
  if (i < 0) return null;
  try {
    const d = JSON.parse(t.slice(i + 8));
    return d && typeof d === 'object' ? (d as DadosHub) : null;
  } catch {
    return null;
  }
}

// O hub às vezes guarda o RG com o órgão junto ("349758840 SESP/SP").
function separaRg(rg: string): { rg: string; orgao: string; uf: string } {
  const t = String(rg ?? '').trim();
  const m = t.match(/^([\dXx.\-\s]+?)\s*[-/]?\s*([A-Za-z]{2,6})\s*[/-]?\s*([A-Za-z]{2})?$/);
  if (m && /\d{5,}/.test(m[1].replace(/\D/g, ''))) return { rg: m[1].trim(), orgao: m[2].toUpperCase(), uf: (m[3] || '').toUpperCase() };
  return { rg: t, orgao: '', uf: '' };
}

const cap = (s: string) => String(s ?? '').trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());

export function mesclarHub(atual: DadosAssociado, h: DadosHub): DadosAssociado {
  const r = separaRg(h.rg ?? '');
  const v = (x: string | undefined, d: string) => (String(x ?? '').trim() ? String(x).trim() : d);
  const creci = String(h.creci ?? '').trim();
  return {
    ...atual,
    nome: v(h.nome && cap(h.nome), atual.nome),
    cpf: v(h.cpf && fmtCpf(h.cpf), atual.cpf),
    rg: v(r.rg, atual.rg),
    rg_orgao: v(r.orgao, atual.rg_orgao),
    rg_uf: v(r.uf, atual.rg_uf),
    email: v(h.email && h.email.toLowerCase(), atual.email),
    telefone: v(h.telefone, atual.telefone),
    nacionalidade: v(h.nacionalidade && h.nacionalidade.toLowerCase(), atual.nacionalidade),
    estado_civil: v(h.estado_civil && h.estado_civil.toLowerCase(), atual.estado_civil),
    endereco: v(h.endereco, atual.endereco),
    numero: v(h.numero, atual.numero),
    complemento: v(h.complemento, atual.complemento),
    bairro: v(h.bairro, atual.bairro),
    cidade: v(h.cidade, atual.cidade),
    estado: v(h.estado && uf(h.estado), atual.estado),
    creci: v(creci.replace(/[^\dA-Za-z.\-]/g, ''), atual.creci),
  };
}

export const OBRIGATORIOS: [keyof DadosAssociado, string][] = [
  ['nome', 'nome'], ['nacionalidade', 'nacionalidade'], ['estado_civil', 'estado civil'],
  ['rg', 'RG'], ['cpf', 'CPF'], ['endereco', 'endereço'], ['numero', 'número'], ['bairro', 'bairro'],
  ['cidade', 'cidade'], ['estado', 'estado'],
];

export function faltando(d: DadosAssociado): string[] {
  const f = OBRIGATORIOS.filter(([k]) => !String(d[k] ?? '').trim()).map(([, r]) => r);
  if (String(d.cpf ?? '').trim() && dig(d.cpf).length !== 11) f.push('CPF válido');
  return f;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Campos semânticos do modelo (o mapa para os nomes do PDF está em base_conhecimento).
export function camposContrato(c: ContratoNovato, p: Parte, ts: Testemunha[], hoje: string): Record<string, string> {
  const d = c.dados;
  const f = FAIXAS[c.faixa];
  const pt = partilha(c.empresa, c.faixa);
  const [ano, mes, dia] = hoje.split('-');
  const t1 = ts[0] ?? { nome: '', rg: '', cpf: '' };
  const t2 = ts[1] ?? { nome: '', rg: '', cpf: '' };
  const up = (s: string) => String(s ?? '').trim();
  return {
    imob_razao: p.razao, imob_endereco: p.endereco, imob_numero: p.numero, imob_complemento: p.complemento,
    imob_bairro: p.bairro, imob_municipio: p.municipio, imob_estado: p.estado, imob_creci_uf: p.creci_uf,
    imob_creci: p.creci, imob_cnpj: p.cnpj,
    assoc_nome: up(d.nome), assoc_nacionalidade: up(d.nacionalidade), assoc_estado_civil: up(d.estado_civil),
    // estagiário ainda sem CRECI: os dois campos ficam em branco
    assoc_creci_uf: up(d.creci) ? uf(d.creci_uf) : '', assoc_creci: up(d.creci), assoc_rg: up(d.rg), assoc_rg_orgao: up(d.rg_orgao),
    assoc_rg_uf: uf(d.rg_uf), assoc_cpf: fmtCpf(d.cpf), assoc_endereco: up(d.endereco), assoc_numero: up(d.numero),
    assoc_complemento: up(d.complemento), assoc_bairro: up(d.bairro), assoc_municipio: up(d.cidade), assoc_estado: uf(d.estado),
    mensalidade: f.mensal, mensalidade_extenso: f.mensalExt,
    perc_associado: String(c.faixa), perc_associado_extenso: f.assoc,
    perc_imob: String(pt.imobPct), perc_imob_extenso: pt.imob,
    vencimento_dia: VENCIMENTO.dia, vencimento_extenso: VENCIMENTO.ext,
    foro_comarca: FORO.comarca, foro_estado: FORO.estado,
    assinatura_cidade: 'São Paulo', assinatura_dia: dia, assinatura_mes: MESES[Number(mes) - 1], assinatura_ano: ano,
    assinatura_associado: up(d.nome).toUpperCase(), assinatura_imob: p.razao,
    test1_nome: t1.nome, test1_rg: t1.rg, test1_cpf: t1.cpf,
    test2_nome: t2.nome, test2_rg: t2.rg, test2_cpf: t2.cpf,
  };
}

// Favorito do navegador para o hub.minharemax.com (tela Usuários → Editar):
// copia os dados do cadastro para colar no painel.
export const FAVORITO_HUB =
  "javascript:(()=>{const g=n=>(document.querySelector(`[name=\"${n}\"]`)||{}).value||'';const s=l=>{const lb=[...document.querySelectorAll('label')].find(x=>x.innerText.trim().replace(/\\s*\\*$/,'')===l);let el=lb,sel=null;while(el&&!sel){el=el.parentElement;sel=el&&el.querySelector('select');}return sel?((sel.options[sel.selectedIndex]||{}).text||sel.value||''):''};if(!document.querySelector('[name=\"cpf\"]')){alert('Abra o cadastro do corretor no hub (Usuários → Editar) e clique de novo.');return;}const d={nome:g('name'),cpf:g('cpf'),rg:g('rg'),email:g('email'),telefone:g('phone'),nacionalidade:g('nationality'),estado_civil:s('Estado civil'),profissao:g('ocupation'),cep:g('cep'),endereco:g('address'),numero:g('number'),complemento:g('complement'),bairro:g('neighbourhood'),cidade:g('city'),estado:s('Estado'),creci:g('creci')};const t='HUBREMAX'+JSON.stringify(d);const ok=()=>alert('Dados de '+d.nome+' copiados. Volte ao painel e clique em \"Colar dados do hub\".');navigator.clipboard.writeText(t).then(ok,()=>prompt('Copie este texto (Ctrl+C) e cole no painel:',t));})()";

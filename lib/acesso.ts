// Catálogo das telas do painel e regras de acesso por perfil.
// Arquivo "puro" (sem banco nem next/*): usado pelo proxy, pelas páginas e pela
// tela de Usuários.
//
// Modelo (out/2026):
//  - perfis_acesso: perfis nomeados (Administrador, Corretor e os personalizados),
//    cada um com a lista de telas e o alcance em Diligências e no Funil do SDR.
//  - perfis (uma linha por pessoa): guarda o perfil_acesso_id e uma CÓPIA das
//    regras do perfil (telas, escopos, is_admin e os pode_* antigos). A cópia é
//    regravada sempre que o perfil muda, para o proxy decidir lendo uma linha só
//    e para o código antigo (pode_*, is_admin) continuar valendo sem mudança.
//  - Linhas antigas sem perfil (telas = null) continuam pelas flags pode_*.

export type Tela =
  | 'diligencias'
  | 'cobrancas'
  | 'repasse'
  | 'notas'
  | 'pagamentos'
  | 'captacao'
  | 'sdr'
  | 'estudo'
  | 'representacao'
  | 'postagens'
  | 'vitrine'
  | 'locador'
  | 'treinamento'
  | 'usuarios';

export type Area = 'venda' | 'administracao' | 'sistema';

export const AREAS: { chave: Area; titulo: string; descricao: string }[] = [
  { chave: 'venda', titulo: 'Venda', descricao: 'Do lead à comissão.' },
  { chave: 'administracao', titulo: 'Administração', descricao: 'Contratos de locação administrados.' },
  { chave: 'sistema', titulo: 'Sistema', descricao: 'Acesso ao painel.' },
];

export type FlagLegada =
  | 'pode_diligencias'
  | 'pode_cobrancas'
  | 'pode_repasse'
  | 'pode_notas'
  | 'pode_pagamentos'
  | 'pode_captacao'
  | 'pode_postagens';

export type DefTela = {
  chave: Tela;
  titulo: string;
  area: Area;
  // flag antiga equivalente (linhas sem perfil e sincronização para o código antigo)
  flag: FlagLegada | null;
  // só o perfil Administrador pode ter (não aparece nos personalizados)
  soAdmin?: boolean;
};

export const TELAS: DefTela[] = [
  { chave: 'sdr', titulo: 'Funil do SDR', area: 'venda', flag: null },
  { chave: 'captacao', titulo: 'Captação', area: 'venda', flag: 'pode_captacao' },
  { chave: 'estudo', titulo: 'Estudo de mercado', area: 'venda', flag: 'pode_postagens' },
  { chave: 'representacao', titulo: 'Contrato de representação', area: 'venda', flag: null },
  { chave: 'diligencias', titulo: 'Diligências', area: 'venda', flag: 'pode_diligencias' },
  { chave: 'postagens', titulo: 'Postagens', area: 'venda', flag: 'pode_postagens' },
  { chave: 'vitrine', titulo: 'Vitrine Google Ads', area: 'venda', flag: null },
  // uma permissão cobre Cobranças/contratos (Administração) e a Cobrança com split (Venda)
  { chave: 'cobrancas', titulo: 'Cobranças, contratos e cobrança com split', area: 'administracao', flag: 'pode_cobrancas' },
  { chave: 'repasse', titulo: 'Repasse', area: 'administracao', flag: 'pode_repasse' },
  { chave: 'pagamentos', titulo: 'Pagamentos', area: 'administracao', flag: 'pode_pagamentos' },
  // uma permissão cobre as Notas da administração e as Notas de comissão (Venda)
  { chave: 'notas', titulo: 'Notas da administração e de comissão', area: 'administracao', flag: 'pode_notas' },
  { chave: 'locador', titulo: 'Portal do locador', area: 'administracao', flag: null },
  // Acompanhamento dos novatos na trilha do Max (IA de treinamento, WhatsApp 5192-8192).
  { chave: 'treinamento', titulo: 'Treinamento de novatos', area: 'sistema', flag: null, soAdmin: true },
  { chave: 'usuarios', titulo: 'Usuários e perfis', area: 'sistema', flag: null, soAdmin: true },
];

export const TELA_CHAVES = TELAS.map((t) => t.chave);

export type EscopoDiligencias = 'todas' | 'proprias';
export type EscopoSdr = 'todos' | 'proprio';

// O mínimo que as regras precisam saber da pessoa (linha de public.perfis).
export type PerfilAcesso = {
  is_admin: boolean;
  ativo: boolean;
  telas?: string[] | null;
  escopo_diligencias?: string | null;
  escopo_sdr?: string | null;
} & Partial<Record<FlagLegada, boolean | null>>;

export function podeTela(p: PerfilAcesso | null | undefined, tela: Tela): boolean {
  if (!p || !p.ativo) return false;
  if (p.is_admin) return true;
  if (Array.isArray(p.telas)) return p.telas.includes(tela);
  // linha antiga, sem perfil: vale a flag
  const def = TELAS.find((t) => t.chave === tela);
  return !!(def?.flag && p[def.flag]);
}

// Diligências: 'proprias' = só as diligências ligadas ao corretor da pessoa.
export function escopoDiligencias(p: PerfilAcesso | null | undefined): EscopoDiligencias {
  if (!p || p.is_admin) return 'todas';
  return p.escopo_diligencias === 'proprias' ? 'proprias' : 'todas';
}

// Funil do SDR: 'proprio' = só os leads oferecidos/atribuídos ao corretor da pessoa.
export function escopoSdr(p: PerfilAcesso | null | undefined): EscopoSdr {
  if (!p || p.is_admin) return 'todos';
  return p.escopo_sdr === 'proprio' ? 'proprio' : 'todos';
}

// Regras de um perfil nomeado -> colunas copiadas em public.perfis.
export type RegrasPerfil = {
  admin: boolean;
  telas: string[];
  escopo_diligencias: EscopoDiligencias;
  escopo_sdr: EscopoSdr;
};

export function colunasDoPerfil(r: RegrasPerfil) {
  const telas = r.admin ? [...TELA_CHAVES] : r.telas.filter((t) => TELA_CHAVES.includes(t as Tela) && !TELAS.find((d) => d.chave === t)?.soAdmin);
  const tem = (t: Tela) => telas.includes(t);
  return {
    is_admin: r.admin,
    telas,
    escopo_diligencias: r.admin ? 'todas' : r.escopo_diligencias,
    escopo_sdr: r.admin ? 'todos' : r.escopo_sdr,
    pode_diligencias: tem('diligencias'),
    pode_cobrancas: tem('cobrancas'),
    pode_repasse: tem('repasse'),
    pode_notas: tem('notas'),
    pode_pagamentos: tem('pagamentos'),
    pode_captacao: tem('captacao'),
    // pode_postagens é lido por /postagens e /estudo no código antigo
    pode_postagens: tem('postagens') || tem('estudo'),
  };
}

// 05/11: funil de recrutamento com etapas (painel /sdr?f=recrutamento).
// Etapa gravada em public.recrutamento_candidatos (uma linha por telefone); sem linha = "para decidir".

export type EtapaRec = 'decidir' | 'contato' | 'entrevista' | 'pensando' | 'entrou' | 'descartado';

export const ETAPAS_REC: { k: EtapaRec | 'fora'; rotulo: string }[] = [
  { k: 'decidir', rotulo: 'Para decidir' },
  { k: 'contato', rotulo: 'Em contato' },
  { k: 'entrevista', rotulo: 'Entrevistas' },
  { k: 'pensando', rotulo: 'Pensando' },
  { k: 'entrou', rotulo: 'Entraram' },
  { k: 'descartado', rotulo: 'Descartados' },
  { k: 'fora', rotulo: 'Fora de SP' },
];

export const MOTIVOS_DESCARTE = [
  'Perfil CLT / busca emprego',
  'Só quer o curso',
  'Fora de SP',
  'Não respondeu',
  'Não compareceu à entrevista',
  'Desistiu',
  'Outro',
];

const norm = (x: string | null | undefined) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Mesma regra do fluxo "Recrutamento — Landing Seja REMAX" (n8n, 25/10).
export function foraDeSp(bairro: string | null | undefined): boolean {
  const m = norm(bairro);
  if (!m) return false;
  return /\b(guarulhos|osasco|barueri|carapicuiba|cotia|taboao da serra|embu|itapecerica|diadema|santo andre|sao bernardo|sao caetano|maua|ribeirao pires|rio grande da serra|ferraz de vasconcelos|poa|suzano|itaquaquecetuba|aruja|mogi das cruzes|caieiras|franco da rocha|francisco morato|cajamar|mairipora|santana de parnaiba|jandira|itapevi|juquitiba|vargem grande paulista|santa isabel|biritiba|salesopolis|guararema|pirapora|campinas|jundiai|sorocaba|santos|sao vicente|praia grande|guaruja|cubatao|bertioga|atibaia|braganca paulista|valinhos|vinhedo|indaiatuba|americana|piracicaba|sao jose dos campos|taubate|ribeirao preto|itanhaem|cibratel|mongagua|peruibe|ilhabela|ubatuba|caraguatatuba|sao sebastiao|rio de janeiro|belo horizonte|curitiba|salvador|recife|fortaleza|brasilia)\b/.test(m)
    || /(^|[\s,/-])(rj|mg|pr|sc|rs|ba|pe|ce|df|go|es|mt|ms|pa|am|ma|pb|rn|al|se|pi|to|ro|ac|ap|rr)\s*$/.test(m);
}

export type PerfilRec = 'Já é corretor' | 'Curso de corretor' | 'Começando (sem CRECI)' | 'Outra área' | 'Não informado';

// Etiqueta automática a partir do "momento" (texto livre) e do campo CRECI do formulário.
export function perfilCandidato(momento: string | null | undefined, creci: string | null | undefined): PerfilRec {
  const m = norm(momento);
  const c = norm(creci);
  if (/\b(curso|tti|estudando|matricul|faculdade de corretor|tecnico em transacoes)/.test(m)) return 'Curso de corretor';
  if (/(nao tem creci|sem creci|ainda nao|comecando|iniciar|inicio|entrando na area)/.test(m)) return 'Começando (sem CRECI)';
  if (c === 'sim' || /\b(corretor|corretora|imobiliaria|creci|autonom)/.test(m)) return 'Já é corretor';
  if (m) return 'Outra área';
  return c === 'nao' ? 'Começando (sem CRECI)' : 'Não informado';
}

export const telFmt = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };

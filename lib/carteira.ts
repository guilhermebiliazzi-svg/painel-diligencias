// 18/11: Carteira do corretor — acesso e leitura no servidor.
// Quem tem a tela "Contrato de representação" vê a própria carteira; a gestão (admin ou SDR com alcance
// "todos") vê a de todos e filtra por corretor. Os imóveis vêm do iList (n8n "Carteira — sincronizar imóveis
// do iList", todo dia às 6h40); o que o corretor registra (atividades, avaliação) fica em carteira_*.
import { exigirTela, corretorDaPessoa, podeTela, escopoSdr, getSessaoPerfil, type Perfil } from '@/lib/perfil';

export type ImovelCarteira = {
  id: number;
  ilist_listing_id: string | null;
  corretor_id: number | null;
  ilist_agent_nome: string | null;
  titulo: string | null;
  logradouro: string | null;
  numero: string | null;
  unidade: string | null;
  bairro: string | null;
  valor: number | null;
  comissao: number | null;
  area_m2: number | null;
  dorms: number | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  contrato_tipo: string | null;
  tem_contrato_doc: boolean | null;
  classificacao: 'A' | 'B' | 'C' | null;
  avaliacao: Record<string, number> | null;
  nota: string | null;
  sincronizado_em: string | null;
};

export type Atividade = {
  id: number;
  imovel_id: number;
  tipo: string;
  titulo: string | null;
  quando: string | null;
  feito_em: string | null;
  nota: string | null;
  link: string | null;
  criado_por: string | null;
  criado_em: string;
  cancelado_em: string | null;
};

export const COLS_IMOVEL =
  'id,ilist_listing_id,corretor_id,ilist_agent_nome,titulo,logradouro,numero,unidade,bairro,valor,comissao,area_m2,dorms,contrato_inicio,contrato_fim,contrato_tipo,tem_contrato_doc,classificacao,avaliacao,nota,sincronizado_em';

const ehGestao = (p: Perfil) => !!p.is_admin || (podeTela(p, 'sdr') && escopoSdr(p) === 'todos');

/** Página: exige a tela e diz se é gestão e qual o cadastro de corretor da pessoa. */
export async function acessoCarteira() {
  const perfil = await exigirTela('representacao');
  const eu = await corretorDaPessoa(perfil.email);
  return { perfil, gestao: ehGestao(perfil), eu };
}

/** Ações: mesma regra, sem redirecionar (devolve o motivo). */
export async function acessoCarteiraAcao(): Promise<{ email: string; gestao: boolean; euId: number | null } | { erro: string }> {
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return { erro: 'Faça login de novo.' };
  if (!perfil || !perfil.ativo || !podeTela(perfil, 'representacao')) return { erro: 'Sua conta não tem acesso à carteira.' };
  const eu = await corretorDaPessoa(email);
  return { email, gestao: ehGestao(perfil), euId: eu?.id ?? null };
}

export const enderecoCurto = (i: Pick<ImovelCarteira, 'logradouro' | 'numero' | 'unidade'>) =>
  [i.logradouro, i.numero].filter(Boolean).join(', ') + (i.unidade ? ` · ap ${i.unidade}` : '');

export const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export const brl = (v: number | null) =>
  v == null ? '—' : v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + ' mil';

export const dataBR = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

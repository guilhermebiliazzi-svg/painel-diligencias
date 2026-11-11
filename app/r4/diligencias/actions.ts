'use server';

import { redirect } from 'next/navigation';
import { r4Admin, r4Base, r4UsuarioAtual } from '@/lib/r4/supabase';
import { enviarAoMotor } from '@/lib/r4/motor';

export type ResultadoNova = { ok: boolean; msg: string } | null;

type PessoaPF = {
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  genero: string;
  mae: string;
  estado_civil: string;
};
type PessoaPJ = { nome: string; cnpj: string };

const so = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const txt = (s: unknown) => String(s ?? '').trim();

function cpfValido(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}
function cnpjValido(c: string) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((a, p, i) => a + Number(c[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

/** Cria a diligência no rquatro e manda para o motor (fluxo R4-01). */
export async function criarDiligencia(_prev: ResultadoNova, form: FormData): Promise<ResultadoNova> {
  const base = await r4Base();
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo) return { ok: false, msg: 'Sessão expirada. Entre de novo.' };

  const unidadeId = u.papel === 'superadmin' ? txt(form.get('unidade_id')) : u.unidade_id;
  if (!unidadeId) return { ok: false, msg: 'Escolha a unidade.' };

  const adm = r4Admin();
  const { data: un } = await adm
    .from('unidades')
    .select('id,nome,ativa,pasta_drive_id')
    .eq('id', unidadeId)
    .maybeSingle();
  if (!un || !un.ativa) return { ok: false, msg: 'Unidade inativa ou inexistente.' };
  if (!un.pasta_drive_id) {
    return { ok: false, msg: 'A pasta do Google Drive da unidade ainda não foi configurada. Fale com a administração do rquatro.' };
  }

  let pf: PessoaPF[] = [];
  let pj: PessoaPJ[] = [];
  try {
    pf = JSON.parse(String(form.get('pf') || '[]'));
    pj = JSON.parse(String(form.get('pj') || '[]'));
  } catch {
    return { ok: false, msg: 'Dados dos proprietários inválidos.' };
  }
  const endereco = txt(form.get('endereco')).replace(/\s+/g, ' ');
  const sql = txt(form.get('sql_iptu'))
    .split(/[,;\s]+/)
    .map((s) => s.replace(/[^\d.-]/g, ''))
    .filter((s) => so(s).length >= 10)
    .join(', ');

  if (endereco.length < 8) return { ok: false, msg: 'Informe o endereço completo do imóvel (com número e complemento).' };
  pf = pf.filter((p) => txt(p.nome) || so(p.cpf));
  pj = pj.filter((p) => txt(p.nome) || so(p.cnpj));
  if (!pf.length && !pj.length) return { ok: false, msg: 'Inclua ao menos um proprietário.' };

  for (const [i, p] of pf.entries()) {
    const n = `Pessoa física ${i + 1}`;
    if (!txt(p.nome)) return { ok: false, msg: `${n}: informe o nome.` };
    if (!cpfValido(so(p.cpf))) return { ok: false, msg: `${n}: CPF inválido.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txt(p.nascimento))) return { ok: false, msg: `${n}: informe a data de nascimento.` };
    if (!txt(p.mae)) return { ok: false, msg: `${n}: informe o nome da mãe (exigido pelas certidões criminais).` };
    if (p.genero !== 'M' && p.genero !== 'F') return { ok: false, msg: `${n}: informe o gênero.` };
  }
  for (const [i, p] of pj.entries()) {
    const n = `Empresa ${i + 1}`;
    if (!txt(p.nome)) return { ok: false, msg: `${n}: informe a razão social.` };
    if (!cnpjValido(so(p.cnpj))) return { ok: false, msg: `${n}: CNPJ inválido.` };
  }
  const cpfs = pf.map((p) => so(p.cpf));
  if (new Set(cpfs).size !== cpfs.length) return { ok: false, msg: 'Há CPF repetido entre os proprietários.' };

  const dados = {
    endereco,
    sql_iptu: sql || null,
    pf: pf.map((p) => ({ ...p, cpf: so(p.cpf), nome: txt(p.nome).toUpperCase(), mae: txt(p.mae).toUpperCase() })),
    pj: pj.map((p) => ({ nome: txt(p.nome).toUpperCase(), cnpj: so(p.cnpj) })),
  };

  const { data: dil, error: e1 } = await adm
    .from('diligencias')
    .insert({ unidade_id: un.id, criado_por: u.id, titulo: endereco, status: 'enviando', dados })
    .select('id')
    .single();
  if (e1 || !dil) return { ok: false, msg: `Não consegui registrar a diligência: ${e1?.message || 'erro'}` };

  // Formato do formulário do WF-01 (o R4-01 usa o mesmo "Montar Template").
  const corpo = {
    endereco,
    matriculas: [{ matricula_num: '', matricula_cartorio: '', matricula_iptu: sql }],
    vendedoresPF: dados.pf.map((p) => ({
      pf_nome: p.nome,
      pf_cpf: p.cpf,
      pf_rg: txt(p.rg),
      pf_data_nascimento: p.nascimento,
      pf_genero: p.genero,
      pf_nome_mae: p.mae,
      pf_estado_civil: txt(p.estado_civil),
      pf_regime_bens: '',
    })),
    vendedoresPJ: dados.pj.map((p) => ({ pj_nome: p.nome, pj_cnpj: p.cnpj, pj_representantes: [] })),
    compradoresPF: [],
    compradoresPJ: [],
    condominios: [],
    consumos: [],
    negocio: null,
    endereco_estruturado: null,
    r4: { unidade_id: un.id, unidade_nome: un.nome, diligencia_r4_id: dil.id, pasta_raiz: un.pasta_drive_id },
  };

  const r = await enviarAoMotor(corpo);
  if (!r.ok) {
    await adm.from('diligencias').update({ status: 'erro', erro: r.erro || 'falha no motor' }).eq('id', dil.id);
    return { ok: false, msg: `A diligência não foi iniciada: ${r.erro}` };
  }
  await adm
    .from('diligencias')
    .update({
      status: 'em_andamento',
      motor_id: r.id,
      erro: null,
      dados: { ...dados, pasta_drive_id: r.pasta_drive_id || null },
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', dil.id);
  redirect(`${base}/diligencias/${dil.id}?nova=1`);
}

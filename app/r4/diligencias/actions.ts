'use server';

import { r4Admin, r4UsuarioAtual } from '@/lib/r4/supabase';
import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { exigirDiligenciaR4 } from '@/lib/r4/diligencia';
import { enviarAoMotor } from '@/lib/r4/motor';

export type ResultadoNova = { ok: boolean; msg: string; id?: string } | null;

type Pessoa = {
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  genero: string;
  mae: string;
  nacionalidade: string;
  profissao: string;
  email: string;
};
type Conjuge = Pessoa & { participacao: string; registro: string };
type PF = Pessoa & { estado_civil: string; regime: string; conjuge: Conjuge };
type Rep = Pessoa & { papel: string; certidoes: boolean; estado_civil: string };
type PJ = { vinculo: string; nome: string; cnpj: string; reps: Rep[] };
type Mat = { numero: string; cartorio: string; sql: string };

const so = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const txt = (s: unknown) => String(s ?? '').trim();
const up = (s: unknown) => txt(s).toUpperCase();
const temConjuge = (ec: string) => ec === 'casado' || ec === 'uniao_estavel';
const ESTADOS = ['solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo', 'separado'];
const REGIMES = ['comunhao_parcial', 'comunhao_universal', 'separacao_total', 'participacao_final'];
const PARTICIPACOES = ['coproprietario', 'anuente_anterior', 'anuente_gratuito', 'indeterminado'];

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

/** Dados exigidos para emitir certidões de uma pessoa (as criminais pedem mãe, nascimento e gênero). */
function faltaParaCertidoes(p: Pessoa, n: string): string | null {
  if (!txt(p.nome)) return `${n}: informe o nome.`;
  if (!cpfValido(so(p.cpf))) return `${n}: CPF inválido.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txt(p.nascimento))) return `${n}: informe a data de nascimento.`;
  if (p.genero !== 'M' && p.genero !== 'F') return `${n}: informe o gênero.`;
  if (!txt(p.mae)) return `${n}: informe o nome da mãe (exigido pelas certidões criminais).`;
  return null;
}

/** Cria a diligência no rquatro e manda para o motor (fluxo R4-01). */
export async function criarDiligencia(_prev: ResultadoNova, form: FormData): Promise<ResultadoNova> {
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo) return { ok: false, msg: 'Sessão expirada. Entre de novo.' };
  if (!u.ferramentas.includes('diligencia')) return { ok: false, msg: 'Seu acesso não inclui a diligência.' };

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
    return { ok: false, msg: 'A pasta do Google Drive da unidade ainda não foi configurada.' };
  }

  let pf: PF[] = [];
  let pj: PJ[] = [];
  let mat: Mat[] = [];
  try {
    pf = JSON.parse(String(form.get('pf') || '[]'));
    pj = JSON.parse(String(form.get('pj') || '[]'));
    mat = JSON.parse(String(form.get('mat') || '[]'));
  } catch {
    return { ok: false, msg: 'Dados do formulário inválidos. Recarregue a página.' };
  }

  const endereco = txt(form.get('endereco')).replace(/\s+/g, ' ');
  if (endereco.length < 8) return { ok: false, msg: 'Informe o endereço completo do imóvel (com número e complemento).' };

  mat = mat.filter((m) => txt(m.numero) || txt(m.sql) || txt(m.cartorio));
  if (!mat.length) return { ok: false, msg: 'Informe o número da matrícula do imóvel.' };
  for (const [i, m] of mat.entries()) {
    if (!so(m.numero)) return { ok: false, msg: `Matrícula ${i + 1}: informe o número.` };
    if (txt(m.sql) && so(m.sql).length < 10) return { ok: false, msg: `Matrícula ${i + 1}: SQL do IPTU incompleto.` };
  }

  pf = pf.filter((p) => txt(p.nome) || so(p.cpf));
  pj = pj.filter((p) => txt(p.nome) || so(p.cnpj));
  if (!pf.length && !pj.some((p) => p.vinculo === 'vendedora')) {
    return { ok: false, msg: 'Inclua ao menos um vendedor (pessoa física ou empresa vendedora).' };
  }

  for (const [i, p] of pf.entries()) {
    const n = `Vendedor(a) ${i + 1}`;
    const f = faltaParaCertidoes(p, n);
    if (f) return { ok: false, msg: f };
    if (!ESTADOS.includes(p.estado_civil)) return { ok: false, msg: `${n}: informe o estado civil.` };
    if (temConjuge(p.estado_civil)) {
      if (!REGIMES.includes(p.regime)) return { ok: false, msg: `${n}: informe o regime de bens.` };
      if (!PARTICIPACOES.includes(p.conjuge?.participacao)) {
        return { ok: false, msg: `${n}: informe se o cônjuge é coproprietário (parte vendedora) ou anuente.` };
      }
      const fc = faltaParaCertidoes(p.conjuge, `Cônjuge de ${n.toLowerCase()}`);
      if (fc) return { ok: false, msg: fc };
    }
  }
  for (const [i, p] of pj.entries()) {
    const n = `Empresa ${i + 1}`;
    if (p.vinculo !== 'vendedora' && p.vinculo !== 'participacao') return { ok: false, msg: `${n}: informe o vínculo da empresa.` };
    if (!txt(p.nome)) return { ok: false, msg: `${n}: informe a razão social.` };
    if (!cnpjValido(so(p.cnpj))) return { ok: false, msg: `${n}: CNPJ inválido.` };
    if (p.vinculo === 'vendedora') {
      const reps = (p.reps || []).filter((r) => txt(r.nome) || so(r.cpf));
      if (!reps.length) return { ok: false, msg: `${n}: informe quem assina pela empresa.` };
      for (const [ri, r] of reps.entries()) {
        const nr = `${n}, signatário ${ri + 1}`;
        if (!['socio_adm', 'adm_nao_socio', 'procurador'].includes(r.papel)) return { ok: false, msg: `${nr}: informe o papel na empresa.` };
        if (!txt(r.nome)) return { ok: false, msg: `${nr}: informe o nome.` };
        if (!cpfValido(so(r.cpf))) return { ok: false, msg: `${nr}: CPF inválido.` };
        if (r.certidoes) {
          const f = faltaParaCertidoes(r, nr);
          if (f) return { ok: false, msg: f };
        }
      }
      p.reps = reps;
    } else {
      p.reps = [];
    }
  }
  const cpfs = [
    ...pf.map((p) => so(p.cpf)),
    ...pf.filter((p) => temConjuge(p.estado_civil)).map((p) => so(p.conjuge.cpf)),
  ];
  if (new Set(cpfs).size !== cpfs.length) return { ok: false, msg: 'Há CPF repetido entre vendedores e cônjuges.' };

  // Formato do formulário do WF-01 (o R4-01 usa o mesmo "Montar Template").
  const pessoa = (p: Pessoa) => ({
    nome: up(p.nome),
    cpf: so(p.cpf),
    rg: txt(p.rg),
    data_nascimento: txt(p.nascimento),
    genero: txt(p.genero),
    nome_mae: up(p.mae),
    nacionalidade: txt(p.nacionalidade),
    profissao: txt(p.profissao),
    email: txt(p.email).toLowerCase(),
  });
  const vendedoresPF = pf.map((p) => {
    const b = pessoa(p);
    const conj = temConjuge(p.estado_civil)
      ? {
          ...pessoa(p.conjuge),
          participacao: p.conjuge.participacao,
          registro_aquisicao: txt(p.conjuge.registro),
          proprietario: p.conjuge.participacao === 'coproprietario',
        }
      : null;
    return {
      pf_nome: b.nome,
      pf_cpf: b.cpf,
      pf_rg: b.rg,
      pf_data_nascimento: b.data_nascimento,
      pf_genero: b.genero,
      pf_nome_mae: b.nome_mae,
      pf_estado_civil: p.estado_civil,
      pf_regime_bens: temConjuge(p.estado_civil) ? p.regime : '',
      pf_nacionalidade: b.nacionalidade,
      pf_profissao: b.profissao,
      pf_email: b.email,
      pf_conjuge: conj,
    };
  });
  const vendedoresPJ = pj.map((p) => {
    const reps = p.reps.map((r) => ({
      ...pessoa(r),
      estado_civil: txt(r.estado_civil),
      papel: r.papel,
      emitir_certidoes: !!r.certidoes,
    }));
    return {
      pj_nome: up(p.nome),
      pj_cnpj: so(p.cnpj),
      pj_vinculo: p.vinculo,
      pj_representante: reps[0] || null,
      pj_representantes: reps,
    };
  });
  const matriculas = mat.map((m) => ({
    matricula_num: so(m.numero),
    matricula_cartorio: txt(m.cartorio),
    matricula_iptu: txt(m.sql),
  }));

  const dados = { endereco, matriculas, vendedoresPF, vendedoresPJ };

  const { data: dil, error: e1 } = await adm
    .from('diligencias')
    .insert({ unidade_id: un.id, criado_por: u.id, titulo: endereco, status: 'enviando', dados })
    .select('id')
    .single();
  if (e1 || !dil) return { ok: false, msg: `Não consegui registrar a diligência: ${e1?.message || 'erro'}` };

  const corpo = {
    endereco,
    matriculas,
    vendedoresPF,
    vendedoresPJ,
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

  // Responsável escolheu corretores da equipe que podem ver esta diligência
  if (u.papel === 'admin' || u.papel === 'superadmin') {
    let ids: string[] = [];
    try {
      ids = JSON.parse(String(form.get('corretores') || '[]'));
    } catch {
      ids = [];
    }
    if (Array.isArray(ids) && ids.length) {
      const { data: equipe } = await adm.from('usuarios').select('id').eq('unidade_id', un.id).eq('papel', 'corretor');
      const validos = new Set((equipe || []).map((x) => x.id as string));
      const linhas = [...new Set(ids.map(String))]
        .filter((x) => validos.has(x))
        .map((x) => ({ diligencia_id: dil.id, usuario_id: x, liberado_por: u.id }));
      if (linhas.length) await adm.from('diligencia_corretores').insert(linhas);
    }
  }
  // O navegador ainda envia os documentos escolhidos e depois abre a diligência.
  return { ok: true, msg: 'Diligência iniciada.', id: dil.id };
}

export type CardDocumento = { id: string; tipo: string; documento: string };

/**
 * Cards de documentos que a unidade junta (identidade, comprovante de residência,
 * certidão de estado civil) desta diligência — para o envio logo após o cadastro.
 */
export async function cardsDocumentos(dilR4Id: string): Promise<CardDocumento[]> {
  const { dil } = await exigirDiligenciaR4(dilR4Id);
  const r = await pool.query(
    `SELECT id::text AS id, tipo, regexp_replace(COALESCE(documento, ''), '[^0-9]', '', 'g') AS documento
       FROM certidoes_status
      WHERE diligencia_id = $1 AND COALESCE(manual, false)
        AND tipo IN ('doc_identidade', 'comp_residencia', 'cert_estado_civil')`,
    [dil.motor_id]
  );
  return r.rows as CardDocumento[];
}

/**
 * Arquivar: tira a diligência da lista principal sem apagar nada (aba "Arquivadas").
 * Só o responsável da unidade (ou o superadmin), igual ao painel da Ville.
 */
async function marcarArquivo(fd: FormData, arquivar: boolean) {
  const { usuario, dil } = await exigirDiligenciaR4(String(fd.get('diligencia_id') || ''));
  if (usuario.papel !== 'admin' && usuario.papel !== 'superadmin') throw new Error('Só o responsável da unidade arquiva diligências.');
  await r4Admin()
    .from('diligencias')
    .update({ arquivada_em: arquivar ? new Date().toISOString() : null })
    .eq('id', dil.id);
  revalidatePath('/r4/diligencias');
}

export async function r4Arquivar(fd: FormData): Promise<void> {
  await marcarArquivo(fd, true);
}

export async function r4Desarquivar(fd: FormData): Promise<void> {
  await marcarArquivo(fd, false);
}

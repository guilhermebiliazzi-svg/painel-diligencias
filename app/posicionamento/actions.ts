'use server';

// Posicionamento: gravar e excluir condomínios do mapa do corretor.
// O corretor só mexe nos dele; o administrador pode mexer em todos.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { exigirTela, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CAMPOS, lerContatos, zeladorDosContatos, type Condominio } from '@/lib/posicionamento';
import { mercadoPorEndereco, type MercadoItbi } from '@/lib/posicionamento-itbi';

const txt = (v: FormDataEntryValue | null) => String(v ?? '').trim();

function numero(v: string, inteiro: boolean): number | null {
  const t = v.replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!t) return null;
  // aceita 12.500,50 / 12500,5 / 12500.5
  const norm = /,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  const n = Number(norm);
  if (!isFinite(n) || n < 0) return null;
  return inteiro ? Math.round(n) : n;
}

async function quem() {
  const perfil = await exigirTela('posicionamento');
  const eu = await corretorDaPessoa(perfil.email);
  return { admin: !!perfil.is_admin, meuId: eu?.id ?? null };
}

async function dono(id: number): Promise<number | null> {
  const { data } = await supabaseAdmin().from('posicionamento_condominios').select('corretor_id').eq('id', id).maybeSingle();
  return data ? Number((data as { corretor_id: number }).corretor_id) : null;
}

const voltar = (cor: number, regiao: string, extra = '') => {
  const p = new URLSearchParams({ aba: 'mapa', reg: regiao });
  p.set('cor', String(cor));
  return `/posicionamento?${p.toString()}${extra}`;
};

export async function salvarCondominio(fd: FormData) {
  const { admin, meuId } = await quem();
  const id = Number(txt(fd.get('id'))) || null;

  let corretorId = admin ? Number(txt(fd.get('corretor_id'))) || meuId : meuId;
  if (!corretorId) redirect('/posicionamento?erro=sem-corretor');

  if (id) {
    const d = await dono(id);
    if (d == null) redirect('/posicionamento?erro=nao-encontrado');
    if (!admin && d !== meuId) redirect('/sem-acesso');
    if (!admin) corretorId = d;
  }

  const regSel = txt(fd.get('regiao'));
  const regiao = txt(fd.get('regiao_nova')) || (regSel === '__nova__' ? '' : regSel);
  const nome = txt(fd.get('nome'));
  if (!regiao || !nome) {
    redirect(id ? `/posicionamento/${id}?erro=obrigatorio` : '/posicionamento?aba=novo&erro=obrigatorio');
  }

  const linha: Partial<Record<keyof Condominio, unknown>> = { corretor_id: corretorId, regiao };
  for (const c of CAMPOS) {
    const v = txt(fd.get(c.k));
    if (c.tipo === 'int') linha[c.k] = numero(v, true);
    else if (c.tipo === 'num') linha[c.k] = numero(v, false);
    else linha[c.k] = v || null;
  }
  if (!linha.status_relacionamento) linha.status_relacionamento = 'nao_iniciado';
  // Contatos do prédio (lista); o zelador/gerente da lista alimenta os indicadores
  const contatos = lerContatos(txt(fd.get('contatos')));
  linha.contatos = contatos;
  linha.zelador_nome = zeladorDosContatos(contatos);
  const pm = txt(fd.get('prioridade_manual'));
  linha.prioridade_manual = ['A', 'B', 'C'].includes(pm) ? pm : null;
  linha.observacoes = txt(fd.get('observacoes')) || null;

  const sb = supabaseAdmin();
  const { error } = id
    ? await sb.from('posicionamento_condominios').update({ ...linha, atualizado_em: new Date().toISOString() }).eq('id', id)
    : await sb.from('posicionamento_condominios').insert(linha);
  if (error) redirect(`/posicionamento?erro=${encodeURIComponent(error.message.slice(0, 120))}`);

  revalidatePath('/posicionamento');
  redirect(voltar(corretorId!, regiao, '&ok=1'));
}

export async function excluirCondominio(fd: FormData) {
  const { admin, meuId } = await quem();
  const id = Number(txt(fd.get('id')));
  if (!id) redirect('/posicionamento');
  const { data } = await supabaseAdmin()
    .from('posicionamento_condominios')
    .select('corretor_id,regiao')
    .eq('id', id)
    .maybeSingle();
  const row = data as { corretor_id: number; regiao: string } | null;
  if (!row) redirect('/posicionamento');
  if (!admin && Number(row.corretor_id) !== meuId) redirect('/sem-acesso');
  if (txt(fd.get('confirmar')) !== 'sim') redirect(`/posicionamento/${id}?erro=confirmar`);
  await supabaseAdmin().from('posicionamento_condominios').delete().eq('id', id);
  revalidatePath('/posicionamento');
  redirect(voltar(Number(row.corretor_id), row.regiao));
}

// Botão "Puxar do ITBI" da ficha: números de mercado do prédio pelo endereço.
export async function buscarItbi(endereco: string): Promise<MercadoItbi | { erro: string }> {
  await exigirTela('posicionamento');
  try {
    return await mercadoPorEndereco(String(endereco ?? '').slice(0, 200));
  } catch {
    return { erro: 'Não consegui consultar o ITBI agora. Tente de novo em instantes.' };
  }
}

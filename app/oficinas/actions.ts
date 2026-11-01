'use server';

// Oficinas: presença, material de apoio e monitores.
// Monitor mexe só na(s) sua(s) oficina(s); monitores, só o administrador.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acessoOficinas, podeOficina, hojeSP } from '@/lib/oficinas';

const txt = (v: FormDataEntryValue | null) => String(v ?? '').trim();
const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function oficina(fd: FormData) {
  const id = Number(txt(fd.get('oficina_id')));
  const slug = txt(fd.get('slug')).replace(/[^a-z0-9-]/g, '');
  const a = await acessoOficinas();
  if (!id || !slug || !podeOficina(a, id)) redirect('/sem-acesso');
  return { a, id, slug, volta: (q: string) => `/oficinas/${slug}?${q}` };
}

export async function registrarPresenca(fd: FormData) {
  const { a, id, slug, volta } = await oficina(fd);
  const data = txt(fd.get('data'));
  if (!DATA.test(data) || data > hojeSP()) redirect(volta('erro=data'));
  const participantes = [...new Set(fd.getAll('corretor').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!participantes.length) redirect(volta('erro=ninguem'));

  // Monitor que conduziu: o próprio monitor; o admin escolhe (ou deixa em branco)
  let monitor: number | null = a.admin ? Number(txt(fd.get('monitor_id'))) || null : a.meuId;
  if (!a.admin && !monitor) redirect('/sem-acesso');
  if (monitor === 0) monitor = null;

  const linhas = participantes.map((corretor_id) => ({
    oficina_id: id, data, corretor_id, monitor_id: monitor, registrado_por: a.perfil.email,
  }));
  const { error } = await supabaseAdmin()
    .from('onb_oficina_presencas')
    .upsert(linhas, { onConflict: 'oficina_id,data,corretor_id', ignoreDuplicates: true });
  if (error) redirect(volta('erro=gravar'));
  revalidatePath(`/oficinas/${slug}`);
  redirect(volta(`ok=presenca&n=${participantes.length}`));
}

export async function removerPresenca(fd: FormData) {
  const { id, slug, volta } = await oficina(fd);
  const pid = Number(txt(fd.get('id')));
  if (!pid) redirect(volta('erro=gravar'));
  const { error } = await supabaseAdmin().from('onb_oficina_presencas').delete().eq('id', pid).eq('oficina_id', id);
  if (error) redirect(volta('erro=gravar'));
  revalidatePath(`/oficinas/${slug}`);
  redirect(volta('ok=removido'));
}

export async function salvarMaterial(fd: FormData) {
  const { a, id, slug, volta } = await oficina(fd);
  const titulo = txt(fd.get('titulo')).slice(0, 200);
  const url = txt(fd.get('url'));
  const publico = txt(fd.get('publico')) === 'participante' ? 'participante' : 'monitor';
  if (!titulo || !/^https?:\/\/\S+$/i.test(url)) redirect(volta('erro=material'));
  const { error } = await supabaseAdmin()
    .from('onb_oficina_materiais')
    .insert({ oficina_id: id, publico, titulo, url, criado_por: a.perfil.email });
  if (error) redirect(volta('erro=gravar'));
  revalidatePath(`/oficinas/${slug}`);
  redirect(volta('ok=material'));
}

export async function removerMaterial(fd: FormData) {
  const { id, slug, volta } = await oficina(fd);
  const mid = Number(txt(fd.get('id')));
  if (!mid) redirect(volta('erro=gravar'));
  const { error } = await supabaseAdmin().from('onb_oficina_materiais').delete().eq('id', mid).eq('oficina_id', id);
  if (error) redirect(volta('erro=gravar'));
  revalidatePath(`/oficinas/${slug}`);
  redirect(volta('ok=removido'));
}

export async function salvarMonitor(fd: FormData) {
  const { a, id, slug, volta } = await oficina(fd);
  if (!a.admin) redirect('/sem-acesso');
  const corretor_id = Number(txt(fd.get('corretor_id')));
  const dia = Number(txt(fd.get('dia_semana')));
  const per = txt(fd.get('periodo'));
  if (!corretor_id) redirect(volta('erro=monitor'));
  const { error } = await supabaseAdmin()
    .from('onb_oficina_monitores')
    .upsert(
      {
        oficina_id: id, corretor_id,
        dia_semana: dia >= 1 && dia <= 6 ? dia : null,
        periodo: per === 'manha' || per === 'tarde' ? per : null,
      },
      { onConflict: 'oficina_id,corretor_id' }
    );
  if (error) redirect(volta('erro=gravar'));
  revalidatePath(`/oficinas/${slug}`);
  revalidatePath('/oficinas');
  redirect(volta('ok=monitor'));
}

export async function removerMonitor(fd: FormData) {
  const { a, id, slug, volta } = await oficina(fd);
  if (!a.admin) redirect('/sem-acesso');
  const mid = Number(txt(fd.get('id')));
  if (!mid) redirect(volta('erro=gravar'));
  const { error } = await supabaseAdmin().from('onb_oficina_monitores').delete().eq('id', mid).eq('oficina_id', id);
  if (error) redirect(volta('erro=gravar'));
  revalidatePath(`/oficinas/${slug}`);
  revalidatePath('/oficinas');
  redirect(volta('ok=removido'));
}

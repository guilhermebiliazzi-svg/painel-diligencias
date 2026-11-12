import { redirect } from 'next/navigation';
import { BotaoEnviar } from '../_botao-enviar';
import { Cabecalho } from '../_ui';
import { exigirR4, r4Admin, r4Base, r4Server } from '@/lib/r4/supabase';

export const metadata = { title: 'Trocar senha' };
export const dynamic = 'force-dynamic';

const ERROS: Record<string, string> = {
  curta: 'A senha precisa ter pelo menos 8 caracteres.',
  diferente: 'As duas senhas não são iguais.',
  falhou: 'Não foi possível trocar a senha. Tente de novo.',
};

async function trocar(form: FormData) {
  'use server';
  const base = await r4Base();
  const s1 = String(form.get('senha') || '');
  const s2 = String(form.get('confirma') || '');
  if (s1.length < 8) redirect(`${base}/senha?erro=curta`);
  if (s1 !== s2) redirect(`${base}/senha?erro=diferente`);
  const sb = await r4Server();
  const { data } = await sb.auth.getUser();
  if (!data?.user) redirect(`${base}/login`);
  const { error } = await sb.auth.updateUser({ password: s1 });
  if (error) redirect(`${base}/senha?erro=falhou`);
  // tira a obrigação de trocar a senha
  await r4Admin().auth.admin.updateUserById(data.user.id, {
    user_metadata: { ...(data.user.user_metadata || {}), trocar_senha: false },
  });
  redirect(`${base}/?ok=senha`);
}

export default async function SenhaR4({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { usuario, base } = await exigirR4({ permitirTrocaSenha: true });
  const sp = await searchParams;
  const erro = sp?.erro ? ERROS[sp.erro] : null;
  return (
    <>
      <Cabecalho base={base} unidade={usuario.unidade?.nome ?? null} logo={usuario.unidade?.logo_url ?? null} nome={usuario.nome} superadmin={usuario.papel === 'superadmin'} />
      <main className="mx-auto max-w-md px-4 py-10">
        <form action={trocar} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <h1 className="text-lg font-semibold">{usuario.trocar_senha ? 'Crie sua senha' : 'Trocar senha'}</h1>
          {usuario.trocar_senha && (
            <p className="mt-1 text-sm text-slate-600">No primeiro acesso, troque a senha provisória por uma só sua.</p>
          )}
          {erro && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          <label className="mt-5 block text-sm font-medium text-slate-700">
            Nova senha (mínimo 8 caracteres)
            <input name="senha" type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Repita a nova senha
            <input name="confirma" type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <BotaoEnviar carregando="Salvando…">Salvar senha</BotaoEnviar>
        </form>
      </main>
    </>
  );
}

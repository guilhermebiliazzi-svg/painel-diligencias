'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LocadorLogin() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setErro(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/locador` },
    });
    setEnviando(false);
    if (error) setErro('Não foi possível enviar agora. Confira o e-mail e tente de novo.');
    else setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ville Jardins</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Confira seu e-mail</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Enviamos um link de acesso para <b>{email}</b>. Abra o e-mail e clique no link para ver seus repasses.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ville Jardins</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">Portal do locador</h1>
      <p className="mt-1 text-sm text-slate-600">Informe seu e-mail para receber um link de acesso.</p>
      <form onSubmit={enviar} className="mt-6 space-y-3">
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com" autoComplete="email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        <button type="submit" disabled={enviando}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
          {enviando ? 'Enviando…' : 'Receber link de acesso'}
        </button>
      </form>
    </div>
  );
}

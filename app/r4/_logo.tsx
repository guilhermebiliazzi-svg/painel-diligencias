'use client';

// rquatro — envio do logo da unidade (Minha unidade e, para o superadmin, Unidades).
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoUnidade({ atual, unidadeId, compacto = false }: { atual: string | null; unidadeId?: string; compacto?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(atual);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  async function mandar(fd: FormData) {
    if (unidadeId) fd.set('unidade_id', unidadeId);
    setEnviando(true);
    setMsg(null);
    try {
      const r = await fetch('/api/r4/logo', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Falha (HTTP ${r.status}).`);
      setLogo(d.logo_url ?? null);
      setMsg({ ok: true, t: d.logo_url ? 'Logo salvo. Já aparece no painel, no link do cliente e no PDF.' : 'Logo removido.' });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : 'Falha no envio.' });
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = '';
    }
  }

  function escolher(f: File | undefined) {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setMsg({ ok: false, t: 'Imagem acima de 2 MB.' });
      return;
    }
    const fd = new FormData();
    fd.set('arquivo', f);
    void mandar(fd);
  }

  function remover() {
    if (!window.confirm('Tirar o logo da unidade? Os documentos voltam a sair só com o nome da unidade.')) return;
    const fd = new FormData();
    fd.set('acao', 'remover');
    void mandar(fd);
  }

  return (
    <div className={compacto ? '' : 'mt-4'}>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white ${compacto ? 'h-12 w-28' : 'h-20 w-48'}`}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo da unidade" className={`${compacto ? 'max-h-10 max-w-24' : 'max-h-16 max-w-44'} object-contain`} />
          ) : (
            <span className="text-xs text-slate-400">sem logo</span>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => escolher(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={() => input.current?.click()}
            className="rounded-lg bg-[#0F1B2D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1c2c45] disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : logo ? 'Trocar logo' : 'Enviar logo'}
          </button>
          {logo && !enviando && (
            <button type="button" onClick={remover} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
              Remover
            </button>
          )}
        </div>
      </div>
      {msg && (
        <p role="status" className={`mt-2 text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {msg.t}
        </p>
      )}
    </div>
  );
}

'use client';

// app/admin/EnviarArquivoCard.tsx
// Botão "Enviar arquivo" do card da diligência: o arquivo vai do computador/celular
// para a pasta do Drive do card e o card é conferido (IA) ou concluído (doc manual).
// Fluxo e segurança: ver app/api/adm/diligencia-upload/route.ts.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const LIMITE = 50 * 1024 * 1024;

async function post(body: unknown) {
  const r = await fetch('/api/adm/diligencia-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Falha (HTTP ${r.status}).`);
  return d;
}

export function EnviarArquivoCard({ certidaoId, temPdf }: { certidaoId: string; temPdf: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<'' | 'subindo' | 'drive' | 'ok'>('');
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  async function enviar(file: File) {
    setErro('');
    setMsg('');
    if (file.size > LIMITE) {
      setErro('Arquivo acima de 50 MB.');
      return;
    }
    if (temPdf && !window.confirm('Este card já tem um PDF. Substituir pelo arquivo novo?')) return;
    try {
      setEtapa('subindo');
      const mime = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
      const u = await post({ acao: 'upload-url', certidao_id: certidaoId, nome: file.name, mime });
      const r = await fetch(u.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime || 'application/octet-stream' },
        body: file,
      });
      if (!r.ok) throw new Error(`Falha no envio do arquivo (HTTP ${r.status}).`);

      setEtapa('drive');
      const out = await post({ acao: 'enviar', certidao_id: certidaoId, path: u.path, nome: file.name });
      setEtapa('ok');
      setMsg(out.manual ? 'Salvo no Drive. Card concluído.' : 'Salvo no Drive. A IA está conferindo…');
      // a conferência roda no n8n; atualiza a tela algumas vezes
      [2500, 20000, 45000, 75000].forEach((ms) => setTimeout(() => router.refresh(), ms));
    } catch (e) {
      setEtapa('');
      setErro(e instanceof Error ? e.message : 'Falha no envio.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  const ocupado = etapa === 'subindo' || etapa === 'drive';
  const rotulo =
    etapa === 'subindo' ? 'Enviando…' : etapa === 'drive' ? 'Salvando no Drive…' : temPdf ? '⇪ Enviar outro' : '⇪ Enviar arquivo';

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void enviar(f);
        }}
      />
      <button
        type="button"
        disabled={ocupado}
        onClick={() => input.current?.click()}
        title="Escolha o arquivo no computador ou celular: ele vai para a pasta do Drive deste card"
        className={
          ocupado
            ? 'cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-400'
            : 'rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50'
        }
      >
        {rotulo}
      </button>
      {msg && <span className="text-[11px] text-emerald-700">{msg}</span>}
      {erro && <span className="text-[11px] text-rose-700">{erro}</span>}
    </span>
  );
}

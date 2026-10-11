'use client';

// "Ver como corretor": o administrador escolhe um corretor e a tela passa a
// mostrar exatamente o que ele enxerga (Meu funil, Minhas diligências).
import { useRouter } from 'next/navigation';

export default function VerComoCorretor({
  corretores,
  base,
  atual,
}: {
  corretores: { id: number; nome: string }[];
  // URL até o "c=" (ex.: "/sdr?d=30&c=" ou "/admin?c=")
  base: string;
  // corretor escolhido agora (null = visão completa)
  atual?: number | null;
}) {
  const router = useRouter();
  const semCorretor = base.replace(/[?&]c=$/, '');
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="font-medium">Ver como corretor</span>
      <select
        value={atual ? String(atual) : ''}
        onChange={(e) => router.push(e.target.value ? base + e.target.value : semCorretor || '/')}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
      >
        <option value="">Visão completa</option>
        {corretores.map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </select>
    </label>
  );
}

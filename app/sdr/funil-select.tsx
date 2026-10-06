'use client';

// Combo para escolher o funil (mantém o período escolhido).
import { useRouter } from 'next/navigation';

export default function FunilSelect({ funis, atual, periodo }: { funis: { k: string; rotulo: string }[]; atual: string; periodo: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="font-medium">Funil</span>
      <select
        value={atual}
        onChange={(e) => router.push(`/sdr?f=${e.target.value}&d=${periodo}`)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
      >
        {funis.map((f) => (
          <option key={f.k} value={f.k}>{f.rotulo}</option>
        ))}
      </select>
    </label>
  );
}

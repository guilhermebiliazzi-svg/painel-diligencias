'use client';

// Seletor que troca a tela ao escolher (sem botão "Ver"): cada opção já leva o link.
import { useRouter } from 'next/navigation';

export default function Seletor({
  rotulo,
  valor,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  opcoes: { valor: string; texto: string; href: string }[];
}) {
  const router = useRouter();
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{rotulo}</label>
      <select
        value={valor}
        onChange={(e) => {
          const o = opcoes.find((x) => x.valor === e.target.value);
          if (o) router.push(o.href);
        }}
        className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>{o.texto}</option>
        ))}
      </select>
    </div>
  );
}

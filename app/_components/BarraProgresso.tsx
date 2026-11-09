'use client';

// 09/11: barra azul no topo que aparece no instante do clique em qualquer link interno do painel
// (inclusive filtros e abas da mesma tela) e some quando a nova tela chega.
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function BarraProgresso() {
  const caminho = usePathname();
  const busca = useSearchParams();
  const [ativo, setAtivo] = useState(false);

  // chegou a nova tela: some
  useEffect(() => { setAtivo(false); }, [caminho, busca]);

  useEffect(() => {
    const clique = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search) return; // mesma tela (ou só âncora)
      setAtivo(true);
    };
    const envio = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (!e.defaultPrevented && (f.method || 'get').toLowerCase() === 'get' && f.action.startsWith(location.origin)) setAtivo(true);
    };
    document.addEventListener('click', clique);
    document.addEventListener('submit', envio);
    return () => { document.removeEventListener('click', clique); document.removeEventListener('submit', envio); };
  }, []);

  useEffect(() => {
    if (!ativo) return;
    const t = setTimeout(() => setAtivo(false), 20000); // nunca fica presa
    return () => clearTimeout(t);
  }, [ativo]);

  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden transition-opacity duration-200 ${ativo ? 'opacity-100' : 'opacity-0'}`}>
      <div className="barra-progresso h-full w-1/3 bg-blue-600" />
    </div>
  );
}

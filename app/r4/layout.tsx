import type { Metadata } from 'next';

// rquatro — layout próprio. O layout raiz é o do painel da Ville; aqui
// escondemos a barra da marca REMAX Ville e trocamos as cores e o título.
export const metadata: Metadata = {
  title: { default: 'rquatro', template: '%s — rquatro' },
  description: 'Ferramentas para unidades REMAX: diligência imobiliária com certidões automáticas.',
  appleWebApp: { capable: true, title: 'rquatro', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

const CSS = `
.barra-marca{display:none!important}
html,body{background-color:#F4F6FA!important;color:#0F1B2D!important}
.r4{font-family:Montserrat,system-ui,sans-serif}
`;

export default function R4Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="r4 min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {children}
    </div>
  );
}

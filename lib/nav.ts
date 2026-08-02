// Config das telas reunidas pelo hub. As URLs vêm de variáveis de ambiente
// para não hard-codar endereços no repositório. Enquanto a URL não estiver
// definida, o card aparece como "link a definir" (não clicável).
//
// Defina no .env.local (e na Vercel):
//   PAINEL_URL_DILIGENCIAS, PAINEL_URL_COBRANCAS,
//   PAINEL_URL_REPASSE, PAINEL_URL_NOTAS

export type IconeNav =
  | 'diligencias'
  | 'cobrancas'
  | 'repasse'
  | 'notas'
  | 'mais';

export type Cor = 'blue' | 'emerald' | 'violet' | 'amber' | 'slate';

export type ItemNav = {
  chave: string;
  titulo: string;
  descricao: string;
  href: string;
  icone: IconeNav;
  cor: Cor;
  disponivel: boolean; // false = URL ainda não configurada
  externo: boolean; // abre app diferente (fora deste deploy)
};

function item(
  chave: string,
  titulo: string,
  descricao: string,
  envVar: string,
  icone: IconeNav,
  cor: Cor
): ItemNav {
  const href = (process.env[envVar] || '').trim();
  return {
    chave,
    titulo,
    descricao,
    href: href || '#',
    icone,
    cor,
    disponivel: Boolean(href),
    externo: /^https?:\/\//i.test(href),
  };
}

export function getNav(): ItemNav[] {
  return [
    item(
      'diligencias',
      'Diligências',
      'Auditoria de certidões e acompanhamento das diligências.',
      'PAINEL_URL_DILIGENCIAS',
      'diligencias',
      'blue'
    ),
    item(
      'cobrancas',
      'Cobranças',
      'Boletos, faturas e situação de pagamentos.',
      'PAINEL_URL_COBRANCAS',
      'cobrancas',
      'amber'
    ),
    item(
      'repasse',
      'Repasse',
      'Repasses aos locadores e conciliação de valores.',
      'PAINEL_URL_REPASSE',
      'repasse',
      'emerald'
    ),
    item(
      'notas',
      'Notas',
      'Emissão e conciliação de NFS-e da administração.',
      'PAINEL_URL_NOTAS',
      'notas',
      'violet'
    ),
  ];
}

// Config das telas reunidas pelo hub. URL de cada tela vem de env; a
// permissão correspondente vem do perfil da pessoa.

export type IconeNav = 'diligencias' | 'cobrancas' | 'repasse' | 'notas' | 'usuarios' | 'mais';
export type Cor = 'blue' | 'emerald' | 'violet' | 'amber' | 'slate';
export type PermKey = 'pode_diligencias' | 'pode_cobrancas' | 'pode_repasse' | 'pode_notas';

export type ItemNav = {
  chave: string;
  titulo: string;
  descricao: string;
  href: string;
  icone: IconeNav;
  cor: Cor;
  permKey: PermKey;
  disponivel: boolean;
  externo: boolean;
};

function item(
  chave: string, titulo: string, descricao: string, envVar: string,
  icone: IconeNav, cor: Cor, permKey: PermKey
): ItemNav {
  const href = (process.env[envVar] || '').trim();
  return {
    chave, titulo, descricao, href: href || '#', icone, cor, permKey,
    disponivel: Boolean(href), externo: /^https?:\/\//i.test(href),
  };
}

export function getNav(): ItemNav[] {
  return [
    item('diligencias', 'Diligências', 'Auditoria de certidões e acompanhamento das diligências.', 'PAINEL_URL_DILIGENCIAS', 'diligencias', 'blue', 'pode_diligencias'),
    item('cobrancas', 'Cobranças', 'Boletos, faturas e situação de pagamentos.', 'PAINEL_URL_COBRANCAS', 'cobrancas', 'amber', 'pode_cobrancas'),
    item('repasse', 'Repasse', 'Repasses aos locadores e conciliação de valores.', 'PAINEL_URL_REPASSE', 'repasse', 'emerald', 'pode_repasse'),
    item('notas', 'Notas', 'Emissão e conciliação de NFS-e da administração.', 'PAINEL_URL_NOTAS', 'notas', 'violet', 'pode_notas'),
  ];
}

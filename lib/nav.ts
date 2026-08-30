// Config das telas do hub. Como tudo está no mesmo app, os links apontam
// para as rotas internas. Uma env opcional (PAINEL_URL_*) pode sobrescrever.

export type IconeNav = 'diligencias' | 'cobrancas' | 'repasse' | 'notas' | 'usuarios' | 'locador' | 'mais';
export type Cor = 'blue' | 'emerald' | 'violet' | 'amber' | 'slate';
export type PermKey = 'pode_diligencias' | 'pode_cobrancas' | 'pode_repasse' | 'pode_notas' | 'pode_pagamentos';

export type ItemNav = {
  chave: string; titulo: string; descricao: string; href: string;
  icone: IconeNav; cor: Cor; permKey: PermKey; disponivel: boolean; externo: boolean;
};

function item(
  chave: string, titulo: string, descricao: string, envVar: string,
  padrao: string, icone: IconeNav, cor: Cor, permKey: PermKey
): ItemNav {
  const href = (process.env[envVar] || padrao).trim();
  return {
    chave, titulo, descricao, href: href || padrao, icone, cor, permKey,
    disponivel: true, externo: /^https?:\/\//i.test(href),
  };
}

export function getNav(): ItemNav[] {
  return [
    item('diligencias', 'Diligências', 'Auditoria de certidões e acompanhamento das diligências.', 'PAINEL_URL_DILIGENCIAS', '/admin', 'diligencias', 'blue', 'pode_diligencias'),
    item('cobrancas', 'Cobranças', 'Boletos, faturas e situação de pagamentos.', 'PAINEL_URL_COBRANCAS', '/cobrancas', 'cobrancas', 'amber', 'pode_cobrancas'),
    item('repasse', 'Repasse', 'Repasses aos locadores e conciliação de valores.', 'PAINEL_URL_REPASSE', '/repasses', 'repasse', 'emerald', 'pode_repasse'),
    item('notas', 'Notas', 'Emissão e conciliação de NFS-e da administração.', 'PAINEL_URL_NOTAS', '/notas', 'notas', 'violet', 'pode_notas'),
    item('notas-comissao', 'Notas de comissão', 'NFS-e de corretagem sobre os recebimentos do Asaas e notas avulsas.', 'PAINEL_URL_NOTAS_COMISSAO', '/notas-comissao', 'notas', 'violet', 'pode_notas'),
    item('pagamentos', 'Pagamentos', 'Pagar boletos da imobiliária (IPTU/condomínio) pelo Banco Inter.', 'PAINEL_URL_PAGAMENTOS', '/pagamentos', 'cobrancas', 'slate', 'pode_pagamentos'),
  ];
}

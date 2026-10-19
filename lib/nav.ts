// Config das telas do hub. Como tudo está no mesmo app, os links apontam
// para as rotas internas. Uma env opcional (PAINEL_URL_*) pode sobrescrever.
// Cada card pertence a uma tela do catálogo (lib/acesso.ts), que define a área
// em que ele aparece no início e quem pode vê-lo.
import { TELAS, type Area, type Tela } from '@/lib/acesso';

export type IconeNav = 'diligencias' | 'cobrancas' | 'repasse' | 'notas' | 'usuarios' | 'locador' | 'captacao' | 'funil' | 'vitrine' | 'mais';
export type Cor = 'blue' | 'emerald' | 'violet' | 'amber' | 'slate';
export type ItemNav = {
  chave: string; titulo: string; descricao: string; href: string;
  icone: IconeNav; cor: Cor; tela: Tela; area: Area; disponivel: boolean; externo: boolean;
  // ícone do card no início (o mesmo da prévia aprovada em out/2026)
  emoji?: string;
};

const EMOJI: Record<string, string> = {
  sdr: '🔻', captacao: '🔎', estudo: '📝', representacao: '✍️', diligencias: '📄', postagens: '🖼️', vitrine: '📣',
  'cobranca-avulsa': '💳', 'notas-comissao': '🧾',
  cobrancas: '💳', contratos: '📑', repasse: '🔁', pagamentos: '🏦', locador: '🏢', notas: '🧾',
  usuarios: '👥', treinamento: '🎓',
};

function item(
  chave: string, titulo: string, descricao: string, envVar: string,
  padrao: string, icone: IconeNav, cor: Cor, tela: Tela, areaCard?: Area
): ItemNav {
  const href = (process.env[envVar] || padrao).trim();
  // o card fica na área da tela, salvo quando a mesma permissão serve a outra área
  const area = areaCard ?? TELAS.find((t) => t.chave === tela)!.area;
  return {
    chave, titulo, descricao, href: href || padrao, icone, cor, tela, area, emoji: EMOJI[chave],
    disponivel: true, externo: /^https?:\/\//i.test(href),
  };
}

export function getNav(): ItemNav[] {
  // A ordem aqui é a ordem dos cards dentro de cada área no início.
  return [
    // Venda
    item('sdr', 'Funil do SDR', 'Leads da Eva: quem respondeu, qualificou, foi distribuído e visitou.', 'PAINEL_URL_SDR', '/sdr', 'funil', 'blue', 'sdr'),
    item('captacao', 'Captação', 'Quem consta ligado a uma unidade, e como falar com a pessoa.', 'PAINEL_URL_CAPTACAO', '/captacao', 'captacao', 'blue', 'captacao'),
    item('estudo', 'Estudo de mercado', 'Ficha de captação: preencha na visita e mande para a Eva fazer o estudo.', 'PAINEL_URL_ESTUDO', '/estudo', 'captacao', 'blue', 'estudo'),
    item('representacao', 'Contrato de representação', 'Preencher o contrato do proprietário, conferir o PDF e enviar para assinatura.', 'PAINEL_URL_REPRESENTACAO', '/representacao', 'captacao', 'blue', 'representacao'),
    item('diligencias', 'Diligências', 'Auditoria de certidões e acompanhamento das diligências.', 'PAINEL_URL_DILIGENCIAS', '/admin', 'diligencias', 'blue', 'diligencias'),
    item('postagens', 'Postagens', 'Montar o carrossel de um imóvel para o Instagram escolhendo as fotos do anúncio.', 'PAINEL_URL_POSTAGENS', '/postagens', 'vitrine', 'violet', 'postagens'),
    item('vitrine', 'Vitrine Google Ads', 'Escolher os imóveis que aparecem nos anúncios por região do Google Ads.', 'PAINEL_URL_VITRINE', '/vitrine', 'vitrine', 'violet', 'vitrine'),
    // Tela do painel (/cobranca-split); a emissão continua no n8n (WF-A4).
    item('cobranca-avulsa', 'Cobrança com split', 'Boleto no Asaas com a comissão já dividida, ligado à venda, e o histórico com status.', 'PAINEL_URL_COBRANCA_SPLIT', '/cobranca-split', 'cobrancas', 'amber', 'cobrancas', 'venda'),
    item('notas-comissao', 'Notas de comissão', 'NFS-e de corretagem sobre os recebimentos do Asaas e notas avulsas.', 'PAINEL_URL_NOTAS_COMISSAO', '/notas-comissao', 'notas', 'violet', 'notas', 'venda'),
    // Administração
    item('cobrancas', 'Cobranças', 'Boletos, faturas e situação de pagamentos.', 'PAINEL_URL_COBRANCAS', '/cobrancas', 'cobrancas', 'amber', 'cobrancas'),
    item('contratos', 'Contratos', 'Minutas de locação antes da assinatura (partes, garantia e contrato no Google Docs) e contratos cadastrados.', 'PAINEL_URL_CONTRATOS', '/contratos', 'cobrancas', 'amber', 'cobrancas'),
    item('repasse', 'Repasse', 'Repasses aos locadores e conciliação de valores.', 'PAINEL_URL_REPASSE', '/repasses', 'repasse', 'emerald', 'repasse'),
    item('pagamentos', 'Pagamentos', 'Pagar boletos da imobiliária (IPTU/condomínio) pelo Banco Inter.', 'PAINEL_URL_PAGAMENTOS', '/pagamentos', 'cobrancas', 'slate', 'pagamentos'),
    item('locador', 'Portal do locador', 'Ver o portal de cada locador: recibos, comprovantes e envio por e-mail.', 'PAINEL_URL_LOCADOR', '/locador', 'locador', 'emerald', 'locador'),
    item('notas', 'Notas da administração', 'Emissão e conciliação de NFS-e da administração de locação.', 'PAINEL_URL_NOTAS', '/notas', 'notas', 'violet', 'notas'),
    // Sistema
    item('treinamento', 'Treinamento de novatos', 'Trilha dos corretores novos com o Max: tarefas, quizzes, funil e conversas no WhatsApp.', 'PAINEL_URL_TREINAMENTO', '/treinamento', 'usuarios', 'emerald', 'treinamento'),
    item('usuarios', 'Usuários e perfis', 'Convidar pessoas e definir o perfil de acesso de cada uma.', 'PAINEL_URL_USUARIOS', '/usuarios', 'usuarios', 'slate', 'usuarios'),
  ];
}

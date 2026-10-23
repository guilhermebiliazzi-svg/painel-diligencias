'use server';

// Registro da visita pelo link do corretor: quem valida o token (uso único, 7 dias) e grava é o n8n
// (sdr-painel-acao, acao registrar_visita), que segue o mesmo caminho do botão "Confirmar" da visita.
export type ResVisita = { ok: boolean; msg?: string; erro?: string };

const WEBHOOK_ACAO = 'https://villejds.app.n8n.cloud/webhook/sdr-painel-acao';
const CHAVE_ACAO = 'ville-sdr-painel-7c2e9a41f0b84d6e';

export async function registrarVisita(token: string, imovelLeadId: string, data: string, hora: string): Promise<ResVisita> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, erro: 'Link inválido.' };
  if (!/^[0-9a-f-]{36}$/i.test(imovelLeadId)) return { ok: false, erro: 'Escolha o imóvel.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) return { ok: false, erro: 'Preencha o dia e a hora.' };
  try {
    const r = await fetch(WEBHOOK_ACAO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE_ACAO },
      body: JSON.stringify({ acao: 'registrar_visita', token, imovel_lead_id: imovelLeadId, quando: data + 'T' + hora }),
      cache: 'no-store',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resposta?: string };
    if (!r.ok) return { ok: false, erro: 'Não consegui registrar agora (' + r.status + '). Tente de novo em instantes.' };
    return j.ok ? { ok: true, msg: j.resposta || 'Visita registrada.' } : { ok: false, erro: j.resposta || 'Não foi possível registrar.' };
  } catch {
    return { ok: false, erro: 'Não consegui registrar agora. Tente de novo em instantes.' };
  }
}

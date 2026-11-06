'use server';

// Mensagens do Guilherme para os novatos, enviadas pelo número do Max (5192-8192).
// Quem envia de fato é o fluxo "ONB – Entrada" no n8n (webhook onb-painel-enviar),
// que só repassa à Meta com a credencial do WhatsApp. O painel decide o formato:
//  - novato escreveu nas últimas 23h50 → texto livre (janela de 24h aberta);
//  - fora da janela → modelo aprovado onb_aviso ({{1}} = primeiro nome, {{2}} = texto).
// Cada envio fica registrado em onb_mensagens (tipo "painel" ou "painel_modelo"),
// então aparece na conversa do painel e entra no histórico que o Max lê.
import { revalidatePath } from 'next/cache';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarUm, LIMITE_TEXTO, janelaAberta } from '@/lib/onb-whats';
import {
  enviarContrato, gerarPdfContrato, nomeEmpresa, textoAvisoContrato, textoBoasVindas, validarContrato, verificarContratos,
} from '@/lib/onb-contrato';
import type { ContratoNovato } from '@/lib/contrato-associacao';

export type ResultadoEnvio = { ok: boolean; enviados: string[]; falhas: { nome: string; erro: string }[] };

export async function enviarMensagem(ids: string[], textoBruto: string): Promise<ResultadoEnvio> {
  await exigirTela('treinamento');
  const texto = String(textoBruto ?? '').trim();
  const lista = [...new Set((ids ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))))];
  if (!texto) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: 'Escreva a mensagem.' }] };
  if (texto.length > LIMITE_TEXTO) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: `Mensagem longa demais (máx. ${LIMITE_TEXTO} caracteres).` }] };
  if (!lista.length) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: 'Escolha pelo menos um corretor.' }] };

  const sb = supabaseAdmin();
  const { data: novatos, error } = await sb.from('onb_novatos').select('id,nome,phone').in('id', lista);
  if (error) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: error.message }] };

  const res: ResultadoEnvio = { ok: true, enviados: [], falhas: [] };
  for (const n of (novatos ?? []) as { id: string; nome: string; phone: string }[]) {
    const r = await enviarUm(n, texto, await janelaAberta(n.phone));
    if (r.ok) res.enviados.push(n.nome);
    else res.falhas.push({ nome: n.nome, erro: r.erro });
  }
  res.ok = res.falhas.length === 0;
  revalidatePath('/treinamento');
  for (const id of lista) revalidatePath(`/treinamento/${id}`);
  return res;
}

// ------------------------------------------------------------------ cadastro
// Cadastra corretores na trilha do Max a partir do painel (o mesmo que o comando
// "cadastrar novato" no WhatsApp do Max): cria o novato e gera as tarefas da trilha
// pela data de início. Boas-vindas pelo Max:
//  - com contrato: o Max avisa que o contrato vai chegar pela Clicksign, o contrato
//    sai para assinatura e, quando o corretor assina, o Max manda a Cartilha e o hub
//    (lib/onb-contrato.ts → verificarContratos);
//  - sem contrato: as boas-vindas completas saem na hora.
export type NovoNovato = { corretor_id: number; padrinho_id: number | null; contrato?: ContratoNovato | null };
export type ResultadoCadastro = { ok: boolean; cadastrados: string[]; falhas: { nome: string; erro: string }[]; avisos: { nome: string; aviso: string }[] };

const foneWhats = (t: string | null | undefined) => {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? '55' + d : d.length >= 12 ? d : '';
};

export async function previaContrato(c: ContratoNovato): Promise<{ ok: boolean; pdf?: string; erro?: string }> {
  await exigirTela('treinamento');
  try {
    return await gerarPdfContrato(c);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function cadastrarNovatos(lista: NovoNovato[], dataInicio: string, boasVindas: boolean, comContrato = false): Promise<ResultadoCadastro> {
  await exigirTela('treinamento');
  const res: ResultadoCadastro = { ok: true, cadastrados: [], falhas: [], avisos: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataInicio))) return { ok: false, cadastrados: [], falhas: [{ nome: '—', erro: 'Escolha a data de início.' }], avisos: [] };
  const itens = (lista ?? []).filter((x) => Number.isInteger(Number(x?.corretor_id)) && Number(x.corretor_id) > 0);
  if (!itens.length) return { ok: false, cadastrados: [], falhas: [{ nome: '—', erro: 'Escolha pelo menos um corretor.' }], avisos: [] };

  const sb = supabaseAdmin();
  const { data: cs, error } = await sb.from('corretores_associados').select('id,nome,phone,email,calendar_id').in('id', itens.map((x) => Number(x.corretor_id)));
  if (error) return { ok: false, cadastrados: [], falhas: [{ nome: '—', erro: error.message }], avisos: [] };
  const porId = new Map(((cs ?? []) as { id: number; nome: string; phone: string | null; email: string | null; calendar_id: string | null }[]).map((c) => [Number(c.id), c]));

  for (const it of itens) {
    const c = porId.get(Number(it.corretor_id));
    const nome = String(c?.nome ?? '').split(' - ')[0].trim();
    if (!c || !nome) { res.falhas.push({ nome: `#${it.corretor_id}`, erro: 'corretor não encontrado' }); continue; }
    const phone = foneWhats(c.phone);
    if (!phone) { res.falhas.push({ nome, erro: 'sem celular no cadastro de corretor' }); continue; }
    if (comContrato) {
      const v = validarContrato(it.contrato);
      if (v) { res.falhas.push({ nome, erro: v }); continue; }
    }
    const linha: Record<string, unknown> = {
      corretor_id: c.id, nome, phone, data_inicio: dataInicio, calendar_id: c.calendar_id ?? null, status: 'ativo',
    };
    if (comContrato) {
      Object.assign(linha, {
        contrato_empresa: it.contrato!.empresa, contrato_status: 'enviando', contrato_pedido_id: null, contrato_envelope_id: null,
        contrato_erro: null, contrato_enviado_em: new Date().toISOString(), contrato_assinado_em: null, boas_vindas_em: null,
      });
    }
    const padr = Number(it.padrinho_id);
    if (padr > 0 && padr !== Number(c.id)) linha.padrinho_id = padr;
    const { data: nov, error: e1 } = await sb.from('onb_novatos').upsert(linha, { onConflict: 'phone' }).select('id').single();
    if (e1 || !nov) { res.falhas.push({ nome, erro: e1?.message ?? 'não gravou' }); continue; }
    const id = (nov as { id: string }).id;
    const { error: e2 } = await sb.rpc('onb_gerar_tarefas', { p_novato: id });
    if (e2) { res.falhas.push({ nome, erro: 'cadastrado, mas as tarefas não foram geradas: ' + e2.message }); continue; }

    if (comContrato) {
      const ct = it.contrato!;
      // 1) PDF primeiro: se o preenchimento falhar, ninguém recebe nada
      const pdf = await gerarPdfContrato(ct).catch((e: Error) => ({ ok: false as const, erro: e.message, pdf: undefined }));
      if (!pdf.ok) {
        await sb.from('onb_novatos').update({ contrato_status: 'erro', contrato_erro: pdf.erro }).eq('id', id);
        res.falhas.push({ nome, erro: 'cadastrado, mas o contrato não foi gerado: ' + pdf.erro });
        continue;
      }
      // 2) aviso do Max e 3) envio pela Clicksign
      const aviso = await enviarUm({ id, nome, phone }, textoAvisoContrato(ct.dados.nome || nome, ct.empresa), await janelaAberta(phone));
      if (!aviso.ok) res.avisos.push({ nome, aviso: 'o aviso do Max sobre o contrato não saiu: ' + aviso.erro });
      const env = await enviarContrato(ct, phone, pdf.pdf).catch((e: Error) => ({ ok: false as const, erro: e.message, pedido: undefined }));
      if (!env.ok) {
        await sb.from('onb_novatos').update({ contrato_status: 'erro', contrato_erro: env.erro }).eq('id', id);
        res.falhas.push({ nome, erro: 'cadastrado, mas o contrato não foi enviado: ' + env.erro });
        continue;
      }
      await sb.from('onb_novatos').update({ contrato_pedido_id: env.pedido }).eq('id', id);
      res.avisos.push({ nome, aviso: `contrato enviado pela Clicksign (${nomeEmpresa(ct.empresa)}). A Cartilha e o hub vão quando ele(a) assinar.` });
    } else if (boasVindas) {
      const email = String(c.email ?? '').trim().toLowerCase();
      const { texto, avisos } = textoBoasVindas(dataInicio, email, false);
      for (const a of avisos) res.avisos.push({ nome, aviso: a });
      const r = await enviarUm({ id, nome, phone }, texto, false);
      if (!r.ok) { res.falhas.push({ nome, erro: 'cadastrado, mas as boas-vindas não saíram: ' + r.erro }); continue; }
      await sb.from('onb_novatos').update({ boas_vindas_em: new Date().toISOString() }).eq('id', id);
    }
    res.cadastrados.push(nome);
  }
  res.ok = res.falhas.length === 0;
  revalidatePath('/treinamento');
  return res;
}

// Botão "Conferir assinaturas" e reenvio manual.
export async function conferirContratos(): Promise<{ ok: boolean; assinados: string[]; erro?: string }> {
  await exigirTela('treinamento');
  try {
    const r = await verificarContratos({ forcar: true });
    revalidatePath('/treinamento');
    return { ok: true, assinados: r.assinados };
  } catch (e) {
    return { ok: false, assinados: [], erro: (e as Error).message };
  }
}

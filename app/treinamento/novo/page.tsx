// Treinamento de novatos — cadastrar corretores na trilha do Max pelo painel.
// Só admin.
import Link from 'next/link';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Cadastro, { type Opcao } from './cadastro';
import { partesContrato } from '@/lib/onb-contrato';
import { EMPRESAS, FAVORITO_HUB } from '@/lib/contrato-associacao';

export const dynamic = 'force-dynamic';
// o cadastro gera e envia um contrato por corretor, em sequência
export const maxDuration = 300;
export const metadata = { title: 'Cadastrar novatos — Treinamento — REMAX Ville' };

const nomeCurto = (n: string | null | undefined) => String(n ?? '').split(' - ')[0].trim();
const fim8 = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').slice(-8);

export default async function NovoPage() {
  await exigirTela('treinamento');
  const sb = supabaseAdmin();
  const [cor, nov, partes] = await Promise.all([
    sb.from('corretores_associados').select('id,nome,phone,status,cpf,creci,email').order('nome'),
    sb.from('onb_novatos').select('phone,status'),
    partesContrato(),
  ]);
  if (cor.error) throw new Error(cor.error.message);
  const naTrilha = new Map(((nov.data ?? []) as { phone: string; status: string }[]).map((n) => [fim8(n.phone), n.status]));
  type Cor = { id: number; nome: string | null; phone: string | null; status: string | null; cpf: string | null; creci: string | null; email: string | null };
  const ativos = ((cor.data ?? []) as Cor[])
    .filter((c) => (c.status ?? 'ativo') === 'ativo' && nomeCurto(c.nome))
    .map((c) => ({
      id: Number(c.id), nome: nomeCurto(c.nome), temCelular: fim8(c.phone).length === 8, trilha: naTrilha.get(fim8(c.phone)) ?? null,
      cpf: c.cpf ?? '', creci: c.creci ?? '', email: c.email ?? '', telefone: c.phone ?? '',
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const corretores: Opcao[] = ativos;
  const padrinhos = ativos.map((c) => ({ id: c.id, nome: c.nome }));
  // quem assina pela empresa e as testemunhas (onb_contrato_partes), para conferir na tela
  const assinantes = {
    pronto: !partes.erro && EMPRESAS.every((e) => partes.partes[e.id]) && partes.testemunhas.length >= 2,
    empresas: Object.fromEntries(EMPRESAS.map((e) => [e.id, partes.partes[e.id] ? `${partes.partes[e.id]!.razao} — assina ${partes.partes[e.id]!.assina.nome}` : 'não configurada'])),
    testemunhas: partes.testemunhas.map((t) => t.nome),
  };

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/treinamento" className="text-sm text-slate-500 hover:text-slate-800">← Treinamento de novatos</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Cadastrar novatos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Escolha os corretores, a data de início e o padrinho de cada um. O Max cria a trilha de 30 dias a partir da data de
          início. Com o contrato ligado, o Max avisa o corretor, o contrato de associação vai pela Clicksign no WhatsApp dele e,
          quando ele assina, o Max manda a Cartilha e o acesso ao hub. O corretor precisa ter o celular no cadastro de corretor.
        </p>
        <section style={{ backgroundColor: '#ffffff' }} className="mt-6 rounded-2xl border border-slate-200 p-5 shadow-sm">
          <Cadastro corretores={corretores} padrinhos={padrinhos} assinantes={assinantes} favorito={FAVORITO_HUB} />
        </section>
      </main>
    </div>
  );
}

// rquatro — editar uma diligência (13/11). Mesmo formulário da nova, já preenchido.
// Pode editar: responsável da unidade, superadmin e quem cadastrou.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Cabecalho } from '../../../_ui';
import { exigirR4, r4Admin } from '@/lib/r4/supabase';
import { FormularioNova, type Mat, type PF, type PJ } from '../../nova/formulario';

export const metadata = { title: 'Editar diligência' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
const t = (v: unknown) => (v == null ? '' : String(v));
const fmtCpf = (v: unknown) => {
  const d = t(v).replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
};
const fmtCnpj = (v: unknown) => {
  const d = t(v).replace(/\D/g, '');
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;
};

/** Dados gravados (formato do WF-01) → campos do formulário. */
function paraFormulario(dados: Obj) {
  const pf: PF[] = ((dados.vendedoresPF as Obj[]) || []).map((p) => {
    const c = (p.pf_conjuge as Obj | null) || null;
    return {
      nome: t(p.pf_nome),
      cpf: fmtCpf(p.pf_cpf),
      rg: t(p.pf_rg),
      nascimento: t(p.pf_data_nascimento).slice(0, 10),
      genero: t(p.pf_genero),
      mae: t(p.pf_nome_mae),
      nacionalidade: t(p.pf_nacionalidade) || 'brasileiro(a)',
      profissao: t(p.pf_profissao),
      email: t(p.pf_email),
      estado_civil: t(p.pf_estado_civil),
      regime: t(p.pf_regime_bens),
      conjuge: {
        participacao: t(c?.participacao),
        registro: t(c?.registro_aquisicao),
        nome: t(c?.nome),
        cpf: fmtCpf(c?.cpf),
        rg: t(c?.rg),
        nascimento: t(c?.data_nascimento).slice(0, 10),
        genero: t(c?.genero),
        mae: t(c?.nome_mae),
        nacionalidade: t(c?.nacionalidade) || 'brasileiro(a)',
        profissao: t(c?.profissao),
        email: t(c?.email),
      },
    };
  });
  const pj: PJ[] = ((dados.vendedoresPJ as Obj[]) || []).map((p) => {
    const reps = ((p.pj_representantes as Obj[]) || (p.pj_representante ? [p.pj_representante as Obj] : [])).map((r) => ({
      papel: t(r.papel),
      certidoes: !!r.emitir_certidoes,
      nome: t(r.nome),
      cpf: fmtCpf(r.cpf),
      rg: t(r.rg),
      nascimento: t(r.data_nascimento).slice(0, 10),
      genero: t(r.genero),
      mae: t(r.nome_mae),
      nacionalidade: t(r.nacionalidade) || 'brasileiro(a)',
      profissao: t(r.profissao),
      estado_civil: t(r.estado_civil),
      email: t(r.email),
    }));
    return { vinculo: t(p.pj_vinculo), nome: t(p.pj_nome), cnpj: fmtCnpj(p.pj_cnpj), reps };
  });
  const mat: Mat[] = ((dados.matriculas as Obj[]) || []).map((m) => ({
    numero: t(m.matricula_num),
    cartorio: t(m.matricula_cartorio),
    sql: t(m.matricula_iptu),
  }));
  return { pf, pj, mat };
}

export default async function EditarDiligenciaR4({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { usuario, base } = await exigirR4({ ferramenta: 'diligencia' });
  if (!UUID_RE.test(id)) notFound();
  const ehSuper = usuario.papel === 'superadmin';
  let q = r4Admin().from('diligencias').select('id,unidade_id,titulo,motor_id,criado_por,dados').eq('id', id);
  if (!ehSuper) q = q.eq('unidade_id', usuario.unidade_id);
  const { data: dil } = await q.maybeSingle();
  if (!dil || !dil.motor_id) notFound();
  const pode = ehSuper || usuario.papel === 'admin' || dil.criado_por === usuario.id;

  const dados = (dil.dados || {}) as Obj;
  const ini = paraFormulario(dados);
  const { data: pp } = await r4Admin().from('precos').select('preco,cobravel').eq('tipo', '*').maybeSingle();
  const preco = pp?.cobravel ? Number(pp.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;

  return (
    <>
      <Cabecalho base={base} unidade={usuario.unidade?.nome ?? null} logo={usuario.unidade?.logo_url ?? null} nome={usuario.nome} superadmin={ehSuper} papel={usuario.papel} ferramentas={usuario.ferramentas} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`${base}/diligencias/${id}`} className="text-sm text-slate-500 hover:text-slate-800">← Voltar à diligência</Link>
        <h1 className="mt-2 text-2xl font-semibold">Editar diligência</h1>
        {!pode ? (
          <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Só o responsável da unidade ou quem cadastrou pode editar esta diligência.
          </p>
        ) : (
          <>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Pessoa, matrícula ou SQL novos ganham as certidões automaticamente.</li>
              <li>Correções nos dados de quem já está na diligência (nome, mãe, nascimento, RG) passam a valer nas próximas reemissões. Use &quot;Reemitir&quot; no card da certidão que precisar sair de novo.</li>
              <li>Quem você tirar daqui continua com as certidões na diligência. Para o cliente não ver, desmarque &quot;Mostrar&quot; no card.</li>
            </ul>
            <div className="mt-6">
              <FormularioNova
                unidades={null}
                base={base}
                equipe={null}
                preco={preco}
                edicao={{ id: dil.id, endereco: t(dados.endereco) || t(dil.titulo), pf: ini.pf, pj: ini.pj, mat: ini.mat, estados: Array.isArray(dados.estados_extras) ? (dados.estados_extras as string[]) : [] }}
              />
            </div>
          </>
        )}
      </main>
    </>
  );
}

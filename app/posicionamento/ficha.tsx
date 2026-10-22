// Ficha de um condomínio (nova ou edição). Formulário simples, sem JS no cliente:
// grava pela server action e volta para a lista.
import { BLOCOS, prioridadeSugerida, pontuacao, type Condominio, type DefCampo } from '@/lib/posicionamento';
import { salvarCondominio } from './actions';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600';

function valorInicial(c: Partial<Condominio> | null, d: DefCampo): string {
  const v = c?.[d.k];
  if (v === null || v === undefined) return d.k === 'status_relacionamento' ? 'nao_iniciado' : '';
  if (d.tipo === 'num' && typeof v === 'number') return String(v).replace('.', ',');
  return String(v);
}

function Campo({ d, c }: { d: DefCampo; c: Partial<Condominio> | null }) {
  const v = valorInicial(c, d);
  const nome = String(d.k);
  let input: React.ReactNode;
  if (d.tipo === 'select') {
    input = (
      <select name={nome} defaultValue={v} className={inputCls}>
        {d.opcoes!.map(([val, lab]) => (<option key={val} value={val}>{lab}</option>))}
      </select>
    );
  } else if (d.tipo === 'longo') {
    input = <textarea name={nome} defaultValue={v} rows={2} className={inputCls} />;
  } else {
    input = (
      <input
        name={nome}
        defaultValue={v}
        type={d.tipo === 'data' ? 'date' : 'text'}
        inputMode={d.tipo === 'int' ? 'numeric' : d.tipo === 'num' ? 'decimal' : undefined}
        required={d.obrigatorio}
        className={inputCls}
      />
    );
  }
  return (
    <div className={d.largo ? 'sm:col-span-2' : ''}>
      <label className={labelCls}>{d.label}{d.obrigatorio && <span className="text-rose-600"> *</span>}</label>
      {input}
      {d.dica && <p className="mt-1 text-[11px] text-slate-400">{d.dica}</p>}
    </div>
  );
}

export default function Ficha({
  c,
  regioes,
  regiaoPadrao,
  corretores,
  corretorPadrao,
}: {
  c: Condominio | null;
  regioes: string[];
  regiaoPadrao: string;
  corretores: { id: number; nome: string }[] | null; // só admin escolhe o corretor
  corretorPadrao: number | null;
}) {
  return (
    <form action={salvarCondominio} className="space-y-6">
      {c && <input type="hidden" name="id" value={c.id} />}

      <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Região</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Use sempre o mesmo nome para a mesma região — é por ela que o painel consolida o seu posicionamento.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {corretores && (
            <div className="sm:col-span-2">
              <label className={labelCls}>Corretor</label>
              <select name="corretor_id" defaultValue={String(c?.corretor_id ?? corretorPadrao ?? '')} className={inputCls}>
                {corretores.map((o) => (<option key={o.id} value={o.id}>{o.nome}</option>))}
              </select>
            </div>
          )}
          {regioes.length > 0 && (
            <div>
              <label className={labelCls}>Região já cadastrada</label>
              <select name="regiao" defaultValue={c?.regiao ?? regiaoPadrao} className={inputCls}>
                {regioes.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>{regioes.length ? 'Ou uma região nova' : 'Região'}{!regioes.length && <span className="text-rose-600"> *</span>}</label>
            <input
              name="regiao_nova"
              required={!regioes.length}
              placeholder="Ex.: Jardim Paulista — Al. Santos × R. Estados Unidos"
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {BLOCOS.map((b) => (
        <section key={b.titulo} style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">{b.titulo}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{b.descricao}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {b.campos.map((d) => (<Campo key={String(d.k)} d={d} c={c} />))}
          </div>
        </section>
      ))}

      <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Prioridade</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          O painel sugere A/B/C pelo giro, tamanho, oferta, relacionamento e concorrência
          {c ? <> — hoje a sugestão é <b>{prioridadeSugerida(c)}</b> ({pontuacao(c)} pontos)</> : null}. Só preencha se quiser outra.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Prioridade definida por você</label>
            <select name="prioridade_manual" defaultValue={c?.prioridade_manual ?? ''} className={inputCls}>
              <option value="">Usar a sugerida</option>
              <option value="A">A — foco agora</option>
              <option value="B">B — manter presença</option>
              <option value="C">C — monitorar</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Observações</label>
            <textarea name="observacoes" defaultValue={c?.observacoes ?? ''} rows={3} className={inputCls} />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button type="submit" className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
          {c ? 'Salvar alterações' : 'Adicionar ao mapa'}
        </button>
      </div>
    </form>
  );
}

// Ficha de um condomínio (nova ou edição). Formulário simples, sem JS no cliente:
// grava pela server action e volta para a lista.
import { BLOCOS, prioridadeSugerida, pontuacao, lerContatos, type Condominio, type DefCampo } from '@/lib/posicionamento';
import { salvarCondominio } from './actions';
import { RegiaoCampo, ContatosCampo, ItbiBotao } from './ficha-cliente';

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
  corretorFixo,
}: {
  c: Condominio | null;
  regioes: string[];
  regiaoPadrao: string;
  corretores: { id: number; nome: string }[] | null; // só admin escolhe o corretor (edição)
  corretorPadrao: number | null;
  corretorFixo?: number | null; // admin cadastrando para o corretor escolhido na tela
}) {
  // fichas antigas: o zelador digitado antes vira o primeiro contato da lista
  const salvos = lerContatos(c?.contatos);
  const contatosIniciais = salvos.length || !c?.zelador_nome
    ? salvos
    : [{ nome: c.zelador_nome, funcao: 'Zelador', turno: '', whatsapp: '', autorizou: false }];
  return (
    <form action={salvarCondominio} className="space-y-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      {corretorFixo ? <input type="hidden" name="corretor_id" value={corretorFixo} /> : null}

      <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Região</h2>
        <p className="mt-0.5 text-xs text-slate-500">É por ela que o painel consolida o seu posicionamento.</p>
        <div className="mt-4 space-y-4">
          {corretores && (
            <div>
              <label className={labelCls}>Corretor</label>
              <select name="corretor_id" defaultValue={String(c?.corretor_id ?? corretorPadrao ?? '')} className={inputCls}>
                {corretores.map((o) => (<option key={o.id} value={o.id}>{o.nome}</option>))}
              </select>
            </div>
          )}
          <RegiaoCampo regioes={regioes} padrao={c?.regiao ?? regiaoPadrao} />
        </div>
      </section>

      {(['mesa', 'visita'] as const).map((etapa) => (
        <div key={etapa} className="space-y-4">
          <div className="flex items-baseline gap-3 border-b border-slate-200 pb-2 pt-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">{etapa === 'mesa' ? 1 : 2}</span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{etapa === 'mesa' ? 'Antes de ir (da mesa)' : 'Na visita (pesquisa)'}</h2>
              <p className="text-xs text-slate-500">
                {etapa === 'mesa'
                  ? 'Dados do prédio, mercado e o que se vê da rua. Dá para salvar só com esta parte e completar depois da visita.'
                  : 'Pesquisa de 15 minutos com zelador, porteiro ou gerente predial, na ordem do treinamento.'}
              </p>
            </div>
          </div>
          {BLOCOS.filter((b) => b.etapa === etapa).map((b) => (
            <section key={b.chave} style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{b.titulo}</h3>
              {b.descricao && <p className="mt-0.5 text-xs text-slate-500">{b.descricao}</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {b.chave === 'mercado' && <ItbiBotao />}
                {b.campos.map((d) => (<Campo key={String(d.k)} d={d} c={c} />))}
              </div>
            </section>
          )).flatMap((el, i, arr) =>
            etapa === 'visita' && i === arr.length - 1
              ? [
                  <section key="contatos" style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-slate-900">Contatos do prédio</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Zelador, porteiros de cada turno, gerente predial: quem autorizou deixar o contato.</p>
                    <div className="mt-4"><ContatosCampo iniciais={contatosIniciais} /></div>
                  </section>,
                  el,
                ]
              : [el]
          )}
        </div>
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

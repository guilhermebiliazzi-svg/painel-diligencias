'use client';

// Aba "Novo contrato": preencher, conferir o PDF e enviar para assinatura.
import { useEffect, useMemo, useState, useTransition } from 'react';
import { gerarPdf, enviarAssinatura, statusEnvio, type FormRepresentacao, type Pessoa, type CorretorOpcao } from './actions';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-50';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600';
const secCls = 'mb-2 mt-7 text-[11px] font-bold uppercase tracking-wider text-slate-500';

const vazia = (): Pessoa => ({
  nome: '', doc: '', rg: '', nacionalidade: 'brasileira', estado_civil: '', endereco: '', email: '', telefone: '',
  ie: '', complemento: '', bairro: '', municipio: '', estado: '',
});

const ESTADOS_CIVIS = ['solteiro(a)', 'casado(a)', 'divorciado(a)', 'separado(a)', 'viúvo(a)', 'união estável'];
const TIPOS = [
  'Apartamento', 'Apartamento duplex', 'Apartamento garden', 'Cobertura', 'Studio', 'Kitnet', 'Flat',
  'Casa', 'Casa em condomínio', 'Casa de vila', 'Sobrado', 'Sobrado em condomínio',
  'Loja', 'Sala comercial', 'Conjunto comercial', 'Prédio comercial', 'Galpão', 'Terreno', 'Outro',
];

function Campo({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function NovoContrato({
  admin,
  corretores,
  corretorPadrao,
}: {
  admin: boolean;
  corretores: CorretorOpcao[];
  corretorPadrao: number | null;
}) {
  const [tipo, setTipo] = useState<'pf' | 'pj'>('pf');
  const [imovel, setImovel] = useState({
    tipo: 'Apartamento', endereco: '', complemento: '', bairro: '', municipio: 'São Paulo', estado: 'SP',
    valor: '', matricula: '', cartorio: '', iptu: '', observacoes: '',
  });
  const [pessoas, setPessoas] = useState<Pessoa[]>([vazia()]);
  const [corretorId, setCorretorId] = useState<number | null>(corretorPadrao);
  const corretor = corretores.find((c) => c.id === corretorId) || null;
  const [corretorCpf, setCorretorCpf] = useState(corretor?.cpf || '');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfDe, setPdfDe] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [gerando, startGerar] = useTransition();
  const [enviandoAcao, startEnviar] = useTransition();
  // pedido em andamento no n8n (o envio segue em segundo plano)
  const [pedido, setPedido] = useState<string | null>(null);
  const enviando = enviandoAcao || !!pedido;
  const ocupado = gerando || enviando;

  useEffect(() => {
    if (!pedido) return;
    let vivo = true;
    const inicio = Date.now();
    const olhar = async () => {
      const r = await statusEnvio(pedido);
      if (!vivo) return;
      if (r.status === 'enviado') {
        setPedido(null);
        setOk('Enviado para assinatura. Cada signatário recebe o link por e-mail do Clicksign.');
      } else if (r.status === 'duplicado') {
        setPedido(null);
        setErro('Este contrato já tinha sido enviado há poucos minutos — não criei outro envelope. Confira em "Contratos enviados".');
      } else if (r.status === 'erro') {
        setPedido(null);
        setErro(r.erro || 'O envio não deu certo. Nada foi enviado a ninguém.');
      } else if (Date.now() - inicio > 14 * 60000) {
        setPedido(null);
        setErro('O envio está demorando mais que o normal. Confira em "Contratos enviados" daqui a pouco antes de tentar de novo.');
      } else {
        setTimeout(olhar, 4000);
      }
    };
    const t = setTimeout(olhar, 4000);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [pedido]);

  const form: FormRepresentacao = useMemo(
    () => ({ tipo, imovel, pessoas, corretor_id: corretorId, corretor_cpf: corretorCpf }),
    [tipo, imovel, pessoas, corretorId, corretorCpf]
  );
  const chave = JSON.stringify(form);
  const pdfAtual = !!pdfUrl && pdfDe === chave;
  const max = tipo === 'pj' ? 2 : 6;

  const setIm = (k: keyof typeof imovel, v: string) => setImovel({ ...imovel, [k]: v });
  const setP = (i: number, k: keyof Pessoa, v: string) => setPessoas(pessoas.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  function trocarTipo(t: 'pf' | 'pj') {
    if (t === tipo) return;
    setTipo(t);
    setPessoas([vazia()]);
  }

  function gerar() {
    setErro(null);
    setOk(null);
    startGerar(async () => {
      const r = await gerarPdf(form);
      if (!r.ok || !r.pdf) {
        setErro(r.erro || 'Não consegui gerar o PDF.');
        return;
      }
      const bytes = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0));
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
      setPdfDe(chave);
    });
  }

  function enviar() {
    setErro(null);
    setOk(null);
    if (!pdfAtual) {
      setErro('Gere o PDF de novo e confira antes de enviar — os dados mudaram desde a última prévia.');
      return;
    }
    const n = pessoas.filter((p) => p.nome.trim()).length;
    if (!window.confirm(`Enviar para assinatura? ${n} ${tipo === 'pj' ? 'empresa(s)' : 'proprietário(s)'} + Ville assinam; ${corretor?.nome || 'o corretor'} e Jessica como testemunhas.`)) return;
    startEnviar(async () => {
      const r = await enviarAssinatura(form);
      if (!r.ok || !r.pedido) {
        setErro(r.erro || 'O envio não deu certo. Nada foi enviado a ninguém.');
        return;
      }
      setPedido(r.pedido);
    });
  }

  if (ok) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-base font-semibold text-emerald-800">Contrato enviado para assinatura.</p>
        <p className="mt-1 text-sm text-emerald-900">{ok}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/representacao?aba=env" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
            Ver em Contratos enviados
          </a>
          <button
            type="button"
            onClick={() => {
              setOk(null);
              setPessoas([vazia()]);
              setImovel({ ...imovel, endereco: '', complemento: '', bairro: '', valor: '', matricula: '', cartorio: '', iptu: '', observacoes: '' });
              setPdfUrl(null);
              setPdfDe('');
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Novo contrato
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Proprietário é</div>
      <div className="flex gap-2">
        {(['pf', 'pj'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => trocarTipo(t)}
            disabled={ocupado}
            className={`flex-1 rounded-lg border px-3 py-2.5 text-left text-sm ${tipo === t ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900' : 'border-slate-300 bg-white text-slate-700'}`}
          >
            {t === 'pf' ? 'Pessoa física' : 'Empresa (PJ)'}
            <span className="block text-xs font-normal text-slate-500">{t === 'pf' ? 'até 6 proprietários' : 'até 2 empresas'}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">O modelo certo (até 2, 4 ou 6 contratantes) é escolhido sozinho pela quantidade de proprietários.</p>

      <div className={secCls}>Imóvel</div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo label="Endereço *" span>
          <input value={imovel.endereco} onChange={(e) => setIm('endereco', e.target.value)} disabled={ocupado} className={inputCls} placeholder="Rua, número" />
        </Campo>
        <Campo label="Complemento">
          <input value={imovel.complemento} onChange={(e) => setIm('complemento', e.target.value)} disabled={ocupado} className={inputCls} placeholder="Apto 52" />
        </Campo>
        <Campo label="Bairro *">
          <input value={imovel.bairro} onChange={(e) => setIm('bairro', e.target.value)} disabled={ocupado} className={inputCls} />
        </Campo>
        <Campo label="Município">
          <input value={imovel.municipio} onChange={(e) => setIm('municipio', e.target.value)} disabled={ocupado} className={inputCls} />
        </Campo>
        <Campo label="Estado">
          <input value={imovel.estado} onChange={(e) => setIm('estado', e.target.value)} disabled={ocupado} className={inputCls} maxLength={2} />
        </Campo>
        <Campo label="Tipo">
          <select value={imovel.tipo} onChange={(e) => setIm('tipo', e.target.value)} disabled={ocupado} className={inputCls}>
            {TIPOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Valor de venda (R$) *">
          <input value={imovel.valor} onChange={(e) => setIm('valor', e.target.value)} disabled={ocupado} className={inputCls} placeholder="1.200.000,00" inputMode="decimal" />
        </Campo>
        <Campo label="Matrícula *">
          <input value={imovel.matricula} onChange={(e) => setIm('matricula', e.target.value)} disabled={ocupado} className={inputCls} />
        </Campo>
        <Campo label="Cartório de registro *">
          <input value={imovel.cartorio} onChange={(e) => setIm('cartorio', e.target.value)} disabled={ocupado} className={inputCls} placeholder="14º RI" />
        </Campo>
        <Campo label="Contribuinte (IPTU)">
          <input value={imovel.iptu} onChange={(e) => setIm('iptu', e.target.value)} disabled={ocupado} className={inputCls} placeholder="000.000.0000-0" />
        </Campo>
      </div>
      <div className="mt-3">
        <label className={labelCls}>Observações</label>
        <textarea value={imovel.observacoes} onChange={(e) => setIm('observacoes', e.target.value)} disabled={ocupado} className={inputCls} rows={2} placeholder="Opcional — sai no campo de observações do contrato" />
      </div>

      <div className={secCls}>{tipo === 'pj' ? 'Empresas proprietárias (contratantes)' : 'Proprietários (contratantes)'}</div>
      <div className="space-y-3">
        {pessoas.map((p, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-800">
              {tipo === 'pj' ? `Empresa ${i + 1}` : `Proprietário ${i + 1}`}
              {pessoas.length > 1 && (
                <button type="button" onClick={() => setPessoas(pessoas.filter((_, j) => j !== i))} disabled={ocupado} className="text-xs font-normal text-slate-500 hover:text-rose-600">
                  remover
                </button>
              )}
            </div>
            {tipo === 'pf' ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <Campo label="Nome completo *" span>
                  <input value={p.nome} onChange={(e) => setP(i, 'nome', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="CPF *">
                  <input value={p.doc} onChange={(e) => setP(i, 'doc', e.target.value)} disabled={ocupado} className={inputCls} inputMode="numeric" />
                </Campo>
                <Campo label="RG">
                  <input value={p.rg} onChange={(e) => setP(i, 'rg', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="Nacionalidade">
                  <input value={p.nacionalidade} onChange={(e) => setP(i, 'nacionalidade', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="Estado civil">
                  <select value={p.estado_civil} onChange={(e) => setP(i, 'estado_civil', e.target.value)} disabled={ocupado} className={inputCls}>
                    <option value="">—</option>
                    {ESTADOS_CIVIS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Endereço residencial" span>
                  <input value={p.endereco} onChange={(e) => setP(i, 'endereco', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="E-mail * (recebe o link)" span>
                  <input value={p.email} onChange={(e) => setP(i, 'email', e.target.value)} disabled={ocupado} className={inputCls} type="email" />
                </Campo>
                <Campo label="Celular">
                  <input value={p.telefone} onChange={(e) => setP(i, 'telefone', e.target.value)} disabled={ocupado} className={inputCls} placeholder="11988887777" inputMode="tel" />
                </Campo>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-4">
                <Campo label="Razão social *" span>
                  <input value={p.nome} onChange={(e) => setP(i, 'nome', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="CNPJ *">
                  <input value={p.doc} onChange={(e) => setP(i, 'doc', e.target.value)} disabled={ocupado} className={inputCls} inputMode="numeric" />
                </Campo>
                <Campo label="Inscrição estadual">
                  <input value={p.ie} onChange={(e) => setP(i, 'ie', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="Endereço da sede" span>
                  <input value={p.endereco} onChange={(e) => setP(i, 'endereco', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="Complemento">
                  <input value={p.complemento} onChange={(e) => setP(i, 'complemento', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="Bairro">
                  <input value={p.bairro} onChange={(e) => setP(i, 'bairro', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="Município">
                  <input value={p.municipio} onChange={(e) => setP(i, 'municipio', e.target.value)} disabled={ocupado} className={inputCls} />
                </Campo>
                <Campo label="Estado">
                  <input value={p.estado} onChange={(e) => setP(i, 'estado', e.target.value)} disabled={ocupado} className={inputCls} maxLength={2} />
                </Campo>
                <Campo label="E-mail de quem assina pela empresa *" span>
                  <input value={p.email} onChange={(e) => setP(i, 'email', e.target.value)} disabled={ocupado} className={inputCls} type="email" />
                </Campo>
              </div>
            )}
          </div>
        ))}
        {pessoas.length < max && (
          <button
            type="button"
            onClick={() => setPessoas([...pessoas, vazia()])}
            disabled={ocupado}
            className="rounded-lg border border-dashed border-slate-400 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            + adicionar {tipo === 'pj' ? 'empresa' : 'proprietário'}
          </button>
        )}
      </div>

      <div className={secCls}>Corretor e testemunhas</div>
      <div className="grid gap-3 sm:grid-cols-4">
        {admin ? (
          <Campo label="Corretor *" span>
            <select value={corretorId ?? ''} onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setCorretorId(id);
                setCorretorCpf(corretores.find((c) => c.id === id)?.cpf || '');
              }} disabled={ocupado} className={inputCls}>
              <option value="">Selecione…</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.creci ? ` — CRECI ${c.creci}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        ) : (
          <Campo label="Corretor" span>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
              {corretor ? `${corretor.nome}${corretor.creci ? ` — CRECI ${corretor.creci}` : ''}` : 'Seu usuário não está ligado a um cadastro de corretor.'}
            </div>
          </Campo>
        )}
        <Campo label="CPF do corretor">
          <input value={corretorCpf} onChange={(e) => setCorretorCpf(e.target.value)} disabled={ocupado} className={inputCls} placeholder="sai no contrato" />
        </Campo>
      </div>
      {corretor && !corretor.temEmail && (
        <p className="mt-2 text-xs font-semibold text-rose-700">O cadastro deste corretor está sem e-mail — ele precisa de e-mail para assinar como testemunha.</p>
      )}
      <div className="mt-3 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
        Assinam como <b>partes</b>: {tipo === 'pj' ? 'a(s) empresa(s)' : 'o(s) proprietário(s)'} e a <b>Ville</b> (Guilherme Biliazzi).
        <br />
        Assinam como <b>testemunhas</b>: o <b>corretor</b> e <b>Jessica Silva Araujo</b>.
        <br />
        Local e data: São Paulo, data de hoje. Tudo por e-mail do Clicksign.
      </div>

      {pdfUrl && (
        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className={pdfAtual ? 'text-slate-500' : 'font-semibold text-amber-700'}>
              {pdfAtual ? 'Prévia do contrato — confira antes de enviar.' : 'Você mudou dados depois da prévia: gere o PDF de novo.'}
            </span>
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
              abrir em outra aba
            </a>
          </div>
          <iframe src={pdfUrl} title="Prévia do contrato" className="h-[70vh] w-full rounded-xl border border-slate-200 bg-slate-50" />
        </div>
      )}

      {pedido && (
        <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Enviando para o Clicksign… Normalmente leva menos de um minuto. Se o Clicksign estiver fora do ar, o sistema espera e
          continua sozinho (até 12 minutos) — pode sair desta tela, o envio não para.
        </p>
      )}
      {erro && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={gerar}
          disabled={ocupado}
          className="rounded-lg border border-blue-700 bg-white px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
        >
          {gerando ? 'Gerando PDF…' : pdfUrl ? 'Gerar PDF de novo' : 'Gerar PDF para conferir'}
        </button>
        <button
          type="button"
          onClick={enviar}
          disabled={ocupado || !pdfAtual}
          title={pdfAtual ? '' : 'Gere o PDF e confira antes de enviar'}
          className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-base font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {enviando ? 'Enviando para o Clicksign…' : 'Enviar para assinatura'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        O botão de envio libera depois que você gera o PDF. O envio usa exatamente os dados da prévia.
      </p>
    </section>
  );
}

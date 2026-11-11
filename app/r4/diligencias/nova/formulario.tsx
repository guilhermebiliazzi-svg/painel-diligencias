'use client';

// Formulário de nova diligência do rquatro. Os campos seguem o formulário da
// Ville (WF-01): estado civil, regime, cônjuge (com a participação no bem) e,
// na empresa, o vínculo (vendedora ou empresa do vendedor) e os signatários.
// Tudo isso fica gravado na diligência para o contrato depois.
//
// Documentos (igual ao formulário da Ville): a identidade do vendedor e do
// cônjuge é lida automaticamente (OCR, /api/r4/ocr) e preenche os campos.
// Identidade, comprovante de residência e certidão de estado civil ficam no
// navegador e, depois que a diligência é criada, vão para os cards de documento
// (mesmo envio do botão "Enviar arquivo" do card), na pasta do Drive da unidade.
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cardsDocumentos, criarDiligencia, type CardDocumento } from '../actions';
import { enviarArquivoParaCard } from '@/app/admin/EnviarArquivoCard';

type Conjuge = {
  participacao: string;
  registro: string;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  genero: string;
  mae: string;
  nacionalidade: string;
  profissao: string;
  email: string;
};
type PF = {
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  genero: string;
  mae: string;
  nacionalidade: string;
  profissao: string;
  email: string;
  estado_civil: string;
  regime: string;
  conjuge: Conjuge;
};
type Rep = {
  papel: string;
  certidoes: boolean;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  genero: string;
  mae: string;
  nacionalidade: string;
  profissao: string;
  estado_civil: string;
  email: string;
};
type PJ = { vinculo: string; nome: string; cnpj: string; reps: Rep[] };
type Mat = { numero: string; cartorio: string; sql: string };

const conjVazio = (): Conjuge => ({
  participacao: '', registro: '', nome: '', cpf: '', rg: '', nascimento: '', genero: '', mae: '',
  nacionalidade: 'brasileiro(a)', profissao: '', email: '',
});
const pfVazia = (): PF => ({
  nome: '', cpf: '', rg: '', nascimento: '', genero: '', mae: '', nacionalidade: 'brasileiro(a)', profissao: '',
  email: '', estado_civil: '', regime: '', conjuge: conjVazio(),
});
const repVazio = (): Rep => ({
  papel: '', certidoes: false, nome: '', cpf: '', rg: '', nascimento: '', genero: '', mae: '',
  nacionalidade: 'brasileiro(a)', profissao: '', estado_civil: '', email: '',
});
const pjVazia = (): PJ => ({ vinculo: '', nome: '', cnpj: '', reps: [repVazio()] });
const matVazia = (): Mat => ({ numero: '', cartorio: '', sql: '' });

export const temConjuge = (ec: string) => ec === 'casado' || ec === 'uniao_estavel';

// Arquivos de cada vendedor (mesma posição da lista de vendedores)
type Docs = { identidade?: File; comprovante?: File; estado_civil?: File; conjuge?: File };
type Leitura = { st: 'lendo' | 'ok' | 'erro'; msg: string };
type DadosOcr = { nome: string | null; cpf: string | null; rg: string | null; nascimento: string | null; mae: string | null; genero: string | null };

const LIMITE_OCR = 4 * 1024 * 1024;
const ACEITA = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf';

/** Foto grande vira JPEG de até 2000 px (a leitura não precisa de mais e o envio fica leve). */
async function reduzirFoto(f: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(f.type) || f.size < 1_500_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const esc = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * esc);
    c.height = Math.round(bmp.height * esc);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
  } catch {
    return f;
  }
}

async function lerDocumento(f: File): Promise<DadosOcr> {
  const arq = await reduzirFoto(f);
  if (arq.size > LIMITE_OCR) throw new Error('Arquivo acima de 4 MB para a leitura automática. Preencha à mão.');
  const fd = new FormData();
  fd.set('arquivo', arq);
  const r = await fetch('/api/r4/ocr', { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.sucesso) throw new Error(j.erro || 'Não consegui ler o documento. Preencha à mão.');
  return j.dados as DadosOcr;
}

function CampoArquivo({
  titulo,
  ocr,
  arquivo,
  leitura,
  escolhe,
}: {
  titulo: string;
  ocr?: boolean;
  arquivo?: File;
  leitura?: Leitura;
  escolhe: (f: File | undefined) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <p className={rotulo}>
        {titulo}
        {ocr && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">preenche automático</span>}
      </p>
      <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm hover:border-slate-400">
        <input type="file" accept={ACEITA} className="hidden" onChange={(e) => escolhe(e.target.files?.[0])} />
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">Escolher arquivo</span>
        <span className={`min-w-0 truncate text-xs ${arquivo ? 'text-slate-800' : 'text-slate-400'}`}>{arquivo ? arquivo.name : 'Foto ou PDF'}</span>
        {arquivo && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              escolhe(undefined);
            }}
            className="ml-auto text-xs font-semibold text-slate-500 underline hover:text-red-700"
          >
            tirar
          </button>
        )}
      </label>
      {leitura && (
        <p className={`mt-1 text-xs ${leitura.st === 'erro' ? 'text-red-700' : leitura.st === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>{leitura.msg}</p>
      )}
    </div>
  );
}

const campo = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const rotulo = 'block text-sm font-medium text-slate-700';
const botaoMais = 'ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50';
const remover = 'ml-auto text-xs font-semibold text-slate-500 underline hover:text-red-700';

function mascaraCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function mascaraCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

const ESTADO_CIVIL = [
  ['solteiro', 'Solteiro(a)'],
  ['casado', 'Casado(a)'],
  ['uniao_estavel', 'União estável'],
  ['divorciado', 'Divorciado(a)'],
  ['viuvo', 'Viúvo(a)'],
  ['separado', 'Separado(a) judicialmente'],
];
const REGIMES = [
  ['comunhao_parcial', 'Comunhão parcial'],
  ['comunhao_universal', 'Comunhão universal'],
  ['separacao_total', 'Separação total/obrigatória'],
  ['participacao_final', 'Participação final nos aquestos'],
];
const PARTICIPACAO = [
  ['coproprietario', 'Coproprietário — bem comum do casal (é parte vendedora)'],
  ['anuente_anterior', 'Apenas anuente — bem adquirido antes do casamento'],
  ['anuente_gratuito', 'Apenas anuente — bem recebido em doação ou herança'],
  ['indeterminado', 'A determinar'],
];

function Sel({ valor, muda, opcoes, vazio = 'Escolha…' }: { valor: string; muda: (v: string) => void; opcoes: string[][]; vazio?: string }) {
  return (
    <select value={valor} onChange={(e) => muda(e.target.value)} className={campo}>
      <option value="">{vazio}</option>
      {opcoes.map(([v, t]) => (
        <option key={v} value={v}>{t}</option>
      ))}
    </select>
  );
}

/** Campos pessoais comuns (titular, cônjuge e signatário). */
function DadosPessoa<T extends { nome: string; cpf: string; rg: string; nascimento: string; genero: string; mae: string; nacionalidade: string; profissao: string; email: string }>({
  p,
  muda,
  obrig,
}: {
  p: T;
  muda: (k: keyof T, v: string) => void;
  obrig: boolean;
}) {
  const a = obrig ? ' *' : '';
  return (
    <>
      <label className={`${rotulo} sm:col-span-2`}>Nome completo *<input value={p.nome} onChange={(e) => muda('nome', e.target.value)} className={campo} /></label>
      <label className={rotulo}>CPF *<input value={p.cpf} onChange={(e) => muda('cpf', mascaraCpf(e.target.value))} className={campo} inputMode="numeric" /></label>
      <label className={rotulo}>RG<input value={p.rg} onChange={(e) => muda('rg', e.target.value)} className={campo} /></label>
      <label className={rotulo}>Data de nascimento{a}<input type="date" value={p.nascimento} onChange={(e) => muda('nascimento', e.target.value)} className={campo} /></label>
      <label className={rotulo}>
        Gênero{a}
        <Sel valor={p.genero} muda={(v) => muda('genero', v)} opcoes={[['F', 'Feminino'], ['M', 'Masculino']]} />
      </label>
      <label className={`${rotulo} sm:col-span-2`}>Nome da mãe{a}<input value={p.mae} onChange={(e) => muda('mae', e.target.value)} className={campo} /></label>
      <label className={rotulo}>Nacionalidade<input value={p.nacionalidade} onChange={(e) => muda('nacionalidade', e.target.value)} className={campo} /></label>
      <label className={rotulo}>Profissão<input value={p.profissao} onChange={(e) => muda('profissao', e.target.value)} className={campo} /></label>
      <label className={`${rotulo} sm:col-span-2`}>E-mail<input type="email" value={p.email} onChange={(e) => muda('email', e.target.value)} className={campo} /></label>
    </>
  );
}

export function FormularioNova({
  unidades,
  base,
  equipe,
}: {
  unidades: { id: string; nome: string }[] | null;
  base: string;
  /** corretores da unidade (só para o responsável escolher quem vê) */
  equipe: { id: string; nome: string | null; email: string }[] | null;
}) {
  const router = useRouter();
  const [r, acao, enviando] = useActionState(criarDiligencia, null);
  const [pf, setPf] = useState<PF[]>([pfVazia()]);
  const [docs, setDocs] = useState<Docs[]>([{}]);
  const [leituras, setLeituras] = useState<Record<string, Leitura>>({});
  const [corretores, setCorretores] = useState<string[]>([]);
  const [envio, setEnvio] = useState<{ fase: 'docs' | 'fim'; msg: string; erros: string[] } | null>(null);
  const enviouDocs = useRef<string | null>(null);

  const mudaDoc = (i: number, k: keyof Docs, f: File | undefined) => setDocs((a) => a.map((d, j) => (j === i ? { ...d, [k]: f } : d)));
  const marcaLeitura = (chave: string, l: Leitura | null) =>
    setLeituras((m) => {
      const n = { ...m };
      if (l) n[chave] = l;
      else delete n[chave];
      return n;
    });

  /** Identidade escolhida: guarda o arquivo e preenche os campos com a leitura automática. */
  async function escolheIdentidade(i: number, quem: 'titular' | 'conjuge', f: File | undefined) {
    mudaDoc(i, quem === 'titular' ? 'identidade' : 'conjuge', f);
    const chave = `${quem}-${i}`;
    if (!f) return marcaLeitura(chave, null);
    marcaLeitura(chave, { st: 'lendo', msg: 'Lendo o documento…' });
    try {
      const d = await lerDocumento(f);
      const campos: [string, string | null][] = [
        ['nome', d.nome],
        ['cpf', d.cpf],
        ['rg', d.rg],
        ['nascimento', d.nascimento],
        ['genero', d.genero],
        ['mae', d.mae],
      ];
      setPf((a) =>
        a.map((p, j) => {
          if (j !== i) return p;
          const alvo = { ...(quem === 'titular' ? p : p.conjuge) } as Record<string, string>;
          for (const [k, v] of campos) if (v) alvo[k] = v;
          return quem === 'titular' ? ({ ...p, ...alvo } as PF) : { ...p, conjuge: alvo as unknown as Conjuge };
        })
      );
      marcaLeitura(chave, { st: 'ok', msg: 'Dados preenchidos pelo documento. Confira antes de enviar.' });
    } catch (e) {
      marcaLeitura(chave, { st: 'erro', msg: e instanceof Error ? e.message : 'Não consegui ler o documento. Preencha à mão.' });
    }
  }

  // Diligência criada: envia os documentos para os cards e abre a diligência
  useEffect(() => {
    if (!r?.ok || !r.id || enviouDocs.current === r.id) return;
    const id = r.id;
    enviouDocs.current = id;
    const destino = `${base}/diligencias/${id}?nova=1`;
    const fila: { card: { tipo: string; cpf: string }; arquivo: File; nome: string }[] = [];
    pf.forEach((p, i) => {
      const d = docs[i] || {};
      const cpf = p.cpf.replace(/\D/g, '');
      const quem = p.nome || `Vendedor(a) ${i + 1}`;
      if (d.identidade) fila.push({ card: { tipo: 'doc_identidade', cpf }, arquivo: d.identidade, nome: `Identidade — ${quem}` });
      if (d.comprovante) fila.push({ card: { tipo: 'comp_residencia', cpf }, arquivo: d.comprovante, nome: `Comprovante de residência — ${quem}` });
      if (d.estado_civil) fila.push({ card: { tipo: 'cert_estado_civil', cpf }, arquivo: d.estado_civil, nome: `Certidão de estado civil — ${quem}` });
      if (d.conjuge && temConjuge(p.estado_civil)) {
        fila.push({
          card: { tipo: 'doc_identidade', cpf: p.conjuge.cpf.replace(/\D/g, '') },
          arquivo: d.conjuge,
          nome: `Identidade — ${p.conjuge.nome || 'cônjuge'}`,
        });
      }
    });
    if (!fila.length) {
      router.push(destino);
      return;
    }
    (async () => {
      const erros: string[] = [];
      let cards: CardDocumento[] = [];
      for (let t = 0; t < 5 && !cards.length; t++) {
        setEnvio({ fase: 'docs', msg: 'Preparando o envio dos documentos…', erros });
        try {
          cards = await cardsDocumentos(id);
        } catch {
          cards = [];
        }
        if (!cards.length) await new Promise((ok) => setTimeout(ok, 3000));
      }
      for (const [k, item] of fila.entries()) {
        setEnvio({ fase: 'docs', msg: `Enviando documentos (${k + 1} de ${fila.length})…`, erros });
        const card = cards.find((c) => c.tipo === item.card.tipo && c.documento === item.card.cpf);
        if (!card) {
          erros.push(`${item.nome}: card não encontrado — envie pelo card na diligência.`);
          continue;
        }
        try {
          await enviarArquivoParaCard(card.id, item.arquivo, undefined, '/api/r4/diligencia-upload');
        } catch (e) {
          erros.push(`${item.nome}: ${e instanceof Error ? e.message : 'falha no envio'} — envie pelo card na diligência.`);
        }
      }
      if (erros.length) {
        setEnvio({ fase: 'fim', msg: 'Diligência criada. Alguns documentos não foram enviados:', erros });
      } else {
        router.push(destino);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);
  const [pj, setPj] = useState<PJ[]>([]);
  const [mat, setMat] = useState<Mat[]>([matVazia()]);
  const mudaMat = (i: number, k: keyof Mat, v: string) => setMat((a) => a.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  const mudaPf = (i: number, k: keyof PF, v: string) => setPf((a) => a.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const mudaConj = (i: number, k: keyof Conjuge, v: string) =>
    setPf((a) => a.map((p, j) => (j === i ? { ...p, conjuge: { ...p.conjuge, [k]: v } } : p)));
  const mudaPj = (i: number, k: 'vinculo' | 'nome' | 'cnpj', v: string) => setPj((a) => a.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const mudaRep = (i: number, ri: number, k: keyof Rep, v: string | boolean) =>
    setPj((a) =>
      a.map((p, j) => {
        if (j !== i) return p;
        const reps = p.reps.map((x, y) => {
          if (y !== ri) return x;
          const novo = { ...x, [k]: v } as Rep;
          if (k === 'papel') novo.certidoes = v === 'socio_adm';
          return novo;
        });
        return { ...p, reps };
      })
    );

  return (
    <form action={acao} className="space-y-6">
      <input type="hidden" name="pf" value={JSON.stringify(pf)} />
      <input type="hidden" name="pj" value={JSON.stringify(pj)} />
      <input type="hidden" name="mat" value={JSON.stringify(mat)} />
      <input type="hidden" name="corretores" value={JSON.stringify(corretores)} />

      {unidades && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <label className={rotulo}>
            Unidade *
            <select name="unidade_id" required className={campo} defaultValue="">
              <option value="" disabled>Escolha…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold">Imóvel</h2>
        <div className="mt-3 grid gap-3">
          <label className={rotulo}>
            Endereço completo *
            <input name="endereco" required className={campo} placeholder="Rua Exemplo, 123, apto 45 — Bairro, São Paulo/SP" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">Matrículas</p>
          <button type="button" onClick={() => setMat((a) => [...a, matVazia()])} className={botaoMais}>+ Matrícula (vaga, depósito…)</button>
        </div>
        {mat.map((m, i) => (
          <div key={i} className="mt-3 grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
            <label className={rotulo}>Nº da matrícula *<input value={m.numero} onChange={(e) => mudaMat(i, 'numero', e.target.value)} className={campo} inputMode="numeric" /></label>
            <label className={rotulo}>Cartório<input value={m.cartorio} onChange={(e) => mudaMat(i, 'cartorio', e.target.value)} className={campo} placeholder="Ex.: 4º RI de São Paulo" /></label>
            <label className={rotulo}>
              SQL do IPTU
              <input value={m.sql} onChange={(e) => mudaMat(i, 'sql', e.target.value)} className={campo} inputMode="numeric" placeholder="000.000.0000-0" />
            </label>
            {mat.length > 1 && (
              <button type="button" onClick={() => setMat((a) => a.filter((_, j) => j !== i))} className={`${remover} sm:col-span-3`}>remover matrícula</button>
            )}
          </div>
        ))}
        <p className="mt-2 text-xs text-slate-500">
          Com o SQL, o sistema emite a certidão de débitos de IPTU de cada matrícula. A matrícula atualizada fica como documento a juntar pela unidade.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Vendedores — pessoa física</h2>
          <button
            type="button"
            onClick={() => {
              setPf((a) => [...a, pfVazia()]);
              setDocs((a) => [...a, {}]);
            }}
            className={botaoMais}
          >
            + Pessoa física
          </button>
        </div>
        {pf.length === 0 && <p className="mt-3 text-sm text-slate-500">Nenhuma pessoa física.</p>}
        {pf.map((p, i) => (
          <div key={i} className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center">
              <p className="text-sm font-semibold text-slate-700">Vendedor(a) {i + 1}</p>
              <button
                type="button"
                onClick={() => {
                  setPf((a) => a.filter((_, j) => j !== i));
                  setDocs((a) => a.filter((_, j) => j !== i));
                  setLeituras({});
                }}
                className={remover}
              >
                remover
              </button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <CampoArquivo
                titulo="Documento de identidade (RG, CIN ou CNH)"
                ocr
                arquivo={docs[i]?.identidade}
                leitura={leituras[`titular-${i}`]}
                escolhe={(f) => escolheIdentidade(i, 'titular', f)}
              />
              <DadosPessoa p={p} muda={(k, v) => mudaPf(i, k, v)} obrig />
              <label className={rotulo}>
                Estado civil *
                <Sel valor={p.estado_civil} muda={(v) => mudaPf(i, 'estado_civil', v)} opcoes={ESTADO_CIVIL} />
              </label>
              {temConjuge(p.estado_civil) && (
                <label className={rotulo}>
                  Regime de bens *
                  <Sel valor={p.regime} muda={(v) => mudaPf(i, 'regime', v)} opcoes={REGIMES} />
                </label>
              )}
              <CampoArquivo titulo="Comprovante de residência" arquivo={docs[i]?.comprovante} escolhe={(f) => mudaDoc(i, 'comprovante', f)} />
              <CampoArquivo
                titulo="Certidão de estado civil (nascimento ou casamento)"
                arquivo={docs[i]?.estado_civil}
                escolhe={(f) => mudaDoc(i, 'estado_civil', f)}
              />
            </div>

            {temConjuge(p.estado_civil) && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">{p.estado_civil === 'casado' ? 'Cônjuge' : 'Companheiro(a)'}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className={`${rotulo} sm:col-span-2`}>
                    Participação no bem *
                    <Sel valor={p.conjuge.participacao} muda={(v) => mudaConj(i, 'participacao', v)} opcoes={PARTICIPACAO} />
                  </label>
                  {(p.conjuge.participacao === 'anuente_anterior' || p.conjuge.participacao === 'anuente_gratuito') && (
                    <label className={`${rotulo} sm:col-span-2`}>
                      Registro na matrícula que comprova
                      <input value={p.conjuge.registro} onChange={(e) => mudaConj(i, 'registro', e.target.value)} className={campo} placeholder="Ex.: R.5/16.707" />
                    </label>
                  )}
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    As certidões do cônjuge são emitidas em qualquer hipótese. Coproprietário entra no contrato como parte vendedora; anuente só assina concordando.
                  </p>
                  <CampoArquivo
                    titulo="Documento de identidade do cônjuge"
                    ocr
                    arquivo={docs[i]?.conjuge}
                    leitura={leituras[`conjuge-${i}`]}
                    escolhe={(f) => escolheIdentidade(i, 'conjuge', f)}
                  />
                  <DadosPessoa p={p.conjuge} muda={(k, v) => mudaConj(i, k, v)} obrig />
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Empresas</h2>
          <button type="button" onClick={() => setPj((a) => [...a, pjVazia()])} className={botaoMais}>+ Empresa</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Inclua a empresa vendedora e também as empresas em que o vendedor é sócio (as certidões delas entram na diligência).
        </p>
        {pj.length === 0 && <p className="mt-3 text-sm text-slate-500">Nenhuma empresa.</p>}
        {pj.map((p, i) => (
          <div key={i} className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center">
              <p className="text-sm font-semibold text-slate-700">Empresa {i + 1}</p>
              <button type="button" onClick={() => setPj((a) => a.filter((_, j) => j !== i))} className={remover}>remover</button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={`${rotulo} sm:col-span-2`}>
                Vínculo da empresa *
                <Sel
                  valor={p.vinculo}
                  muda={(v) => mudaPj(i, 'vinculo', v)}
                  opcoes={[
                    ['vendedora', 'Vendedora — é parte no contrato'],
                    ['participacao', 'Empresa do vendedor — só entra na diligência'],
                  ]}
                />
              </label>
              <label className={rotulo}>Razão social *<input value={p.nome} onChange={(e) => mudaPj(i, 'nome', e.target.value)} className={campo} /></label>
              <label className={rotulo}>CNPJ *<input value={p.cnpj} onChange={(e) => mudaPj(i, 'cnpj', mascaraCnpj(e.target.value))} className={campo} inputMode="numeric" /></label>
            </div>
            {p.vinculo === 'participacao' && (
              <p className="mt-2 text-xs text-slate-500">Puxa as certidões do CNPJ para a diligência, mas não entra no contrato e não precisa de signatário.</p>
            )}

            {p.vinculo === 'vendedora' && (
              <div className="mt-4 space-y-3">
                {p.reps.map((rep, ri) => (
                  <div key={ri} className="rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center">
                      <p className="text-sm font-semibold text-slate-700">Signatário {ri + 1} (quem assina pela empresa)</p>
                      {p.reps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPj((a) => a.map((x, j) => (j === i ? { ...x, reps: x.reps.filter((_, y) => y !== ri) } : x)))}
                          className={remover}
                        >
                          remover
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label className={rotulo}>
                        Papel na empresa *
                        <Sel
                          valor={rep.papel}
                          muda={(v) => mudaRep(i, ri, 'papel', v)}
                          opcoes={[
                            ['socio_adm', 'Sócio administrador'],
                            ['adm_nao_socio', 'Administrador (não sócio)'],
                            ['procurador', 'Procurador'],
                          ]}
                        />
                      </label>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                        <input type="checkbox" checked={rep.certidoes} onChange={(e) => mudaRep(i, ri, 'certidoes', e.target.checked)} />
                        Emitir certidões pessoais do signatário
                      </label>
                      <DadosPessoa p={rep} muda={(k, v) => mudaRep(i, ri, k, v)} obrig={rep.certidoes} />
                      <label className={rotulo}>
                        Estado civil
                        <Sel valor={rep.estado_civil} muda={(v) => mudaRep(i, ri, 'estado_civil', v)} opcoes={ESTADO_CIVIL} vazio="—" />
                      </label>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPj((a) => a.map((x, j) => (j === i ? { ...x, reps: [...x.reps, repVazio()] } : x)))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  + Signatário
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      {equipe && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold">Corretores que podem ver esta diligência</h2>
          <p className="mt-1 text-xs text-slate-500">
            Cada corretor vê só as diligências que cadastrou e as que você liberar para ele. Dá para mudar depois, na própria diligência.
          </p>
          {equipe.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nenhum corretor cadastrado na equipe.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {equipe.map((c) => (
                <li key={c.id}>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={corretores.includes(c.id)}
                      onChange={(e) => setCorretores((a) => (e.target.checked ? [...a, c.id] : a.filter((x) => x !== c.id)))}
                      className="size-4 rounded border-slate-300"
                    />
                    {c.nome || c.email}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {r && !r.ok && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.msg}</p>
      )}
      {envio && (
        <div role="status" className={`rounded-lg px-3 py-2 text-sm ${envio.fase === 'fim' ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}>
          <p>{envio.msg}</p>
          {envio.fase === 'fim' && (
            <>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {envio.erros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => router.push(`${base}/diligencias/${r?.id}?nova=1`)}
                className="mt-2 rounded-lg bg-[#0F1B2D] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Abrir a diligência
              </button>
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={enviando || !!envio || !!r?.ok || Object.values(leituras).some((l) => l.st === 'lendo')}
          className="rounded-lg bg-[#0F1B2D] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2c45] disabled:opacity-60"
        >
          {enviando ? 'Iniciando as certidões… (pode levar até 1 minuto)' : envio || r?.ok ? 'Enviando documentos…' : 'Iniciar diligência'}
        </button>
        <p className="text-xs text-slate-500">R$ 2,00 por certidão emitida pelo sistema. Certidões que falharem não são cobradas.</p>
      </div>
    </form>
  );
}

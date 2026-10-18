'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { criarCertidaoExtra, excluirCertidaoExtra } from './actions';
import { enviarArquivoParaCard } from './EnviarArquivoCard';

type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
};

type CardExtraNovoProps = {
  diligencia_id: string;
  pasta_id: string;
  /** Pessoa dona do card. Vazio/null para cards de imovel. */
  documento_normalizado?: string | null;
  titular?: string | null;
  /** Lista de PDFs disponiveis na pasta do grupo (vem do server). */
  pdfsDisponiveis: DriveFile[];
};

/**
 * Botao "+ Adicionar documento" que abre um modal pra criar card extra.
 * Duas origens para o arquivo:
 *  - "Do computador" (padrão): cria o card e já envia o arquivo escolhido para a
 *    pasta do Drive do grupo (mesmo caminho do botão "Enviar arquivo" do card);
 *  - "Já está no Drive": escolhe um PDF que já está na pasta do grupo;
 *  - "Enviar depois": cria o card pendente, aguardando o documento (o arquivo vai
 *    depois pelo botão "Enviar arquivo" do próprio card).
 */
export function CardExtraNovo({
  diligencia_id,
  pasta_id,
  documento_normalizado,
  titular,
  pdfsDisponiveis,
}: CardExtraNovoProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [origem, setOrigem] = useState<'computador' | 'drive' | 'pendente'>('computador');
  const [enviando, setEnviando] = useState<'' | 'criando' | 'subindo' | 'drive'>('');
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [pdfSelecionado, setPdfSelecionado] = useState<string>('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ocupado = pending || enviando !== '';

  function fechar() {
    if (ocupado) return;
    setOpen(false);
    setErro(null);
    setPdfSelecionado('');
    setArquivo(null);
    setOrigem('computador');
    formRef.current?.reset();
  }

  function preencher(fd: FormData) {
    fd.set('diligencia_id', diligencia_id);
    fd.set('pasta_id', pasta_id);
    fd.set('documento_normalizado', documento_normalizado ?? '');
    fd.set('titular', titular ?? '');
  }

  async function doComputador(fd: FormData) {
    if (!arquivo) {
      setErro('Escolha o arquivo no computador.');
      return;
    }
    if (arquivo.size > 50 * 1024 * 1024) {
      setErro('Arquivo acima de 50 MB.');
      return;
    }
    preencher(fd);
    fd.delete('drive_file_id');
    fd.set('url_pdf', '');
    try {
      setEnviando('criando');
      const id = await criarCertidaoExtra(fd);
      await enviarArquivoParaCard(id, arquivo, (e) => setEnviando(e));
      setEnviando('');
      fechar();
      [1500, 15000, 40000].forEach((ms) => setTimeout(() => router.refresh(), ms));
    } catch (e) {
      setEnviando('');
      setErro(
        (e instanceof Error ? e.message : 'Falha no envio.') +
          ' Se o card já foi criado, use "Enviar arquivo" nele para tentar de novo.'
      );
      router.refresh();
    }
  }

  function doDrive(fd: FormData) {
    const escolhido = pdfsDisponiveis.find((p) => p.id === fd.get('drive_file_id'));
    if (!escolhido) {
      setErro('Selecione um PDF da pasta');
      return;
    }
    preencher(fd);
    fd.set('url_pdf', escolhido.webViewLink ?? '');
    startTransition(async () => {
      try {
        await criarCertidaoExtra(fd);
        fechar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'erro desconhecido');
      }
    });
  }

  function soCard(fd: FormData) {
    preencher(fd);
    fd.delete('drive_file_id');
    fd.set('url_pdf', '');
    startTransition(async () => {
      try {
        await criarCertidaoExtra(fd);
        fechar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'erro desconhecido');
      }
    });
  }

  function submeter(fd: FormData) {
    setErro(null);
    if (origem === 'computador') void doComputador(fd);
    else if (origem === 'pendente') soCard(fd);
    else doDrive(fd);
  }

  const rotuloEnviar =
    enviando === 'criando' ? 'Criando card…'
      : enviando === 'subindo' ? 'Enviando arquivo…'
        : enviando === 'drive' ? 'Salvando no Drive…'
          : pending ? 'Salvando…' : origem === 'pendente' ? 'Criar card' : 'Adicionar';
  const podeEnviar =
    origem === 'computador' ? !!arquivo : origem === 'pendente' ? true : pdfsDisponiveis.length > 0;

  const abaCls = (ativa: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
      ativa ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[100px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white/50 p-3 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-700"
        title="Adicionar documento avulso a este grupo"
      >
        <span className="text-2xl leading-none">+</span>
        <span className="text-xs font-medium">Adicionar documento</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={fechar}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Adicionar documento
                </h2>
                {titular && (
                  <p className="text-xs text-slate-500">{titular}</p>
                )}
              </div>
              <button
                type="button"
                onClick={fechar}
                disabled={ocupado}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
              <button type="button" disabled={ocupado} onClick={() => { setOrigem('computador'); setErro(null); }} className={abaCls(origem === 'computador')}>
                Do computador
              </button>
              <button type="button" disabled={ocupado} onClick={() => { setOrigem('drive'); setErro(null); }} className={abaCls(origem === 'drive')}>
                Já está no Drive
              </button>
              <button type="button" disabled={ocupado} onClick={() => { setOrigem('pendente'); setErro(null); }} className={abaCls(origem === 'pendente')}>
                Enviar depois
              </button>
            </div>

            <form ref={formRef} action={submeter} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Descrição do documento
                </label>
                <input
                  type="text"
                  name="descricao"
                  required
                  maxLength={120}
                  disabled={ocupado}
                  placeholder="Ex.: Comprovante de residência"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
                />
              </div>

              {origem === 'pendente' ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                  O card é criado como <b>pendente</b>, aguardando o documento. Quando tiver o arquivo,
                  use o botão &quot;Enviar arquivo&quot; do próprio card.
                </p>
              ) : origem === 'computador' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Arquivo
                  </label>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-3 text-sm transition ${
                      arquivo ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/30'
                    } ${ocupado ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf"
                      className="hidden"
                      disabled={ocupado}
                      onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                    />
                    <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
                      Escolher arquivo
                    </span>
                    <span className={`min-w-0 truncate text-xs ${arquivo ? 'text-slate-800' : 'text-slate-400'}`}>
                      {arquivo ? arquivo.name : 'PDF ou foto (JPG/PNG), até 50 MB'}
                    </span>
                  </label>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    O arquivo vai para a pasta deste grupo no Drive e o card já fica concluído.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    PDF (já enviado ao Drive){' '}
                    <a
                      href={`https://drive.google.com/drive/folders/${pasta_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-normal text-emerald-700 underline hover:no-underline"
                    >
                      abrir pasta
                    </a>
                  </label>
                  {pdfsDisponiveis.length === 0 ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Nenhum PDF encontrado na pasta. Use a opção &quot;Do computador&quot;.
                    </p>
                  ) : (
                    <select
                      name="drive_file_id"
                      required
                      disabled={ocupado}
                      value={pdfSelecionado}
                      onChange={(e) => setPdfSelecionado(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
                    >
                      <option value="">— selecione um PDF —</option>
                      {pdfsDisponiveis.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {erro && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {erro}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={fechar}
                  disabled={ocupado}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ocupado || !podeEnviar}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
                    ocupado || !podeEnviar
                      ? 'cursor-not-allowed bg-slate-400'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {rotuloEnviar}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Botao pequeno de excluir card extra (X). Pede confirmacao via window.confirm.
 */
export function ExcluirCardExtra({
  certidao_id,
  diligencia_id,
}: {
  certidao_id: string;
  diligencia_id: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('Excluir este documento extra? O PDF do Drive não será removido.')) return;
        startTransition(async () => {
          await excluirCertidaoExtra(certidao_id, diligencia_id);
        });
      }}
      title="Excluir card extra (apenas o card; o PDF do Drive permanece)"
      className={`rounded-md border px-2 py-1 text-xs font-medium ${
        pending
          ? 'cursor-not-allowed border-slate-200 text-slate-400'
          : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50'
      }`}
    >
      {pending ? 'Excluindo...' : '✕ Excluir card'}
    </button>
  );
}

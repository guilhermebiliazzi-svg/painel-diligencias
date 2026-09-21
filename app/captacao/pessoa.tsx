'use client';

// Peças compartilhadas pela busca de unidade e pela tabela do prédio: o
// cartão de uma pessoa, o veredito do CPF reconstruído e o pedido às rotas.
import { useState } from 'react';
import type { Contato, PessoaNaUnidade } from '@/lib/directd';
import { conferirReconstrucao, cpfCheio, cpfParcial, dataBr, fone } from './cruzamento';

export async function pedir<T>(rota: string, corpo: unknown): Promise<T> {
  const r = await fetch(rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
  return j as T;
}

export function Pessoa({
  pessoa,
  contato,
  noIptu,
  cpfMontado,
  aoAchar,
}: {
  pessoa: PessoaNaUnidade;
  contato?: Contato;
  noIptu?: boolean;
  cpfMontado?: string | null;
  aoAchar: (c: Contato) => void;
}) {
  // Dois toques antes de gastar: o primeiro arma, o segundo cobra, e desarma
  // sozinho em 6 s. Mesmo padrão do "Limpar ficha" da ficha de captação — um
  // toque sem querer não vira conta.
  const [armado, setArmado] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');

  async function clicar() {
    if (!armado) {
      setArmado(true);
      setTimeout(() => setArmado(false), 6000);
      return;
    }
    setArmado(false);
    setBuscando(true);
    setErro('');
    try {
      // A consulta paga precisa de 11 dígitos. Só o CPF reconstruído serve.
      aoAchar(await pedir<Contato>('/api/captacao/contato', { cpf: cpfMontado || '' }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <li className="py-4">
      <p className="font-semibold text-slate-900">
        {pessoa.nome}
        {noIptu && (
          <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            bate com o IPTU
          </span>
        )}
      </p>
      <p className="mt-0.5 text-sm text-slate-500">
        {cpfMontado ? cpfCheio(cpfMontado) : cpfParcial(pessoa.cpf)}
        {pessoa.nascimento && ` · nasc. ${dataBr(pessoa.nascimento)}`}
        {pessoa.nomeMae && ` · mãe: ${pessoa.nomeMae}`}
      </p>

      {!contato && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={clicar}
            disabled={buscando || !cpfMontado}
            className={
              'rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition disabled:opacity-50 ' +
              (armado
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-50')
            }
          >
            {buscando
              ? 'Buscando…'
              : armado
                ? 'Confirmar — vai consumir saldo'
                : 'Buscar contato'}
          </button>
          {!cpfMontado && (
            <span className="text-sm text-slate-500">
              precisa dos 3 dígitos da certidão
            </span>
          )}
          {!erro && <span className="text-sm text-slate-500">consome saldo</span>}
          {erro && <span className="text-sm text-red-700">{erro}</span>}
        </div>
      )}

      {contato && (
        <>
          {cpfMontado && <Veredito pessoa={pessoa} contato={contato} />}
          <CartaoContato c={contato} />
        </>
      )}
    </li>
  );
}

function Veredito({
  pessoa,
  contato,
}: {
  pessoa: PessoaNaUnidade;
  contato: Contato;
}) {
  const { veredito, sinais } = conferirReconstrucao(pessoa, contato);
  const cor =
    veredito === 'confirma'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : veredito === 'nega'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-amber-200 bg-amber-50 text-amber-900';
  const texto =
    veredito === 'confirma'
      ? 'CPF confirmado: os dados batem com esta pessoa.'
      : veredito === 'nega'
        ? 'Este CPF NÃO é desta pessoa — o prefixo da certidão é de outro candidato.'
        : 'Não deu para confirmar: a base devolveu pouca coisa para comparar.';
  return (
    <p className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${cor}`}>
      <b>{texto}</b>
      {sinais.length > 0 && <> — {sinais.join(', ')}.</>}
    </p>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </div>
  );
}

function CartaoContato({ c }: { c: Contato }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Bloco titulo="CPF">
        {cpfCheio(c.cpf)}
        {c.obito && (
          <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
            consta falecido
          </span>
        )}
      </Bloco>

      <Bloco titulo="Telefones">
        {c.telefones.length === 0 ? (
          <span className="text-slate-500">a base não trouxe telefone.</span>
        ) : (
          c.telefones.map((t) => (
            <div key={t.numero}>
              <a href={`tel:+55${t.numero}`} className="text-blue-700 hover:underline">
                {fone(t.numero)}
              </a>
              {t.celular && (
                <a
                  href={`https://wa.me/55${t.numero}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                >
                  WhatsApp
                </a>
              )}
            </div>
          ))
        )}
      </Bloco>

      {c.emails.length > 0 && (
        <Bloco titulo="E-mails">
          {c.emails.map((e) => (
            <div key={e}>
              <a href={`mailto:${e}`} className="text-blue-700 hover:underline">
                {e}
              </a>
            </div>
          ))}
        </Bloco>
      )}

      {c.alerta && <p className="mb-3 text-sm font-semibold text-red-700">{c.alerta}</p>}

      {c.parentescos.length > 0 && (
        <Bloco titulo="Parentescos">
          {c.parentescos.map((p, i) => (
            <div key={`${p.cpf}-${i}`}>
              {p.nome}
              {p.vinculo && ` — ${p.vinculo}`}
            </div>
          ))}
        </Bloco>
      )}

      {(c.rendaEstimada || c.classeSocial) && (
        <Bloco titulo="Perfil">
          {[
            c.rendaEstimada && `renda estimada ${c.rendaEstimada}`,
            c.classeSocial && `classe ${c.classeSocial}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Bloco>
      )}
    </div>
  );
}

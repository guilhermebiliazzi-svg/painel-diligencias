-- Documentos do contrato de locação (pasta do contrato no painel).
-- Uso interno: RLS ligada e SEM policies -> só o backend (service role) lê/grava.
-- Arquivos ficam no bucket privado "documentos", em contratos/{id}/{categoria}/...

create table if not exists public.adm_contrato_documentos (
  id           bigint generated always as identity primary key,
  contrato_id  bigint not null references public.adm_contratos(id) on delete cascade,
  categoria    text   not null check (categoria in (
                 'apolice',
                 'contrato_locacao',
                 'contrato_administracao',
                 'vistoria_entrada',
                 'vistoria_saida',
                 'termo_entrega_chaves',
                 'notificacao',
                 'outros')),
  seguro_id    bigint null references public.adm_seguros(id) on delete set null,
  descricao    text,
  nome         text   not null,           -- nome original do arquivo
  bucket       text   not null default 'documentos',
  path         text   not null,
  tamanho      bigint,
  mime         text,
  enviado_por  text,
  criado_em    timestamptz not null default now(),
  excluido_em  timestamptz null           -- exclusão "suave" (arquivo continua no storage)
);

create index if not exists adm_contrato_documentos_contrato_idx
  on public.adm_contrato_documentos (contrato_id) where excluido_em is null;

alter table public.adm_contrato_documentos enable row level security;

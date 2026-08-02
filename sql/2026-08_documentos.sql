-- Documentos do locador (boletos e comprovantes de IPTU/condomínio)
-- Chave natural: contrato + competência + tipo. As telas de Cobranças e de
-- Repasse gravam aqui; o portal do locador lê daqui.
--
-- Rodar no SQL editor do Supabase (uma vez).

create table if not exists public.adm_documentos (
  id            bigserial primary key,
  contrato_id   bigint not null,
  competencia   date   not null,                 -- sempre dia 01 (YYYY-MM-01)
  tipo          text   not null check (tipo in (
                  'boleto_iptu',
                  'boleto_condominio',
                  'comprovante_iptu',
                  'comprovante_condominio'
                )),
  bucket        text   not null default 'documentos',
  path          text   not null,                 -- caminho dentro do bucket
  nome          text,                            -- nome original do arquivo
  origem        text,                            -- 'cobranca' | 'repasse'
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (contrato_id, competencia, tipo)
);

create index if not exists idx_adm_documentos_contrato_comp
  on public.adm_documentos (contrato_id, competencia);

-- O acesso é feito só pelo backend com a service_role (ignora RLS).
-- Mantemos RLS ligado sem policies para bloquear qualquer acesso anônimo direto.
alter table public.adm_documentos enable row level security;

-- Log de envios de e-mail ao locador (para sinalizar "enviado em" na tabela).
-- Uma linha por contrato+competência; guarda o último envio.
-- Fica no schema public (o app grava via service_role). Rodar uma vez no Supabase.

create table if not exists public.adm_locador_envios (
  contrato_id integer not null,
  competencia date not null,
  locador_id  integer,
  enviado_em  timestamptz not null default now(),
  to_email    text,
  primary key (contrato_id, competencia)
);

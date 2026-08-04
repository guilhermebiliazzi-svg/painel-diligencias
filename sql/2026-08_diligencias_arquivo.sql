-- Arquivamento de diligências (quando a venda é concluída).
-- Tabela leve à parte: não mexe na view painel.v_painel_admin.
-- Fica no schema public, onde o app já grava (painel_admin_log, certidoes_status),
-- então não precisa de GRANT extra pro papel da aplicação.
-- Rodar uma vez no SQL editor do Supabase.

create table if not exists public.diligencias_arquivo (
  diligencia_id text primary key,
  arquivada_em  timestamptz not null default now()
);

-- Posicionamento, etapa 2: campos da pesquisa do treinamento e contatos do prédio.
-- RODAR ANTES DO DEPLOY. Só acrescenta colunas; nada é apagado.

alter table public.posicionamento_condominios
  add column if not exists perfil_moradores     text,
  add column if not exists ocupacao             text check (ocupacao in ('proprietarios','locatarios','misto')),
  add column if not exists movimentacao_recente text,
  add column if not exists obras_previstas      text,
  add column if not exists elogios_reclamacoes  text,
  add column if not exists chave_imobiliaria    text,
  -- [{nome, funcao, turno, whatsapp, autorizou}] — funcionários do prédio, nunca moradores
  add column if not exists contatos             jsonb not null default '[]'::jsonb;

-- Conferência:
--   select count(*) from information_schema.columns where table_name = 'posicionamento_condominios';  -- 51

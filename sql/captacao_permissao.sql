-- Permissão da tela de Captação (/captacao).
--
-- RODAR ANTES DO DEPLOY. O app aguenta a ordem trocada — o getSessaoPerfil
-- tenta de novo sem a coluna e o painel não cai —, mas até a coluna existir a
-- captação fica visível só para admin, e a tela de Usuários não consegue
-- listar ninguém.
--
-- Padrão false de propósito: cada consulta de contato consome saldo na
-- DirectD, então ninguém entra por acidente.

alter table public.perfis
  add column if not exists pode_captacao boolean not null default false;

-- Conferência:
--   select email, is_admin, pode_captacao from public.perfis order by email;

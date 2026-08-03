-- Nova permissão de tela: "Pagamentos" (contas a pagar — boletos IPTU/condomínio).
-- Antes, a tela /pagamentos usava a permissão de Cobranças; agora é própria.
-- Rodar uma vez no SQL editor do Supabase.
--
-- Padrão false: cada usuário recebe o acesso explicitamente na tela de Usuários.
-- Admins veem a tela de qualquer forma (is_admin ignora as permissões).

alter table public.perfis
  add column if not exists pode_pagamentos boolean not null default false;

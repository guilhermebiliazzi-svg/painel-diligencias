-- Lista de ligações (/ligacoes): cada corretor monta a sua lista de proprietários,
-- registra cada ligação e faz o follow-up. Para quem está na trilha do Max, cada
-- ligação registrada também entra em onb_contatos (placar do Max).
--
-- RODAR ANTES DO DEPLOY (SQL editor do Supabase, role owner). Só cria tabelas
-- novas. O painel lê e grava pelo servidor (service_role). RLS ligado sem política.

create table if not exists public.ligacoes_contatos (
  id               bigint generated always as identity primary key,
  corretor_id      bigint not null,                -- corretores_associados.id (dono da lista)
  nome             text   not null,
  telefone         text,
  predio           text,                           -- condomínio ou endereço
  unidade          text,
  origem           text not null default 'outro'
                   check (origem in ('frog','posicionamento','iconatus','portal','indicacao','outro')),
  status           text not null default 'a_ligar'
                   check (status in ('a_ligar','sem_resposta','conversou','retornar','v1_marcada','sem_interesse','nao_ligar')),
  proximo_contato  date,
  observacao       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists ligacoes_contatos_corretor on public.ligacoes_contatos (corretor_id, status, proximo_contato);

create table if not exists public.ligacoes_registros (
  id              bigint generated always as identity primary key,
  contato_id      bigint not null references public.ligacoes_contatos(id) on delete cascade,
  corretor_id     bigint not null,
  data            date   not null default (now() at time zone 'America/Sao_Paulo')::date,
  resultado       text   not null
                  check (resultado in ('sem_resposta','conversou','retornar','v1_marcada','sem_interesse','nao_ligar')),
  nota            text,
  onb_contato_id  bigint,                          -- linha espelhada em onb_contatos (novato na trilha)
  criado_em       timestamptz not null default now()
);
create index if not exists ligacoes_registros_contato on public.ligacoes_registros (contato_id, criado_em desc);
create index if not exists ligacoes_registros_corretor on public.ligacoes_registros (corretor_id, data);

alter table public.ligacoes_contatos  enable row level security;
alter table public.ligacoes_registros enable row level security;

-- Tabela de posicionamento (/posicionamento): o corretor mapeia os condomínios
-- da região em que quer se posicionar (dados do prédio, mercado, concorrência e
-- relacionamento) e o painel consolida o quanto ele já domina a região.
--
-- RODAR ANTES DO DEPLOY (SQL editor do Supabase, role owner). Só cria coisa
-- nova; não altera nenhuma tabela usada pela Eva.

create table if not exists public.posicionamento_condominios (
  id                bigint generated always as identity primary key,
  corretor_id       bigint not null,               -- corretores_associados.id
  regiao            text   not null,               -- ex.: "Jardim Paulista – entre Alameda Santos e Estados Unidos"

  -- Dados do condomínio
  nome              text   not null,
  endereco          text,
  bairro            text,
  cep               text,
  construtora       text,
  ano_entrega       int,
  torres            int,
  andares           int,
  unidades          int,
  metragem_min      numeric,
  metragem_max      numeric,
  dormitorios       text,                          -- ex.: "3 a 4"
  vagas             text,                          -- ex.: "2 a 3"
  padrao            text check (padrao in ('economico','medio','alto','luxo')),
  lazer             text,
  taxa_condominio   numeric,                       -- R$/mês (média)

  -- Mercado
  valor_m2_min      numeric,
  valor_m2_max      numeric,
  anuncios_ativos   int,
  vendas_12m        int,
  tempo_medio_venda int,                           -- dias
  locacoes_ativas   int,

  -- Concorrência
  imobiliarias          text,                      -- separadas por vírgula
  placas                int,
  exclusividades_conc   int,
  corretor_referencia   text,                      -- quem "manda" no prédio hoje

  -- Relacionamento
  status_relacionamento text not null default 'nao_iniciado'
    check (status_relacionamento in ('nao_iniciado','primeiro_contato','em_relacionamento','referencia')),
  administradora        text,
  sindico_nome          text,
  sindico_contato       text,
  zelador_nome          text,
  portaria_contato      text,
  proprietarios_conhecidos int,
  negocios_ville        int,                       -- captações/vendas/locações da Ville no prédio
  ultimo_contato        date,
  proxima_acao          text,
  proxima_acao_data     date,

  prioridade_manual     text check (prioridade_manual in ('A','B','C')),
  observacoes           text,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists posicionamento_condominios_corretor_idx
  on public.posicionamento_condominios (corretor_id, regiao);

-- O painel lê e grava pelo servidor (service_role). RLS ligado sem política:
-- ninguém acessa pela chave pública.
alter table public.posicionamento_condominios enable row level security;

-- Libera a tela para o perfil "Corretor" e para quem já está nele.
update public.perfis_acesso
   set telas = array_append(telas, 'posicionamento')
 where sistema = 'corretor' and not ('posicionamento' = any(telas));

update public.perfis p
   set telas = array_append(p.telas, 'posicionamento')
  from public.perfis_acesso pa
 where pa.sistema = 'corretor'
   and p.perfil_acesso_id = pa.id
   and p.telas is not null
   and not ('posicionamento' = any(p.telas));

-- Conferência:
--   select nome, telas from public.perfis_acesso;
--   select count(*) from public.posicionamento_condominios;

-- Oficinas da loja (/oficinas): cada monitor registra a presença dos corretores
-- na sua oficina, marca o checklist do encontro e acessa o material de apoio;
-- cada corretor vê as suas oficinas e marca o checklist de aplicação.
--
-- RODAR ANTES DO DEPLOY (SQL editor do Supabase, role owner). Só cria coisa
-- nova; não altera nenhuma tabela existente (nem as da Eva nem as do Max).
-- O painel lê e grava pelo servidor (service_role). RLS ligado sem política.

create table if not exists public.onb_oficinas (
  id     smallint primary key,
  slug   text not null unique,
  nome   text not null,
  ordem  smallint not null,
  ativa  boolean not null default true
);

insert into public.onb_oficinas (id, slug, nome, ordem) values
  (1, 'posicionamento', 'Posicionamento e Portarias', 1),
  (2, 'ligacoes',       'Ligações e Call Blitz',      2),
  (3, 'v1',             'V1',                         3),
  (4, 'acm',            'Elaboração de ACM',          4),
  (5, 'v2',             'V2: apresentação de ACM e fechamento', 5)
on conflict (id) do nothing;

-- Quem conduz cada oficina e em que dia (1 = segunda ... 6 = sábado; null = a definir)
create table if not exists public.onb_oficina_monitores (
  id           bigint generated always as identity primary key,
  oficina_id   smallint not null references public.onb_oficinas(id),
  corretor_id  bigint   not null,                  -- corretores_associados.id
  dia_semana   smallint check (dia_semana between 1 and 6),
  periodo      text check (periodo in ('manha','tarde')),
  criado_em    timestamptz not null default now(),
  unique (oficina_id, corretor_id)
);
create index if not exists onb_oficina_monitores_corretor on public.onb_oficina_monitores (corretor_id);

-- Presença: uma linha por corretor por oficina por data
create table if not exists public.onb_oficina_presencas (
  id                 bigint generated always as identity primary key,
  oficina_id         smallint not null references public.onb_oficinas(id),
  data               date     not null,
  corretor_id        bigint   not null,            -- participante (corretores_associados.id)
  monitor_id         bigint,                       -- quem conduziu (corretores_associados.id)
  registrado_por     text,                         -- e-mail de quem registrou
  criado_em          timestamptz not null default now(),
  unique (oficina_id, data, corretor_id)
);
create index if not exists onb_oficina_presencas_data on public.onb_oficina_presencas (oficina_id, data desc);
create index if not exists onb_oficina_presencas_corretor on public.onb_oficina_presencas (corretor_id);

-- Material de apoio (links): para o monitor ou para os participantes
create table if not exists public.onb_oficina_materiais (
  id          bigint generated always as identity primary key,
  oficina_id  smallint not null references public.onb_oficinas(id),
  publico     text not null check (publico in ('monitor','participante')),
  titulo      text not null,
  url         text not null,
  criado_por  text,
  criado_em   timestamptz not null default now()
);
create index if not exists onb_oficina_materiais_oficina on public.onb_oficina_materiais (oficina_id);

alter table public.onb_oficinas          enable row level security;
alter table public.onb_oficina_monitores enable row level security;
alter table public.onb_oficina_presencas enable row level security;
alter table public.onb_oficina_materiais enable row level security;

-- Manual do monitor (uma aba por oficina) como primeiro material de cada uma
insert into public.onb_oficina_materiais (oficina_id, publico, titulo, url, criado_por)
select v.oficina_id, 'monitor', 'Manual do monitor', v.url, 'sistema'
from (values
  (1, 'https://claude.ai/artifact/5V2UyCjsaucP6xu1NnazDy#e05184f6-7e29'),
  (2, 'https://claude.ai/artifact/5V2UyCjsaucP6xu1NnazDy#438e02b1-58a1'),
  (3, 'https://claude.ai/artifact/5V2UyCjsaucP6xu1NnazDy#a155ece7-a1d4'),
  (4, 'https://claude.ai/artifact/5V2UyCjsaucP6xu1NnazDy#cc4334a7-2a09'),
  (5, 'https://claude.ai/artifact/5V2UyCjsaucP6xu1NnazDy#f784a8fc-99dd')
) as v(oficina_id, url)
where not exists (
  select 1 from public.onb_oficina_materiais m
  where m.oficina_id = v.oficina_id and m.titulo = 'Manual do monitor'
);

-- Material para os participantes do Call Blitz: aula da Monica Silva sobre script telefônico
insert into public.onb_oficina_materiais (oficina_id, publico, titulo, url, criado_por)
select 2, 'participante', 'Aula da Monica Silva: script telefônico', 'https://www.youtube.com/watch?v=ZQlyCw8cYmA', 'sistema'
where not exists (
  select 1 from public.onb_oficina_materiais
  where oficina_id = 2 and url = 'https://www.youtube.com/watch?v=ZQlyCw8cYmA'
);

-- Monitores da grade de nov/2026 (dia: 1 = segunda ... 5 = sexta). Só entra quem
-- tem UM corretor ativo com aquele nome; quem ficar de fora (nome ambíguo ou não
-- encontrado) aparece na conferência abaixo e se acerta na tela /oficinas.
do $$
declare
  r record;
  v_ids bigint[];
begin
  for r in
    select * from (values
      (1, 'Diogo%',          5, 'tarde'),   -- Posicionamento 1º dia: sexta à tarde
      (1, 'Salete%',         1, 'manha'),   -- Posicionamento 2º dia: segunda de manhã
      (2, 'Andrea%',         2, 'tarde'),   -- Ligações e Call Blitz: terça à tarde
      (2, 'Suzana%',         2, 'tarde'),
      (3, 'Lucas%',          3, 'manha'),   -- V1 1º período: quarta de manhã
      (3, 'Gustavo%',        3, 'manha'),
      (3, 'Rafael Vaz%',     3, 'tarde'),   -- V1 2º período: quarta à tarde
      (4, 'Silvia%',         3, 'tarde'),   -- ACM: quarta à tarde
      (5, 'Samia%',          4, 'tarde')    -- V2: quinta à tarde
    ) as t(oficina_id, padrao, dia, periodo)
  loop
    select array_agg(id) into v_ids
    from public.corretores_associados
    where nome ilike r.padrao and coalesce(status, 'ativo') = 'ativo';
    if coalesce(array_length(v_ids, 1), 0) = 1 then
      insert into public.onb_oficina_monitores (oficina_id, corretor_id, dia_semana, periodo)
      values (r.oficina_id, v_ids[1], r.dia, r.periodo)
      on conflict (oficina_id, corretor_id) do update
        set dia_semana = excluded.dia_semana, periodo = excluded.periodo;
    else
      raise notice 'Oficina %: "%" não entrou (% corretores ativos com esse nome)', r.oficina_id, r.padrao, coalesce(array_length(v_ids, 1), 0);
    end if;
  end loop;
end $$;

-- Checklists: do monitor (marcado por encontro) e de aplicação (cada participante marca o seu)
create table if not exists public.onb_oficina_check_itens (
  id          bigint generated always as identity primary key,
  oficina_id  smallint not null references public.onb_oficinas(id),
  publico     text not null check (publico in ('monitor','participante')),
  texto       text not null,
  ordem       smallint not null default 0,
  ativo       boolean not null default true,
  unique (oficina_id, publico, texto)
);

create table if not exists public.onb_oficina_check_marcas (
  id           bigint generated always as identity primary key,
  item_id      bigint not null references public.onb_oficina_check_itens(id) on delete cascade,
  oficina_id   smallint not null references public.onb_oficinas(id),
  data         date,       -- encontro (itens do monitor)
  corretor_id  bigint,     -- participante (itens de aplicação)
  marcado_por  text,
  criado_em    timestamptz not null default now(),
  check ((data is null) <> (corretor_id is null))
);
create unique index if not exists onb_oficina_check_marcas_encontro on public.onb_oficina_check_marcas (item_id, data) where data is not null;
create unique index if not exists onb_oficina_check_marcas_corretor on public.onb_oficina_check_marcas (item_id, corretor_id) where corretor_id is not null;
create index if not exists onb_oficina_check_marcas_cor on public.onb_oficina_check_marcas (corretor_id) where corretor_id is not null;

alter table public.onb_oficina_check_itens  enable row level security;
alter table public.onb_oficina_check_marcas enable row level security;

insert into public.onb_oficina_check_itens (oficina_id, publico, ordem, texto) values
  (1, 'monitor', 1, 'Cada participante escolheu o território.'),
  (1, 'monitor', 2, 'Cada um cadastrou ao menos 1 condomínio no painel.'),
  (1, 'monitor', 3, 'Cada um treinou a abordagem pelo menos uma vez.'),
  (1, 'monitor', 4, 'Cada um saiu com a lista de 3 a 4 condomínios para o dia seguinte.'),
  (2, 'monitor', 1, 'Cada participante chegou com a lista e completou pelo menos 15 nomes.'),
  (2, 'monitor', 2, 'Cada um treinou o roteiro e as objeções.'),
  (2, 'monitor', 3, 'Todos participaram do Call Blitz e anotaram o placar.'),
  (2, 'monitor', 4, 'Cada um saiu com o plano de ligações dos próximos dias.'),
  (3, 'monitor', 1, 'Cada participante conduziu ao menos uma simulação completa.'),
  (3, 'monitor', 2, 'Cada um sabe de cor as 5 etapas e o roteiro de perguntas.'),
  (3, 'monitor', 3, 'Cada um tem o checklist de dados para a ACM.'),
  (3, 'monitor', 4, 'Cada um saiu com a V1 ou a simulação do dia seguinte combinada.'),
  (4, 'monitor', 1, 'Cada participante gerou um estudo na Eva.'),
  (4, 'monitor', 2, 'Cada um sabe explicar as regras de cálculo.'),
  (4, 'monitor', 3, 'Os estudos foram revisados pelo monitor.'),
  (4, 'monitor', 4, 'Cada um saiu com o imóvel da ACM do dia seguinte definido.'),
  (5, 'monitor', 1, 'Cada participante conduziu ao menos uma V2 simulada completa.'),
  (5, 'monitor', 2, 'Cada um sabe explicar as cláusulas principais do contrato.'),
  (5, 'monitor', 3, 'Cada um treinou as objeções.'),
  (5, 'monitor', 4, 'Cada um saiu com a V2 ou a simulação do dia seguinte combinada.'),
  (1, 'participante', 1, 'Visitei as portarias dos 3 a 4 condomínios escolhidos.'),
  (1, 'participante', 2, 'Cadastrei os condomínios no painel de posicionamento.'),
  (1, 'participante', 3, 'Montei na Lista de ligações a lista de proprietários para ligar.'),
  (2, 'participante', 1, 'Fiz as primeiras ligações no Call Blitz e registrei no painel.'),
  (2, 'participante', 2, 'Agendei no painel os retornos das ligações.'),
  (3, 'participante', 1, 'Acompanhei uma V1 real ou fiz uma simulação.'),
  (4, 'participante', 1, 'Montei o estudo de mercado de um imóvel real na Eva.'),
  (4, 'participante', 2, 'Enviei o estudo para o monitor da oficina de ACM revisar.'),
  (5, 'participante', 1, 'Acompanhei uma apresentação (V2) real ou fiz uma simulação.')
on conflict (oficina_id, publico, texto) do nothing;

-- Conferência: monitores cadastrados
select o.nome as oficina, c.nome as monitor, m.dia_semana, m.periodo
from public.onb_oficina_monitores m
join public.onb_oficinas o on o.id = m.oficina_id
left join public.corretores_associados c on c.id = m.corretor_id
order by o.ordem, m.dia_semana nulls last;

-- Oficinas da loja (/oficinas): cada monitor registra a presença dos corretores
-- na sua oficina e acessa o material de apoio (dele e para os participantes).
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

-- Monitores: só entra quem tem UM corretor ativo com aquele nome. Quem ficar de
-- fora (nome ambíguo ou não encontrado) aparece na conferência e se acerta na tela.
do $$
declare
  r record;
  v_ids bigint[];
begin
  for r in
    select * from (values
      (1, 'Salete%',         1, 'tarde'),
      (1, 'Andrea%',         2, 'tarde'),
      (2, 'Rafael Vaz%',     null::int, null::text),
      (2, 'Suzana%',         null, null),
      (3, 'Lucas%',          null, null),
      (3, 'Diogo%',          null, null),
      (4, 'Samia%',          3, null),
      (4, 'Guilherme%',      4, null),
      (5, 'Silvia Freitas%', null, null),
      (5, 'Samia%',          null, null)
    ) as t(oficina_id, padrao, dia, periodo)
  loop
    select array_agg(id) into v_ids
    from public.corretores_associados
    where nome ilike r.padrao and coalesce(status, 'ativo') = 'ativo';
    if coalesce(array_length(v_ids, 1), 0) = 1 then
      insert into public.onb_oficina_monitores (oficina_id, corretor_id, dia_semana, periodo)
      values (r.oficina_id, v_ids[1], r.dia, r.periodo)
      on conflict (oficina_id, corretor_id) do nothing;
    else
      raise notice 'Oficina %: "%" não entrou (% corretores ativos com esse nome)', r.oficina_id, r.padrao, coalesce(array_length(v_ids, 1), 0);
    end if;
  end loop;
end $$;

-- Conferência: monitores cadastrados
select o.nome as oficina, c.nome as monitor, m.dia_semana, m.periodo
from public.onb_oficina_monitores m
join public.onb_oficinas o on o.id = m.oficina_id
left join public.corretores_associados c on c.id = m.corretor_id
order by o.ordem, m.dia_semana nulls last;

-- Marcos da trilha só em dia útil de segunda a sexta (06/11/2026).
-- A semana 1 contava o sábado como dia útil (ex.: "Retirar o kit" num sábado, com a
-- imobiliária fechada). Agora: semana 1 = um marco por dia de segunda a sexta; oficinas
-- seguem nas datas da grade da semana 2; fechamento dos 30 dias cai na sexta (ou antes).
-- RODAR NO SQL EDITOR DO SUPABASE. Pode rodar mais de uma vez.

-- n-ésimo dia de segunda a sexta a partir do início (início no fim de semana vai para a segunda)
create or replace function public.onb_dia_util_semana(p_inicio date, p_n int) returns date
language sql immutable as $$
  select d::date
  from generate_series(p_inicio, p_inicio + 90, interval '1 day') d
  where extract(isodow from d) < 6
  order by d
  offset greatest(p_n, 1) - 1 limit 1
$$;

create or replace function public.onb_data_marco(p_inicio date, p_dia int, p_ref text) returns date
language sql immutable as $$
  select case regexp_replace(coalesce(p_ref, ''), '^(antigo:)+', '')
    when 'oficina:posicionamento' then w          -- segunda de manhã (ou a sexta anterior à tarde)
    when 'oficina:ligacoes'       then w + 1      -- terça à tarde
    when 'oficina:v1'             then w + 2      -- quarta
    when 'oficina:acm'            then w + 2      -- quarta à tarde
    when 'oficina:v2'             then w + 3      -- quinta à tarde
    when 'roteiro:reuniao_s2'     then w + 4      -- sexta da semana 2
    when 'roteiro:fechamentos'    then w + 7      -- semanas 3 e 4
    when 'roteiro:fechamento_30'  then f - case extract(isodow from f)::int when 6 then 1 when 7 then 2 else 0 end
    else public.onb_dia_util_semana(p_inicio, p_dia)  -- semana 1: um marco por dia, segunda a sexta
  end
  from (select public.onb_semana2(p_inicio) as w, greatest(p_inicio + 29, public.onb_semana2(p_inicio) + 18) as f) x
$$;

-- Suzana: sem os dias personalizados (terça e quinta) que vieram da trilha antiga
update public.onb_novatos set dias_semana = null where id = '81140ef5-c893-430d-b5fa-1fdf4f77cd8f';

-- Refaz as datas dos novatos ativos que começaram a partir de 02/11
select n.nome, public.onb_gerar_tarefas(n.id) as marcos
from public.onb_novatos n
where n.status = 'ativo' and n.dias_semana is null and n.data_inicio >= '2026-11-02';

-- Confere
select n.nome, string_agg(to_char(k.data_prevista, 'Dy DD/MM') || ' ' || left(t.titulo, 30), ' | ' order by k.data_prevista, t.ordem) as datas
from public.onb_novatos n
join public.onb_tarefas k on k.novato_id = n.id
join public.onb_trilha t on t.id = k.trilha_id and t.ativo
where n.status = 'ativo' and n.data_inicio >= '2026-11-02'
group by n.nome order by n.nome;

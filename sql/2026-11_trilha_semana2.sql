-- Trilha alinhada à grade das oficinas (06/11/2026).
-- Semana 2 = a segunda-feira seguinte ao início da trilha, qualquer que seja o dia do início
-- (início numa segunda: semana 2 = a segunda seguinte). Os marcos de oficina caem nas datas
-- reais da grade dessa semana; a semana do Max (metas, apoio, fechamento) passa a ser
-- contada pelo calendário. Vale para o ritmo padrão (sem dias de trabalho personalizados).
-- RODAR NO SQL EDITOR DO SUPABASE. Pode rodar mais de uma vez.

-- 1) Segunda-feira da semana 2
create or replace function public.onb_semana2(p_inicio date) returns date
language sql immutable as $$
  select (date_trunc('week', public.onb_ajusta_inicio(p_inicio))::date + 7)
$$;

-- 2) Data de cada marco
create or replace function public.onb_data_marco(p_inicio date, p_dia int, p_ref text) returns date
language sql immutable as $$
  select case regexp_replace(coalesce(p_ref, ''), '^(antigo:)+', '')
    when 'oficina:posicionamento' then w          -- segunda de manhã (ou a sexta anterior à tarde)
    when 'oficina:ligacoes'       then w + 1      -- terça à tarde
    when 'oficina:v1'             then w + 2      -- quarta
    when 'oficina:acm'            then w + 2      -- quarta à tarde
    when 'oficina:v2'             then w + 3      -- quinta à tarde
    when 'roteiro:reuniao_s2'     then w + 4      -- fim da semana 2
    when 'roteiro:fechamentos'    then w + 7      -- semanas 3 e 4
    when 'roteiro:fechamento_30'  then greatest(public.onb_data_util(p_inicio, p_dia), w + 18)
    else public.onb_data_util(p_inicio, p_dia)    -- semana 1: um marco por dia útil
  end
  from (select public.onb_semana2(p_inicio) as w) x
$$;

-- 3) Semana da trilha pelo calendário (1 antes da semana 2; máximo 4)
create or replace function public.onb_semana(p_novato uuid) returns int
language sql stable as $$
  select case when public.onb_hoje() < public.onb_semana2(n.data_inicio) then 1
              else least(4, 2 + (public.onb_hoje() - public.onb_semana2(n.data_inicio)) / 7) end
  from public.onb_novatos n where n.id = p_novato
$$;

-- 4) onb_gerar_tarefas (ritmo padrão) passa a usar onb_data_marco
do $$
declare d text;
begin
  d := pg_get_functiondef('public.onb_gerar_tarefas(uuid)'::regprocedure);
  if position('onb_data_marco' in d) = 0 then
    if position('onb_data_util(v_inicio, t.dia)' in d) = 0 then raise exception 'onb_gerar_tarefas: trecho não encontrado'; end if;
    execute replace(d, 'onb_data_util(v_inicio, t.dia)', 'onb_data_marco(v_inicio, t.dia, t.conteudo_ref)');
  end if;
end $$;

-- 5) onb_rotina: semana pelo calendário
do $$
declare d text; antigo constant text := 'v_sem := least(4, greatest(1, ceil(v_dia / 6.0)::int));';
begin
  d := pg_get_functiondef('public.onb_rotina(text,text)'::regprocedure);
  if position('onb_semana(n.id)' in d) = 0 then
    if position(antigo in d) = 0 then raise exception 'onb_rotina: trecho não encontrado'; end if;
    execute replace(d, antigo, 'v_sem := public.onb_semana(n.id);');
  end if;
end $$;

-- 6) Refaz as datas dos novatos ativos que começaram a partir de 02/11
select n.nome, n.data_inicio, public.onb_gerar_tarefas(n.id) as marcos, public.onb_semana2(n.data_inicio) as semana2
from public.onb_novatos n
where n.status = 'ativo' and n.dias_semana is null and n.data_inicio >= '2026-11-02'
order by n.nome;

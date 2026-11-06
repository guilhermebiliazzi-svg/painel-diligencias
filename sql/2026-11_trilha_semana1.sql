-- Trilha: marcos da semana 1 sempre ANTES da semana 2 (06/11/2026).
-- O território (e kit, F.R.O.G.) tem de estar pronto antes da oficina de Posicionamento,
-- que abre a semana 2. Regras, conferidas para início em qualquer dia da semana:
--  * semana 2 = a segunda-feira seguinte ao início (início no sábado ou domingo: a semana
--    começa na segunda seguinte e a semana 2 é a outra);
--  * semana 1: um marco por dia, segunda a sexta, sem passar da sexta antes da semana 2
--    (semana curta: os que sobram ficam na sexta);
--  * semana 2: oficinas nas datas da grade (seg Posicionamento, ter Ligações, qua V1 e ACM,
--    qui V2) e reunião com o Team Leader na sexta;
--  * fechamentos com o padrinho a partir da segunda da semana 3;
--  * fechamento dos 30 dias numa sexta (ou antes), nunca no fim de semana.
-- RODAR NO SQL EDITOR DO SUPABASE. Pode rodar mais de uma vez.

create or replace function public.onb_inicio_util(p_inicio date) returns date
language sql immutable as $$
  select p_inicio + case extract(isodow from p_inicio)::int when 6 then 2 when 7 then 1 else 0 end
$$;

create or replace function public.onb_semana2(p_inicio date) returns date
language sql immutable as $$
  select (date_trunc('week', public.onb_inicio_util(p_inicio))::date + 7)
$$;

create or replace function public.onb_data_marco(p_inicio date, p_dia int, p_ref text) returns date
language sql immutable as $$
  select case regexp_replace(coalesce(p_ref, ''), '^(antigo:)+', '')
    when 'oficina:posicionamento' then w
    when 'oficina:ligacoes'       then w + 1
    when 'oficina:v1'             then w + 2
    when 'oficina:acm'            then w + 2
    when 'oficina:v2'             then w + 3
    when 'roteiro:reuniao_s2'     then w + 4
    when 'roteiro:fechamentos'    then w + 7
    when 'roteiro:fechamento_30'  then f - case extract(isodow from f)::int when 6 then 1 when 7 then 2 else 0 end
    else least(public.onb_dia_util_semana(p_inicio, p_dia), w - 3)   -- semana 1, até a sexta
  end
  from (select public.onb_semana2(p_inicio) as w,
               greatest(public.onb_inicio_util(p_inicio) + 29, public.onb_semana2(p_inicio) + 18) as f) x
$$;

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

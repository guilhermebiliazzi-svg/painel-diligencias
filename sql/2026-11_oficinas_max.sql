-- Max + oficinas: lembretes e avisos das oficinas, dentro da rotina que já existe
-- (n8n "ONB – Rotina"). Não altera a onb_rotina: o n8n passa a ler
--   select * from onb_rotina($1) union all select * from onb_oficinas_rotina($1)
-- e envia tudo pelo mesmo caminho (texto se a janela de 24h estiver aberta,
-- senão o modelo onb_aviso). Nenhuma execução a mais no n8n.
--
--   18h seg–sex e dom 19h  véspera: novato (semana 2) e monitor da oficina de amanhã
--   8h30 seg–sáb           aplicação: quem teve presença registrada recebe o checklist
--                          faltou: novato que não foi à oficina de ontem recebe a próxima data
--                          presença esquecida: aviso ao Guilherme
--
-- Cada aviso sai uma vez só (tabela onb_oficina_avisos). Se algo der erro aqui,
-- a função não devolve nada e a rotina do Max segue normal.
-- RODAR NO SQL EDITOR DO SUPABASE. Só cria coisa nova.

create table if not exists public.onb_oficina_avisos (
  chave      text primary key,
  criado_em  timestamptz not null default now()
);
alter table public.onb_oficina_avisos enable row level security;

-- Telefone para o WhatsApp: só dígitos, com 55 na frente
create or replace function public.onb_oficina_fone(p text) returns text
language sql immutable as $$
  select case
    when length(d) in (10, 11) then '55' || d
    when length(d) >= 12 then d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

-- Marca um aviso como enviado; false se já tinha sido
create or replace function public.onb_oficina_aviso(p_chave text) returns boolean
language plpgsql as $$
begin
  insert into public.onb_oficina_avisos (chave) values (p_chave);
  return true;
exception when unique_violation then
  return false;
end $$;

-- Janela de 24h do WhatsApp aberta com esse número?
create or replace function public.onb_oficina_janela(p_fone text) returns boolean
language sql stable as $$
  select exists (select 1 from public.onb_mensagens m
                 where m.phone = p_fone and m.direcao = 'in' and m.criado_em > now() - interval '23 hours 50 minutes')
$$;

-- 'segunda à tarde', 'quarta de manhã'
create or replace function public.onb_oficina_quando(p_data date, p_periodo text) returns text
language sql immutable as $$
  select (array['segunda','terça','quarta','quinta','sexta','sábado','domingo'])[extract(isodow from p_data)::int]
         || ' ' || to_char(p_data, 'DD/MM')
         || case p_periodo when 'manha' then ' de manhã' when 'tarde' then ' à tarde' else '' end
$$;

-- Próxima data (depois de p_depois) em que a oficina acontece, com período e monitores
create or replace function public.onb_oficina_proxima(p_oficina smallint, p_depois date) returns text
language plpgsql stable as $$
declare v_d date;
begin
  select min(p_depois + ((m.dia_semana - extract(isodow from p_depois)::int + 6) % 7) + 1) into v_d
  from public.onb_oficina_monitores m where m.oficina_id = p_oficina and m.dia_semana is not null;
  if v_d is null then return null; end if;
  return (
    select string_agg(public.onb_oficina_quando(v_d, s.periodo) || coalesce(' com ' || s.monitores, ''), ' ou ' order by s.periodo)
    from (select m.periodo, string_agg(split_part(split_part(c.nome, ' - ', 1), ' ', 1), ' e ' order by c.nome) as monitores
          from public.onb_oficina_monitores m left join public.corretores_associados c on c.id = m.corretor_id
          where m.oficina_id = p_oficina and m.dia_semana = extract(isodow from v_d)
          group by m.periodo) s);
end $$;

create or replace function public.onb_oficinas_rotina_core(p_tipo text, p_admin text default '5511989766590')
returns table (para text, nome text, texto text, template text, p1 text, p2 text, p3 text, janela boolean, novato_id uuid)
language plpgsql as $$
declare
  v_inicio constant date := date '2026-11-09';
  v_hoje date := public.onb_hoje();
  v_amanha date := public.onb_hoje() + 1;
  v_ontem date := public.onb_hoje() - 1;
  v_admin text := public.onb_oficina_fone(p_admin);
  r record; n record; v_lista text; v_cor bigint; v_dia int;
begin
  ---------------------------------------------------------------- véspera
  if (p_tipo = 'cobranca' and extract(isodow from v_hoje) between 1 and 5)
     or (p_tipo = 'fechamento' and extract(isodow from v_hoje) = 7) then
    if v_amanha >= v_inicio then
      -- monitor: uma mensagem por oficina que conduz amanhã
      for r in
        select o.id, o.nome as oficina, o.slug, m.periodo, c.nome as cnome, public.onb_oficina_fone(c.phone) as fone
        from public.onb_oficina_monitores m
        join public.onb_oficinas o on o.id = m.oficina_id and o.ativa
        join public.corretores_associados c on c.id = m.corretor_id
        where m.dia_semana = extract(isodow from v_amanha)
        order by o.ordem
      loop
        continue when r.fone is null or not public.onb_oficina_aviso('vespera_monitor|' || r.fone || '|' || r.slug || '|' || v_amanha);
        para := r.fone; nome := split_part(split_part(r.cnome, ' - ', 1), ' ', 1); novato_id := null;
        janela := public.onb_oficina_janela(r.fone);
        texto := format('Olá, %s! Amanhã (%s) você conduz a oficina de %s. Depois, registre a presença e o checklist do encontro no painel: painel.villejardins.com.br/oficinas/%s',
                        nome, public.onb_oficina_quando(v_amanha, r.periodo), r.oficina, r.slug);
        template := 'onb_aviso'; p1 := nome; p2 := texto; p3 := null;
        return next;
      end loop;

      -- novato na semana 2: as oficinas de amanhã que ainda não fez (uma mensagem)
      for n in select x.id, x.nome, x.phone from public.onb_novatos x where x.status = 'ativo' loop
        v_dia := public.onb_dia_atual(n.id);
        continue when v_dia not between 5 and 16;
        select c.id into v_cor from public.corretores_associados c
        where right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(n.phone, '\D', '', 'g'), 8)
        limit 1;
        select string_agg(format('• %s: %s', o.nome, s.quando), chr(10) order by o.ordem)
          into v_lista
        from public.onb_oficinas o
        join lateral (
          select string_agg(x.per || coalesce(' com ' || x.monitores, ''), ', ou ' order by x.periodo) as quando
          from (select m.periodo,
                       case m.periodo when 'manha' then 'de manhã' when 'tarde' then 'à tarde' else 'horário a confirmar' end as per,
                       string_agg(split_part(split_part(c.nome, ' - ', 1), ' ', 1), ' e ' order by c.nome) as monitores
                from public.onb_oficina_monitores m left join public.corretores_associados c on c.id = m.corretor_id
                where m.oficina_id = o.id and m.dia_semana = extract(isodow from v_amanha)
                group by m.periodo) x
          having count(*) > 0
        ) s on true
        where o.ativa
          and not exists (select 1 from public.onb_oficina_presencas p where p.oficina_id = o.id and p.corretor_id = v_cor);
        continue when v_lista is null or not public.onb_oficina_aviso('vespera_novato|' || n.id || '|' || v_amanha);
        para := n.phone; nome := split_part(n.nome, ' ', 1); novato_id := n.id;
        janela := public.onb_oficina_janela(n.phone);
        texto := format('%s, amanhã (%s) tem oficina na loja:%s%s%sAs oficinas são meio período, na Rua Batataes, 148. Chegue no horário e leve o celular carregado.',
                        nome, public.onb_oficina_quando(v_amanha, null), chr(10), v_lista, chr(10) || chr(10));
        template := 'onb_aviso'; p1 := nome; p2 := texto; p3 := null;
        return next;
      end loop;
    end if;

  ---------------------------------------------------------------- manhã seguinte
  elsif p_tipo = 'bom_dia' and extract(isodow from v_hoje) between 1 and 6 then
    -- aplicação: quem teve presença registrada (até 3 dias atrás) recebe o checklist
    for r in
      select p.corretor_id, c.nome as cnome, public.onb_oficina_fone(c.phone) as fone,
             array_agg(p.id) as ids,
             string_agg(format('%s (%s): %s', o.nome, to_char(p.data, 'DD/MM'),
                        coalesce((select string_agg(i.texto, ' ' order by i.ordem) from public.onb_oficina_check_itens i
                                  where i.oficina_id = o.id and i.publico = 'participante' and i.ativo), 'aplicar o que viu')),
                        chr(10) || '• ' order by p.data, o.ordem) as itens
      from public.onb_oficina_presencas p
      join public.onb_oficinas o on o.id = p.oficina_id
      join public.corretores_associados c on c.id = p.corretor_id
      where p.data >= greatest(v_inicio, v_hoje - 3) and p.data < v_hoje
        and not exists (select 1 from public.onb_oficina_avisos a where a.chave = 'aplicacao|' || p.id)
      group by p.corretor_id, c.nome, c.phone
    loop
      insert into public.onb_oficina_avisos (chave) select 'aplicacao|' || x from unnest(r.ids) x on conflict do nothing;
      continue when r.fone is null;
      para := r.fone; nome := split_part(split_part(r.cnome, ' - ', 1), ' ', 1);
      novato_id := (select x.id from public.onb_novatos x
                    where right(regexp_replace(x.phone, '\D', '', 'g'), 8) = right(r.fone, 8) limit 1);
      janela := public.onb_oficina_janela(r.fone);
      texto := format('Bom dia, %s! Obrigado por participar da oficina. Agora é aplicar:%s• %s%sMarque o que fizer em painel.villejardins.com.br/oficinas',
                      nome, chr(10), r.itens, chr(10) || chr(10));
      template := 'onb_aviso'; p1 := nome; p2 := texto; p3 := null;
      return next;
    end loop;

    -- faltou: novato na semana 2 que não foi à oficina de ontem (só se a oficina aconteceu)
    if v_ontem >= v_inicio then
      for n in select x.id, x.nome, x.phone from public.onb_novatos x where x.status = 'ativo' loop
        v_dia := public.onb_dia_atual(n.id);
        continue when v_dia not between 6 and 17;
        select c.id into v_cor from public.corretores_associados c
        where right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(n.phone, '\D', '', 'g'), 8)
        limit 1;
        select string_agg(format('• %s: a próxima é %s', o.nome, coalesce(public.onb_oficina_proxima(o.id, v_hoje - 1), 'a confirmar')), chr(10) order by o.ordem)
          into v_lista
        from public.onb_oficinas o
        where o.ativa
          and exists (select 1 from public.onb_oficina_presencas p where p.oficina_id = o.id and p.data = v_ontem)
          and not exists (select 1 from public.onb_oficina_presencas p where p.oficina_id = o.id and p.corretor_id = v_cor);
        continue when v_lista is null or not public.onb_oficina_aviso('faltou|' || n.id || '|' || v_ontem);
        para := n.phone; nome := split_part(n.nome, ' ', 1); novato_id := n.id;
        janela := public.onb_oficina_janela(n.phone);
        texto := format('%s, não vi sua presença na oficina de ontem. Dá para fazer na próxima:%s%s%sSe você participou, peça ao monitor para registrar no painel.',
                        nome, chr(10), v_lista, chr(10) || chr(10));
        template := 'onb_aviso'; p1 := nome; p2 := texto; p3 := null;
        return next;
      end loop;
    end if;

    -- presença esquecida: encontros da grade (até 3 dias atrás) sem nenhuma presença
    select string_agg(format('%s em %s (%s)', s.oficina, to_char(s.d, 'DD/MM'), s.monitores), '; ' order by s.d, s.ordem)
      into v_lista
    from (
      select o.id, o.nome as oficina, o.ordem, g::date as d,
             string_agg(split_part(split_part(c.nome, ' - ', 1), ' ', 1), ' e ' order by c.nome) as monitores
      from generate_series(greatest(v_inicio, v_hoje - 3), v_ontem, interval '1 day') g
      join public.onb_oficina_monitores m on m.dia_semana = extract(isodow from g)
      join public.onb_oficinas o on o.id = m.oficina_id and o.ativa
      left join public.corretores_associados c on c.id = m.corretor_id
      where not exists (select 1 from public.onb_oficina_presencas p where p.oficina_id = o.id and p.data = g::date)
        and not exists (select 1 from public.onb_oficina_avisos a where a.chave = 'esquecida|' || o.id || '|' || g::date)
      group by o.id, o.nome, o.ordem, g
    ) s;
    if v_lista is not null and v_admin is not null then
      insert into public.onb_oficina_avisos (chave)
      select 'esquecida|' || o.id || '|' || g::date
      from generate_series(greatest(v_inicio, v_hoje - 3), v_ontem, interval '1 day') g
      join public.onb_oficina_monitores m on m.dia_semana = extract(isodow from g)
      join public.onb_oficinas o on o.id = m.oficina_id and o.ativa
      where not exists (select 1 from public.onb_oficina_presencas p where p.oficina_id = o.id and p.data = g::date)
      on conflict do nothing;
      para := v_admin; nome := 'Guilherme'; novato_id := null;
      janela := public.onb_oficina_janela(v_admin);
      texto := 'Oficinas sem presença registrada no painel: ' || left(v_lista, 800) || '. Se a oficina não aconteceu, ignore.';
      template := 'onb_aviso'; p1 := 'Guilherme'; p2 := texto; p3 := null;
      return next;
    end if;
  end if;
end $$;

-- O que o n8n chama. Se der qualquer erro, não devolve nada (e desfaz as marcas
-- de aviso): a rotina do Max continua funcionando.
create or replace function public.onb_oficinas_rotina(p_tipo text, p_admin text default '5511989766590')
returns table (para text, nome text, texto text, template text, p1 text, p2 text, p3 text, janela boolean, novato_id uuid)
language plpgsql as $$
begin
  return query select * from public.onb_oficinas_rotina_core(p_tipo, p_admin);
exception when others then
  raise warning 'onb_oficinas_rotina(%): %', p_tipo, sqlerrm;
  return;
end $$;

-- Conferência (não envia nada; só mostra o que sairia, e desfaz as marcas):
-- begin; select * from public.onb_oficinas_rotina('cobranca'); rollback;

-- Conferência: as duas funções precisam devolver as mesmas colunas
select p.oid::regprocedure as funcao, pg_get_function_result(p.oid) as colunas
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname in ('onb_rotina', 'onb_oficinas_rotina');

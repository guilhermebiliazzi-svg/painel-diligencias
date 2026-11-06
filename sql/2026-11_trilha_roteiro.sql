-- Trilha do Max alinhada ao Roteiro dos 30 primeiros dias (nov/2026)
--
-- O Max lembra, acompanha e tira dúvidas; quem ensina são as pessoas.
--   * trilha: sai a lista de tarefas diárias (prints, lote do dia, cartilha,
--     quizzes); entram marcos por semana, sem cobrança de prazo (quem conduz a
--     semana 1 é a Jéssica). As oficinas se marcam sozinhas quando o monitor
--     registra a presença no painel.
--   * rotina: segunda 8h30 metas da semana e oficina do dia; quarta 8h30 como
--     estão as metas e onde precisa de apoio; sexta 18h fechamento da semana
--     (ligações, contatos, V1, V2, condomínios). Sai o bom-dia diário com
--     tarefas, a cobrança das 18h e o fechamento de domingo. Os avisos das
--     oficinas (onb_oficinas_rotina) seguem iguais.
--
-- Backup antes de mudar: cópia da trilha e o código atual da onb_rotina.
-- RODAR NO SQL EDITOR DO SUPABASE.

-- 0) Backup ------------------------------------------------------------------
create table if not exists public.onb_backup (
  id         bigint generated always as identity primary key,
  objeto     text not null,
  conteudo   text not null,
  criado_em  timestamptz not null default now()
);
alter table public.onb_backup enable row level security;

insert into public.onb_backup (objeto, conteudo)
select 'function onb_rotina (antes da trilha por marcos)', pg_get_functiondef('public.onb_rotina(text,text)'::regprocedure);
insert into public.onb_backup (objeto, conteudo)
select 'tabela onb_trilha (antes da trilha por marcos)', coalesce(jsonb_agg(to_jsonb(t) order by t.dia, t.ordem)::text, '[]')
from public.onb_trilha t;

-- 1) Trilha: desativa as tarefas antigas e cria os marcos ---------------------
update public.onb_trilha set ativo = false
where ativo and coalesce(conteudo_ref, '') not like 'roteiro:%';

insert into public.onb_trilha (dia, ordem, tipo, titulo, descricao, conteudo_ref, comprovacao, obrigatoria, ativo)
select v.dia, v.ordem, v.tipo, v.titulo, v.descricao, v.ref, null, v.obr, true
from (values
  -- Semana 1: chegada (Team Leader e Jéssica)
  (1, 11, 'pratica',  'Assinar o contrato, receber a Cartilha do Corretor e os acessos',
      'Com a Jéssica: contrato, apresentação à equipe, inscrição no TTI e acessos (e-mail, Universidade REMAX, sistemas).', 'roteiro:contrato', false),
  (2, 11, 'estudo',   'Treinamento no escritório: acessos, sistemas e trilhas 1 e 2 da Universidade REMAX',
      'O dia todo no escritório, com a Jéssica.', 'roteiro:treinamento', false),
  (3, 11, 'pratica',  'Retirar o kit: cartão, crachá, pin e assinatura de e-mail',
      'Com a Jéssica, durante a semana 1.', 'roteiro:kit', false),
  (4, 11, 'prospeccao', 'Começar a lista F.R.O.G.',
      'Família, Relacionamentos, Ocupação e Grupos: as pessoas que você conhece. Você usa a lista na semana 2.', 'roteiro:frog', false),
  (5, 11, 'pratica',  'Escolher o território',
      'As ruas ou o miolo de bairro onde vai atuar. Você usa na oficina de Posicionamento.', 'roteiro:territorio', false),
  -- Semana 2: as 5 oficinas (marcadas pela presença registrada pelo monitor)
  (6, 11, 'pratica',  'Oficina: Posicionamento e Portarias',
      'Sexta à tarde ou segunda de manhã. Depois: mapear condomínios, visitar portarias e montar a Lista de ligações no painel.', 'oficina:posicionamento', false),
  (7, 11, 'pratica',  'Oficina: Ligações e Call Blitz',
      'Terça à tarde. As ligações começam no Call Blitz; registre cada uma na Lista de ligações do painel.', 'oficina:ligacoes', false),
  (8, 11, 'pratica',  'Oficina: V1',
      'Quarta de manhã ou à tarde. Depois: acompanhar uma V1 real do padrinho ou fazer uma simulação.', 'oficina:v1', false),
  (8, 12, 'pratica',  'Oficina: Elaboração de ACM',
      'Quarta à tarde. Depois: montar o estudo de mercado de um imóvel real com a Eva.', 'oficina:acm', false),
  (9, 11, 'pratica',  'Oficina: V2 (apresentação de ACM e fechamento)',
      'Quinta à tarde. Depois: acompanhar uma apresentação do padrinho ou fazer uma simulação.', 'oficina:v2', false),
  (12, 11, 'avaliacao', 'Reunião com o Team Leader sobre a jornada até aqui',
      'No fim da semana 2.', 'roteiro:reuniao_s2', false),
  -- Semanas 3 e 4: fechamentos com o padrinho
  (13, 11, 'campo',   'Fechamentos com o padrinho',
      'Siga ligando, visitando portarias e mapeando o território. Em cada V1 que marcar, o padrinho pode ir junto; a V2, com o estudo de mercado, vocês preparam juntos.', 'roteiro:fechamentos', false),
  (26, 11, 'avaliacao', 'Fechamento dos 30 dias',
      'Meta: 2 contratos de captação assinados. Conversa com o Team Leader sobre o próximo mês.', 'roteiro:fechamento_30', false)
) as v(dia, ordem, tipo, titulo, descricao, ref, obr)
where not exists (select 1 from public.onb_trilha t where t.conteudo_ref = v.ref);

-- 2) Novatos em andamento: tira as tarefas antigas pendentes e gera os marcos --
delete from public.onb_tarefas k
using public.onb_trilha t
where t.id = k.trilha_id and not t.ativo and k.status in ('pendente', 'reprovada');

select public.onb_gerar_tarefas(n.id) from public.onb_novatos n where n.status in ('ativo', 'pausado');

-- 3) Oficina com presença registrada = marco cumprido --------------------------
create or replace function public.onb_oficina_marco() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.onb_tarefas k set status = 'aprovada', entregue_em = coalesce(k.entregue_em, now())
  from public.onb_trilha t, public.onb_novatos n, public.onb_oficinas o, public.corretores_associados c
  where t.id = k.trilha_id and n.id = k.novato_id
    and o.id = new.oficina_id and t.conteudo_ref = 'oficina:' || o.slug
    and c.id = new.corretor_id
    and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(n.phone, '\D', '', 'g'), 8)
    and k.status <> 'aprovada';
  return new;
exception when others then
  return new;  -- nunca impede o registro da presença
end $$;

drop trigger if exists onb_oficina_marco on public.onb_oficina_presencas;
create trigger onb_oficina_marco after insert on public.onb_oficina_presencas
for each row execute function public.onb_oficina_marco();

-- 4) Rotina do Max -------------------------------------------------------------
create or replace function public.onb_rotina(p_tipo text, p_admin text default '5511989766590')
returns table (para text, nome text, texto text, template text, p1 text, p2 text, p3 text, janela boolean, novato_id uuid)
language plpgsql as $$
declare
  n record; v_dia int; v_sem int; v_dow int := extract(isodow from public.onb_hoje())::int;
  v_seg date := public.onb_hoje() - (extract(isodow from public.onb_hoje())::int - 1);
  v_cor bigint; v_lig int; v_cont int; v_cond int; v_v1 int; v_v2 int; v_ct int;
  v_txt text; v_ofic text; v_alerta text; v_rel text := '';
  c_metas constant text := 'ligações 7 a 8, contatos efetivos 1 a 2, portarias 2 a 3 e condomínios mapeados no painel 3 a 4';
  c_foco constant text[] := array[
    'chegada: onboarding com a Jéssica (contrato, acessos, treinamento no escritório e kit). Comece sua lista F.R.O.G. e escolha o seu território, que você usa na semana 2.',
    'as 5 oficinas da loja, aplicando cada uma logo em seguida.',
    'fechamentos de captação com o seu padrinho.',
    'fechamentos de captação com o seu padrinho. Meta dos 30 dias: 2 contratos de captação assinados.'];
begin
  for n in select x.*, p.v1, p.v2, p.contratos, p.tarefas_atrasadas
           from public.onb_novatos x join public.onb_placar p on p.novato_id = x.id
           where x.status = 'ativo' loop
    v_dia := public.onb_dia_atual(n.id);
    continue when v_dia < 1 or v_dia > 27;
    v_sem := least(4, greatest(1, ceil(v_dia / 6.0)::int));
    janela := exists (select 1 from public.onb_mensagens m where m.phone = n.phone and m.direcao = 'in' and m.criado_em > now() - interval '23 hours 50 minutes');
    para := n.phone; nome := split_part(n.nome, ' ', 1); novato_id := n.id;
    template := 'onb_aviso'; p1 := nome; p3 := null;

    -- números da semana (segunda até hoje), tirados do painel
    select count(*), count(*) filter (where c.resultado <> 'tentativa') into v_lig, v_cont
    from public.onb_contatos c where c.novato_id = n.id and c.data >= v_seg;
    select c.id into v_cor from public.corretores_associados c
    where right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(n.phone, '\D', '', 'g'), 8) limit 1;
    v_cond := 0;
    begin
      execute 'select count(*) from public.posicionamento_condominios where corretor_id = $1 and criado_em >= $2'
        into v_cond using v_cor, v_seg::timestamptz;
    exception when others then v_cond := 0;
    end;
    select count(*) filter (where v.tipo = 'V1'), count(*) filter (where v.tipo = 'V2'), count(*) filter (where v.tipo = 'contrato')
      into v_v1, v_v2, v_ct
    from public.onb_visitas v where v.novato_id = n.id and v.status = 'realizada' and v.data_hora >= v_seg;

    if p_tipo = 'bom_dia' and v_dow = 1 then
      -- segunda: metas da semana e oficina do dia
      select string_agg(o.nome || case m.periodo when 'manha' then ' (manhã)' when 'tarde' then ' (tarde)' else '' end, ', ' order by o.ordem, m.periodo)
        into v_ofic
      from public.onb_oficina_monitores m join public.onb_oficinas o on o.id = m.oficina_id and o.ativa
      where m.dia_semana = 1 and v_sem = 2;
      texto := format('Bom dia, %s! Semana %s da sua trilha: %s%s%s',
                 nome, v_sem, c_foco[v_sem],
                 case when v_sem >= 2 then chr(10) || chr(10) || 'Metas da semana: ' || c_metas || '.' else '' end,
                 coalesce(chr(10) || chr(10) || 'Oficina de hoje: ' || v_ofic || ', na loja.', ''));
      p2 := texto;
      return next;

    elsif p_tipo = 'bom_dia' and v_dow = 3 and v_sem >= 2 then
      -- quarta: como estão as metas e onde precisa de apoio
      texto := format('%s, meio da semana. Até agora: %s ligação(ões) (meta 7 a 8), %s contato(s) efetivo(s) (meta 1 a 2) e %s condomínio(s) mapeado(s) (meta 3 a 4). Em que você precisa de apoio? Me responda que eu levo para a reunião de terça com o Team Leader.',
                 nome, v_lig, v_cont, v_cond);
      p2 := texto;
      return next;

    elsif p_tipo = 'cobranca' and v_dow = 5 and v_sem >= 2 then
      -- sexta 18h: fechamento da semana
      texto := format('%s, fechamento da semana %s: %s ligação(ões), %s contato(s) efetivo(s), %s V1, %s V2 e %s condomínio(s) mapeado(s)%s. Metas por semana: %s. Bom fim de semana!',
                 nome, v_sem, v_lig, v_cont, v_v1, v_v2, v_cond,
                 case when n.contratos > 0 then format('. Contratos de captação até agora: %s de 2', n.contratos) else '' end,
                 c_metas);
      p2 := texto;
      return next;

    elsif p_tipo = 'cobranca' then
      -- todo dia 18h: alerta ao Guilherme de marco obrigatório atrasado há 2 dias ou mais (uma vez por tarefa)
      select string_agg(k.titulo, '; ' order by k.dia) into v_alerta
      from public.onb_tarefas k join public.onb_trilha t on t.id = k.trilha_id
      where k.novato_id = n.id and k.status in ('pendente','reprovada') and t.obrigatoria and t.ativo
        and public.onb_prazo(k.data_prevista) <= public.onb_hoje() - 2 and not k.alerta_enviado;
      if v_alerta is not null then
        update public.onb_tarefas k set alerta_enviado = true from public.onb_trilha t
        where t.id = k.trilha_id and k.novato_id = n.id and k.status in ('pendente','reprovada') and t.obrigatoria and t.ativo
          and public.onb_prazo(k.data_prevista) <= public.onb_hoje() - 2 and not k.alerta_enviado;
        para := public.onb_so_digitos(p_admin); nome := 'Guilherme'; p1 := 'Guilherme';
        janela := exists (select 1 from public.onb_mensagens m where m.phone = public.onb_so_digitos(p_admin) and m.direcao = 'in' and m.criado_em > now() - interval '23 hours 50 minutes');
        texto := format('Marco atrasado de %s (dia %s da trilha): %s', n.nome, v_dia, left(v_alerta, 800));
        p2 := texto;
        return next;
      end if;

    elsif p_tipo = 'relatorio' then
      -- segunda 9h: resumo para o Guilherme (semana anterior)
      select count(*), count(*) filter (where c.resultado <> 'tentativa') into v_lig, v_cont
      from public.onb_contatos c where c.novato_id = n.id and c.data >= v_seg - 7 and c.data < v_seg;
      v_rel := v_rel || format('%s (semana %s): %s ligações, %s contatos, V1 %s, V2 %s, contratos %s, marcos atrasados %s. ',
                 n.nome, v_sem, v_lig, v_cont, n.v1, n.v2, n.contratos, n.tarefas_atrasadas);
    end if;
  end loop;

  if p_tipo = 'relatorio' and v_rel <> '' then
    para := public.onb_so_digitos(p_admin); nome := 'Guilherme'; novato_id := null; p1 := 'Guilherme'; p3 := null;
    template := 'onb_aviso';
    janela := exists (select 1 from public.onb_mensagens m where m.phone = public.onb_so_digitos(p_admin) and m.direcao = 'in' and m.criado_em > now() - interval '23 hours 50 minutes');
    texto := 'Relatório semanal dos novatos: ' || left(v_rel, 950);
    p2 := texto;
    return next;
  end if;
end $$;

-- 5) Conferência ------------------------------------------------------------------
select dia, ordem, tipo, titulo, conteudo_ref, obrigatoria
from public.onb_trilha where ativo order by dia, ordem;

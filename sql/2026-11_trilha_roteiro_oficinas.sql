-- Correção do sql/2026-11_trilha_roteiro.sql: a trilha antiga já tinha tarefas de
-- oficina com conteudo_ref 'oficina:<slug>', e por isso os 5 marcos de oficina não
-- foram criados. Aqui as antigas viram 'antigo:oficina:<slug>' (seguem desativadas)
-- e os marcos novos entram. RODAR NO SQL EDITOR DO SUPABASE.

update public.onb_trilha
set conteudo_ref = 'antigo:' || conteudo_ref, ativo = false
where conteudo_ref like 'oficina:%' and not ativo;

insert into public.onb_trilha (dia, ordem, tipo, titulo, descricao, conteudo_ref, comprovacao, obrigatoria, ativo)
select v.dia, v.ordem, 'pratica', v.titulo, v.descricao, v.ref, null, false, true
from (values
  (6, 11, 'Oficina: Posicionamento e Portarias',
      'Sexta à tarde ou segunda de manhã. Depois: mapear condomínios, visitar portarias e montar a Lista de ligações no painel.', 'oficina:posicionamento'),
  (7, 11, 'Oficina: Ligações e Call Blitz',
      'Terça à tarde. As ligações começam no Call Blitz; registre cada uma na Lista de ligações do painel.', 'oficina:ligacoes'),
  (8, 11, 'Oficina: V1',
      'Quarta de manhã ou à tarde. Depois: acompanhar uma V1 real do padrinho ou fazer uma simulação.', 'oficina:v1'),
  (8, 12, 'Oficina: Elaboração de ACM',
      'Quarta à tarde. Depois: montar o estudo de mercado de um imóvel real com a Eva.', 'oficina:acm'),
  (9, 11, 'Oficina: V2 (apresentação de ACM e fechamento)',
      'Quinta à tarde. Depois: acompanhar uma apresentação do padrinho ou fazer uma simulação.', 'oficina:v2')
) as v(dia, ordem, titulo, descricao, ref)
where not exists (select 1 from public.onb_trilha t where t.conteudo_ref = v.ref);

delete from public.onb_tarefas k
using public.onb_trilha t
where t.id = k.trilha_id and not t.ativo and k.status in ('pendente', 'reprovada');

select public.onb_gerar_tarefas(n.id) from public.onb_novatos n where n.status in ('ativo', 'pausado');

-- Conferência: os 13 marcos ativos
select dia, ordem, tipo, titulo, conteudo_ref, obrigatoria
from public.onb_trilha where ativo order by dia, ordem;

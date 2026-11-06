-- Correção do sql/2026-11_trilha_roteiro.sql: ao rodar o script de novo, os 5
-- marcos de oficina (dia/ordem 6/11, 7/11, 8/11, 8/12, 9/11) foram desativados
-- junto com a trilha antiga. Aqui eles voltam a valer e a trilha dos novatos em
-- andamento é gerada de novo. Pode rodar mais de uma vez.
-- RODAR NO SQL EDITOR DO SUPABASE.

update public.onb_trilha
set ativo = true,
    conteudo_ref = regexp_replace(conteudo_ref, '^(antigo:)+', '')
where (dia, ordem) in ((6, 11), (7, 11), (8, 11), (8, 12), (9, 11))
  and conteudo_ref like '%oficina:%';

delete from public.onb_tarefas k
using public.onb_trilha t
where t.id = k.trilha_id and not t.ativo and k.status in ('pendente', 'reprovada');

select public.onb_gerar_tarefas(n.id) from public.onb_novatos n where n.status in ('ativo', 'pausado');

-- Conferência: os 13 marcos ativos
select dia, ordem, tipo, titulo, conteudo_ref, obrigatoria
from public.onb_trilha where ativo order by dia, ordem;

-- Contrato de associação do novato: preenchido pelo painel, enviado pelo Clicksign
-- (WhatsApp) e, depois que o corretor assina, o Max manda o resto das boas-vindas.
-- RODAR NO SQL EDITOR DO SUPABASE. Pode rodar mais de uma vez.

-- 1) Andamento do contrato em cada novato
alter table public.onb_novatos
  add column if not exists contrato_empresa text,          -- 'ville' | 'samia'
  add column if not exists contrato_pedido_id uuid,         -- representacao_envios.id
  add column if not exists contrato_envelope_id text,       -- Clicksign
  add column if not exists contrato_status text,            -- enviando | aguardando | assinado | erro | cancelado
  add column if not exists contrato_erro text,
  add column if not exists contrato_enviado_em timestamptz,
  add column if not exists contrato_assinado_em timestamptz,
  add column if not exists contrato_verificado_em timestamptz,
  add column if not exists boas_vindas_em timestamptz;

-- 2) Partes fixas do contrato (empresa, quem assina por ela e testemunhas).
--    Fica no banco, e não no código, porque tem CPF/RG.
create table if not exists public.onb_contrato_partes (
  chave text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.onb_contrato_partes enable row level security;

-- 3) Modelo do contrato (PDF no Drive) com o mapa dos campos do formulário
insert into public.base_conhecimento (drive_file_id, titulo, categoria, palavras_chave, mime_type, ativo, restrito, mapeamento_campos)
select '15T6W8ioBLhfk8lnsEjDqO0dbChNFpbiG', 'Contrato de Associação - Corretor PF (modelo do painel)', 'Contratos',
       'contrato associação associado corretor novato', 'application/pdf', true, true,
       jsonb_build_object('tipo', 'pdf_formulario', 'campos', jsonb_build_object(
         'imob_razao', 'RAZÃO SOCIAL DA EMPRESA QUE OPERA A AGÊNCIA FRANQUEADA',
         'imob_endereco', 'ENDEREÇO COMPLETO 01', 'imob_numero', 'NÚMERO 01', 'imob_complemento', 'COMPLEMENTO 01',
         'imob_bairro', 'BAIRRO 02', 'imob_municipio', 'MUNICIP 02', 'imob_estado', 'ESTADO 02',
         'imob_creci_uf', 'CRECI 02', 'imob_creci', 'NÚMERO 02', 'imob_cnpj', 'neste ato representada na forma de seu contrato',
         'assoc_nome', 'NOME COMPLETO', 'assoc_nacionalidade', 'NACIONALIDADE', 'assoc_estado_civil', 'ESTADO CIVIL',
         'assoc_creci_uf', 'CRECI F', 'assoc_creci', 'NUMEROggg', 'assoc_rg', 'NUMERO', 'assoc_rg_orgao', 'RG 02', 'assoc_rg_uf', 'RG 03',
         'assoc_cpf', 'CPF', 'assoc_endereco', 'ENDEREÇO', 'assoc_numero', 'n_2', 'assoc_complemento', 'complemento',
         'assoc_bairro', 'bairro_2', 'assoc_municipio', 'de_2', 'assoc_estado', 'Estado de_2',
         'mensalidade', 'undefineFd_3', 'mensalidade_extenso', 'VALOR NUNCA INFERIOR',
         'perc_associado', 'farão jus ao recebimento de', 'perc_associado_extenso', 'undefined_4',
         'perc_imob', 'por cento e', 'perc_imob_extenso', 'undefined_3',
         'vencimento_dia', 'DIA DO PAGAMENTO DA MENSALIDADE', 'vencimento_extenso', 'DIA',
         'foro_comarca', 'COMARCA', 'foro_estado', 'ESTADO', 'assinatura_cidade', 'CIDADE',
         'assinatura_dia', 'de', 'assinatura_mes', 'de_g1', 'assinatura_ano', 'undefined_7',
         'assinatura_associado', 'Texto2', 'assinatura_imob', 'Texto2GG1',
         'test1_nome', 'TextoGGFFF2', 'test1_rg', 'TextoGG', 'test1_cpf', 'Texto1',
         'test2_nome', 'TextoGGFS1', 'test2_rg', 'TextoGGF', 'test2_cpf', 'TextoF'
       ), 'padroes', '{}'::jsonb)
where not exists (select 1 from public.base_conhecimento where drive_file_id = '15T6W8ioBLhfk8lnsEjDqO0dbChNFpbiG' and mapeamento_campos is not null);

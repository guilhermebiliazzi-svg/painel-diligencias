-- Notas de comissão + base da DIMOB — script único e idempotente.
--
-- Substitui os dois anteriores. O SQL Editor do Supabase roda tudo em UMA
-- transação: qualquer erro desfaz o script inteiro, então a ordem importa e
-- cada passo precisa tolerar já estar aplicado.
--
-- Estado esperado antes: pode existir uma adm_notas_comissao da primeira
-- versão (sem operacao_id/tomador_lado), ou nada.

-- ================================================================== --
-- 1. A operação imobiliária — é o que a DIMOB declara                 --
-- ================================================================== --
CREATE TABLE IF NOT EXISTS adm_operacoes_imobiliarias (
  id                     bigserial PRIMARY KEY,
  diligencia_id          uuid,
  valor_alienacao        numeric NOT NULL CHECK (valor_alienacao > 0),
  data_contrato          date NOT NULL,
  imovel_tipo_logradouro text,
  imovel_logradouro      text NOT NULL,
  imovel_numero          text,
  imovel_complemento     text,
  imovel_bairro          text,
  imovel_cep             text,
  imovel_cidade_ibge     text,
  imovel_uf              text,
  imovel_inscricao       text,
  imovel_matricula       text,
  observacao             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adm_operacoes_data_ix
  ON adm_operacoes_imobiliarias (data_contrato DESC);
CREATE INDEX IF NOT EXISTS adm_operacoes_dilig_ix
  ON adm_operacoes_imobiliarias (diligencia_id);

-- ================================================================== --
-- 2. As partes: cada lado pode ter várias pessoas                     --
-- ================================================================== --
CREATE TABLE IF NOT EXISTS adm_operacao_partes (
  id          bigserial PRIMARY KEY,
  operacao_id bigint NOT NULL REFERENCES adm_operacoes_imobiliarias(id) ON DELETE CASCADE,
  papel       text NOT NULL CHECK (papel IN ('alienante','adquirente')),
  nome        text NOT NULL,
  doc         text NOT NULL,
  percentual  numeric CHECK (percentual > 0 AND percentual <= 100),
  ordem       int NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operacao_id, papel, doc)
);

CREATE INDEX IF NOT EXISTS adm_operacao_partes_ix
  ON adm_operacao_partes (operacao_id, papel, ordem);

-- ================================================================== --
-- 3. A nota de comissão                                               --
-- ================================================================== --
CREATE TABLE IF NOT EXISTS adm_notas_comissao (
  id                 bigserial PRIMARY KEY,
  asaas_payment_id   text,
  origem             text NOT NULL DEFAULT 'asaas'
                     CHECK (origem IN ('asaas','avulsa')),
  tomador_nome       text NOT NULL,
  tomador_doc        text NOT NULL,
  tomador_email      text,
  tomador_endereco   jsonb,
  valor_servico      numeric NOT NULL CHECK (valor_servico > 0),
  valor_cobranca     numeric,
  valor_splits       numeric,
  codigo_servico     text,
  discriminacao      text,
  status             adm_status_nota NOT NULL DEFAULT 'a_emitir',
  numero_nota        text,
  codigo_verificacao text,
  data_emissao       date,
  pdf_url            text,
  rps_serie          text,
  rps_numero         bigint,
  rps_data_emissao   date,
  emissao_erro       text,
  observacao         text,
  enviado_em         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- colunas que a primeira versão não tinha
ALTER TABLE adm_notas_comissao
  ADD COLUMN IF NOT EXISTS operacao_id  bigint,
  ADD COLUMN IF NOT EXISTS tomador_lado text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adm_notas_comissao_operacao_fk') THEN
    ALTER TABLE adm_notas_comissao
      ADD CONSTRAINT adm_notas_comissao_operacao_fk
      FOREIGN KEY (operacao_id) REFERENCES adm_operacoes_imobiliarias(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adm_notas_comissao_lado_chk') THEN
    ALTER TABLE adm_notas_comissao
      ADD CONSTRAINT adm_notas_comissao_lado_chk
      CHECK (tomador_lado IS NULL OR tomador_lado IN ('comprador','vendedor','outro'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nc_origem_coerente') THEN
    ALTER TABLE adm_notas_comissao
      ADD CONSTRAINT nc_origem_coerente CHECK (
        (origem = 'asaas'  AND asaas_payment_id IS NOT NULL) OR
        (origem = 'avulsa' AND asaas_payment_id IS NULL)
      );
  END IF;
END $$;

-- Uma nota viva por cobrança POR TOMADOR: permite dividir a comissão entre
-- marido e mulher, e ainda impede que dois cliques emitam a mesma nota.
DROP INDEX IF EXISTS adm_notas_comissao_asaas_uk;
CREATE UNIQUE INDEX adm_notas_comissao_asaas_uk
  ON adm_notas_comissao (asaas_payment_id, tomador_doc)
  WHERE asaas_payment_id IS NOT NULL AND status <> 'cancelada';

CREATE INDEX IF NOT EXISTS adm_notas_comissao_status_ix
  ON adm_notas_comissao (status, created_at DESC);
CREATE INDEX IF NOT EXISTS adm_notas_comissao_operacao_ix
  ON adm_notas_comissao (operacao_id);

-- ================================================================== --
-- 4. Parcelamento: o WF-A2 já grava uma linha por parcela, mas nada   --
--    marca que aquilo é parcela                                       --
-- ================================================================== --
ALTER TABLE asaas_cobrancas
  ADD COLUMN IF NOT EXISTS asaas_installment_id text,
  ADD COLUMN IF NOT EXISTS parcela              int,
  ADD COLUMN IF NOT EXISTS total_parcelas       int;

CREATE INDEX IF NOT EXISTS asaas_cobrancas_installment_ix
  ON asaas_cobrancas (asaas_installment_id)
  WHERE asaas_installment_id IS NOT NULL;

-- ================================================================== --
-- 5. Visão da DIMOB: uma linha por nota emitida                       --
-- ================================================================== --
CREATE OR REPLACE VIEW adm_v_dimob_comissoes AS
SELECT
  n.id AS nota_id, n.numero_nota, n.data_emissao,
  EXTRACT(YEAR FROM n.data_emissao)::int AS ano,
  n.valor_servico AS valor_comissao,
  o.id AS operacao_id, o.data_contrato, o.valor_alienacao,
  (SELECT jsonb_agg(jsonb_build_object('nome', p.nome, 'doc', p.doc,
                                       'percentual', p.percentual) ORDER BY p.ordem)
     FROM adm_operacao_partes p
    WHERE p.operacao_id = o.id AND p.papel = 'alienante')  AS alienantes,
  (SELECT jsonb_agg(jsonb_build_object('nome', p.nome, 'doc', p.doc,
                                       'percentual', p.percentual) ORDER BY p.ordem)
     FROM adm_operacao_partes p
    WHERE p.operacao_id = o.id AND p.papel = 'adquirente') AS adquirentes,
  o.imovel_tipo_logradouro, o.imovel_logradouro, o.imovel_numero,
  o.imovel_complemento, o.imovel_bairro, o.imovel_cep,
  o.imovel_cidade_ibge, o.imovel_uf, o.imovel_inscricao, o.imovel_matricula,
  n.tomador_nome, n.tomador_doc, n.tomador_lado
FROM adm_notas_comissao n
JOIN adm_operacoes_imobiliarias o ON o.id = n.operacao_id
WHERE n.status = 'emitida';

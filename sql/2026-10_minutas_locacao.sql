-- Minutas de locação (19/10/2026)
-- O contrato só passa a existir no painel depois de assinado. Antes disso, a locação
-- é uma "minuta": guarda o formulário do Novo contrato, as partes, os documentos e as
-- condições do texto, e gera o contrato no Google Docs. Ao cadastrar o contrato assinado,
-- partes e documentos passam para o contrato (nada é redigitado).
-- A minuta não aparece em cobranças, repasses, avisos nem no portal do locador.

CREATE TABLE IF NOT EXISTS adm_minutas (
  id              bigserial PRIMARY KEY,
  status          text   NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','convertida','descartada')),
  titulo          text,                                  -- endereço do imóvel / locatário, para a lista
  dados           jsonb  NOT NULL DEFAULT '{}'::jsonb,   -- formulário do Novo contrato (imóvel, locador, locatário, aluguel, prazo, garantia, conta)
  minuta          jsonb  NOT NULL DEFAULT '{}'::jsonb,   -- garantia detalhada, condições, testemunhas (mesmo formato de adm_contratos.minuta)
  drive_pasta_id  text,                                  -- pasta do imóvel no Drive, se o imóvel ainda não está cadastrado
  contrato_id     bigint REFERENCES adm_contratos(id) ON DELETE SET NULL,  -- preenchido ao cadastrar o contrato assinado
  criado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adm_minutas_status ON adm_minutas (status, updated_at DESC);
ALTER TABLE adm_minutas ENABLE ROW LEVEL SECURITY;  -- acesso só pelo servidor (service role)

-- Partes e documentos podem pertencer a uma minuta (antes do contrato) ou a um contrato
ALTER TABLE adm_contrato_partes ADD COLUMN IF NOT EXISTS minuta_id bigint REFERENCES adm_minutas(id) ON DELETE SET NULL;
ALTER TABLE adm_contrato_partes ALTER COLUMN contrato_id DROP NOT NULL;
ALTER TABLE adm_contrato_partes DROP CONSTRAINT IF EXISTS adm_contrato_partes_dono_check;
ALTER TABLE adm_contrato_partes ADD CONSTRAINT adm_contrato_partes_dono_check CHECK (contrato_id IS NOT NULL OR minuta_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS adm_contrato_partes_minuta ON adm_contrato_partes (minuta_id, papel, ordem) WHERE minuta_id IS NOT NULL;

ALTER TABLE adm_contrato_documentos ADD COLUMN IF NOT EXISTS minuta_id bigint REFERENCES adm_minutas(id) ON DELETE SET NULL;
ALTER TABLE adm_contrato_documentos ALTER COLUMN contrato_id DROP NOT NULL;
ALTER TABLE adm_contrato_documentos DROP CONSTRAINT IF EXISTS adm_contrato_documentos_dono_check;
ALTER TABLE adm_contrato_documentos ADD CONSTRAINT adm_contrato_documentos_dono_check CHECK (contrato_id IS NOT NULL OR minuta_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS adm_contrato_documentos_minuta ON adm_contrato_documentos (minuta_id) WHERE minuta_id IS NOT NULL;

-- 19/10: locação NÃO administrada pela Ville — depois de assinada, a minuta só é encerrada (status 'assinada')
ALTER TABLE adm_minutas DROP CONSTRAINT IF EXISTS adm_minutas_status_check;
ALTER TABLE adm_minutas ADD CONSTRAINT adm_minutas_status_check CHECK (status IN ('rascunho','convertida','descartada','assinada'));

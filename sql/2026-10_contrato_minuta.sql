-- Contratos de locação e de administração gerados pelo painel (18/10/2026)
-- 1) Partes com qualificação completa (vários locadores, locatários e fiadores por contrato)
CREATE TABLE IF NOT EXISTS adm_contrato_partes (
  id            bigserial PRIMARY KEY,
  contrato_id   bigint NOT NULL REFERENCES adm_contratos(id) ON DELETE CASCADE,
  papel         text   NOT NULL CHECK (papel IN ('locador','locatario','fiador')),
  ordem         smallint NOT NULL DEFAULT 1,
  tipo_pessoa   text   NOT NULL DEFAULT 'PF' CHECK (tipo_pessoa IN ('PF','PJ')),
  nome          text   NOT NULL,
  cpf_cnpj      text,
  rg            text,              -- ex.: 37.306.191 SSP/SP
  genero        text CHECK (genero IN ('M','F')),  -- PF: flexão no texto (o locatário / a locatária)
  nacionalidade text,              -- PF
  estado_civil  text,              -- PF
  regime_bens   text,              -- PF casado
  profissao     text,              -- PF
  email         text,
  telefone      text,
  endereco      text,              -- endereço completo, com CEP
  representacao text,              -- PJ: "neste ato representada na forma de seu contrato social" ou o nome do representante
  conjuge       jsonb,             -- fiador casado: {nome, cpf, rg, nacionalidade, profissao}
  imoveis       jsonb,             -- fiador: [{cartorio, matricula, descricao}] lidos da matrícula
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adm_contrato_partes_contrato ON adm_contrato_partes (contrato_id, papel, ordem);
ALTER TABLE adm_contrato_partes ENABLE ROW LEVEL SECURITY;  -- acesso só pelo servidor (service role), como as outras adm_*

-- 2) Condições que só existem na minuta (caução, título, fiança, testemunhas, multas…)
ALTER TABLE adm_contratos ADD COLUMN IF NOT EXISTS minuta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Documentos das partes (RG/CNH, comprovante, certidão de estado civil, contrato social…)
--    ficam na mesma tela de documentos da locação, ligados à parte que os enviou
ALTER TABLE adm_contrato_documentos ADD COLUMN IF NOT EXISTS parte_id bigint REFERENCES adm_contrato_partes(id) ON DELETE SET NULL;
ALTER TABLE adm_contrato_documentos ADD COLUMN IF NOT EXISTS tipo_documento text;   -- identidade | comprovante_endereco | certidao_estado_civil | contrato_social | cartao_cnpj | matricula_fiador | renda | outro
ALTER TABLE adm_contrato_documentos ADD COLUMN IF NOT EXISTS dados_extraidos jsonb; -- o que a leitura automática encontrou
ALTER TABLE adm_contrato_documentos DROP CONSTRAINT IF EXISTS adm_contrato_documentos_categoria_check;
ALTER TABLE adm_contrato_documentos ADD CONSTRAINT adm_contrato_documentos_categoria_check
  CHECK (categoria IN ('apolice','contrato_locacao','contrato_administracao','vistoria_entrada','vistoria_saida',
                       'termo_entrega_chaves','notificacao','documentos_partes','outros'));
CREATE INDEX IF NOT EXISTS adm_contrato_documentos_parte ON adm_contrato_documentos (parte_id) WHERE parte_id IS NOT NULL;

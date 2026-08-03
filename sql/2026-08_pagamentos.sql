-- Razão de pagamentos (auditoria) — cada pagamento submetido ao Banco Inter.
-- Cobre repasse via Pix e pagamento de boleto (IPTU/condomínio).
-- Rodar uma vez no SQL editor do Supabase.

create table if not exists public.adm_pagamentos (
  id            bigserial primary key,
  tipo          text not null check (tipo in ('pix_repasse','boleto')),

  -- referências (nem todas preenchidas, conforme o tipo)
  repasse_id        bigint,
  contrato_id       bigint,
  cobranca_id       bigint,
  competencia       date,
  conta_bancaria_id bigint,          -- destino do pix_repasse (adm_contas_bancarias)

  -- valores / destino (snapshot no momento do envio)
  valor           numeric not null,
  descricao       text,
  destinatario    jsonb,             -- snapshot dos dados bancários (nome, ispb, ag, conta...)
  linha_digitavel text,              -- boleto
  vencimento      date,              -- boleto

  -- idempotência e retorno do Inter
  idempotencia_id text,              -- x-id-idempotente enviado (uuid) — evita pagar em dobro
  inter_codigo    text,              -- codigoSolicitacao (pix) ou codigoTransacao (boleto)
  inter_status    text,              -- APROVACAO / EFETIVADO / EMPROCESSAMENTO ...
  inter_retorno   jsonb,             -- resposta bruta do Inter

  -- estado interno do fluxo
  status          text not null default 'submetido'
                  check (status in ('submetido','aguardando_aprovacao','efetivado','erro','cancelado')),
  erro            text,

  -- comprovante (bucket privado)
  comprovante_bucket text,
  comprovante_path   text,

  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_adm_pagamentos_repasse on public.adm_pagamentos (repasse_id);
create index if not exists idx_adm_pagamentos_contrato_comp on public.adm_pagamentos (contrato_id, competencia);
create index if not exists idx_adm_pagamentos_inter on public.adm_pagamentos (inter_codigo);

-- Só o backend (service_role) acessa. RLS ligado sem policies bloqueia acesso anônimo.
alter table public.adm_pagamentos enable row level security;

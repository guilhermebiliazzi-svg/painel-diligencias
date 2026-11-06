-- Guarda os dados de cada contrato de associação no cadastro do novato, para o botão
-- "Reenviar contrato" do painel (Treinamento) gerar o PDF de novo sem redigitar.
-- RODAR NO SQL EDITOR DO SUPABASE ANTES de publicar a versão do painel com o botão.
alter table public.onb_novatos add column if not exists contrato_dados jsonb;

-- Cadastro do IPTU de São Paulo — uma linha por unidade (apartamento, vaga, loja).
--
-- Fonte: GeoSampa, base aberta pelo Decreto 56.932/2016.
-- Arquivo: IPTU_2026.csv (dentro de IPTU_2026.zip), 3.920.972 linhas, 937 MB.
-- Separador ';', primeira linha é cabeçalho, 29 colunas. Publicação anual.
--
-- PARA QUE SERVE: dado um endereço, listar TODAS as unidades do prédio com o
-- número de contribuinte (SQL) de cada uma. O SQL é o que abre a notificação de
-- lançamento e a certidão de dados cadastrais — e é de lá que sai o CPF parcial
-- do contribuinte, que identifica o dono atual dentro da lista do DirectD.
--
-- O QUE ESTA BASE NÃO TEM: nome e documento do contribuinte. O arquivo de 2016
-- trazia `NOME DO CONTRIBUINTE 1/2` e `CPF/CNPJ DO CONTRIBUINTE 1/2`; o de 2026
-- não traz — são 29 colunas e nenhuma é de pessoa. Quem retirou foi a
-- prefeitura, não a Base dos Dados.

-- ---------------------------------------------------------------- 1. staging
-- Tudo como texto, na ordem exata do arquivo. Converter na carga costuma
-- quebrar por causa de decimal e de campo vazio; é mais seguro converter
-- depois, com o dado já dentro do banco.
drop table if exists public.iptu_bruto;
create table public.iptu_bruto (
  numero_contribuinte text, ano_exercicio text, numero_nl text,
  data_cadastramento text, numero_condominio text, codlog text,
  logradouro text, numero_imovel text, complemento text, bairro text,
  referencia text, cep text, esquinas_frentes text, fracao_ideal text,
  area_terreno text, area_construida text, area_ocupada text,
  vm2_terreno text, vm2_construcao text, ano_construcao text,
  pavimentos text, testada text, tipo_uso text, padrao text,
  tipo_terreno text, fator_obsolescencia text,
  ano_inicio text, mes_inicio text, fase text
);

-- Carga, no psql, apontando para o CSV descompactado:
--   \copy public.iptu_bruto from 'IPTU_2026.csv' with (format csv, header true, delimiter ';')

-- ---------------------------------------------------------------- 2. tabela final
drop table if exists public.iptu_cadastro;
create table public.iptu_cadastro (
  sql             text primary key,   -- 0140880419-0 (setor.quadra.lote-dv)
  condominio      text,               -- 06-1 — agrupa as unidades de UM prédio
  codlog          text,               -- 16279-5 — identifica o logradouro
  logradouro      text,
  numero          integer,
  complemento     text,               -- "AP 11 VG", "APTO 72 - VG", "GARAGE"
  bairro          text,
  referencia      text,               -- "ED. RIO NEGRO"
  cep             text,
  fracao_ideal    numeric,
  area_terreno    integer,
  area_construida integer,
  venal           numeric,            -- terreno x fração + construção
  ano_construcao  integer,
  tipo_uso        text,
  padrao          text,
  -- Início da vida DESTE cadastro. Costuma ser a venda, mas num prédio
  -- recadastrado é a data do recadastramento: na Cap. Pinto Ferreira 65 todas
  -- as 30 unidades marcam 1992. Serve como pista, nunca como prova.
  ano_inicio      integer,
  mes_inicio      integer
);

insert into public.iptu_cadastro
select
  numero_contribuinte,
  nullif(numero_condominio, ''),
  nullif(codlog, ''),
  nullif(logradouro, ''),
  nullif(numero_imovel, '')::integer,
  nullif(complemento, ''),
  nullif(bairro, ''),
  nullif(referencia, ''),
  nullif(cep, ''),
  nullif(fracao_ideal, '')::numeric,
  nullif(area_terreno, '')::integer,
  nullif(area_construida, '')::integer,
  round(coalesce(nullif(vm2_terreno,'')::numeric, 0)
        * coalesce(nullif(area_terreno,'')::numeric, 0)
        * coalesce(nullif(fracao_ideal,'')::numeric, 0)
      + coalesce(nullif(vm2_construcao,'')::numeric, 0)
        * coalesce(nullif(area_construida,'')::numeric, 0)),
  nullif(ano_construcao, '')::integer,
  nullif(tipo_uso, ''),
  nullif(padrao, ''),
  nullif(ano_inicio, '')::integer,
  nullif(mes_inicio, '')::integer
from public.iptu_bruto
on conflict (sql) do nothing;

drop table public.iptu_bruto;

-- ---------------------------------------------------------------- 3. índices
-- Busca por endereço: é assim que a tela consulta.
create index iptu_cadastro_codlog_numero on public.iptu_cadastro (codlog, numero);
create index iptu_cadastro_cep_numero    on public.iptu_cadastro (cep, numero);
-- Agrupar o prédio inteiro a partir de uma unidade já conhecida.
create index iptu_cadastro_condominio    on public.iptu_cadastro (codlog, condominio);

-- ---------------------------------------------------------------- 4. conferência
-- O ED. RIO NEGRO deve voltar 30 unidades, todas na série 0419…0448, e NENHUMA
-- na série antiga 0115…0144 — cancelada quando o apartamento passou a ser
-- lançado junto com a vaga:
--
--   select sql, complemento, fracao_ideal, area_construida, venal
--   from public.iptu_cadastro
--   where codlog = '16279-5' and numero = 65 and condominio = '06-1'
--   order by sql;
--
-- É essa ausência que separa cancelado de vigente: a base do exercício só
-- carrega os vigentes. O CIT, ao contrário, lista os dois lado a lado e não
-- avisa qual é qual — quem pegar o primeiro "APTO 11" da lista do CIT pega o
-- cancelado e vai buscar uma notificação que não existe.

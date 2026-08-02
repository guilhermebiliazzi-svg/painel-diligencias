-- =====================================================================
-- Painel interno — identidade e permissões (Supabase Auth)
-- Rode no SQL editor do Supabase (role admin/owner).
--
-- Modelo: a tabela painel.perfis é o "allowlist" por e-mail. Só quem tem
-- perfil ativo entra. As permissões são por tela. O login é feito pelo
-- Supabase Auth (Google); esta tabela guarda quem pode o quê.
-- =====================================================================

create table if not exists painel.perfis (
  email            text primary key,
  nome             text,
  is_admin         boolean     not null default false,
  ativo            boolean     not null default true,
  pode_diligencias boolean     not null default false,
  pode_cobrancas   boolean     not null default false,
  pode_repasse     boolean     not null default false,
  pode_notas       boolean     not null default false,
  user_id          uuid        references auth.users(id) on delete set null,
  convidado_em     timestamptz not null default now(),
  ultimo_acesso    timestamptz
);

-- E-mail sempre em minúsculo (chave de comparação).
create or replace function painel.perfis_norm_email()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists trg_perfis_norm on painel.perfis;
create trigger trg_perfis_norm before insert or update on painel.perfis
  for each row execute function painel.perfis_norm_email();

-- Quando a pessoa faz o 1º login (Google), vincula o user_id ao perfil.
create or replace function painel.vincular_perfil_no_signup()
returns trigger language plpgsql security definer set search_path = painel, public as $$
begin
  update painel.perfis
     set user_id = new.id
   where email = lower(new.email);
  return new;
end $$;
drop trigger if exists trg_vincular_perfil on auth.users;
create trigger trg_vincular_perfil after insert on auth.users
  for each row execute function painel.vincular_perfil_no_signup();

-- Helper SECURITY DEFINER: evita recursão de RLS ao checar admin.
create or replace function painel.eh_admin()
returns boolean language sql stable security definer set search_path = painel as $$
  select exists (
    select 1 from painel.perfis p
     where p.email = lower(auth.jwt() ->> 'email')
       and p.is_admin and p.ativo
  );
$$;

-- RLS
alter table painel.perfis enable row level security;

drop policy if exists perfis_admin_all on painel.perfis;
create policy perfis_admin_all on painel.perfis
  for all using (painel.eh_admin()) with check (painel.eh_admin());

drop policy if exists perfis_self_read on painel.perfis;
create policy perfis_self_read on painel.perfis
  for select using (email = lower(auth.jwt() ->> 'email'));

-- Grants (o service_role do servidor ignora RLS; authenticated lê sob RLS).
grant usage on schema painel to authenticated, anon, service_role;
grant select on painel.perfis to authenticated;
grant all on painel.perfis to service_role;

-- Admin inicial (você). Já entra com todos os acessos.
insert into painel.perfis
  (email, nome, is_admin, ativo, pode_diligencias, pode_cobrancas, pode_repasse, pode_notas)
values
  ('guilhermebiliazzi@gmail.com', 'Guilherme Biliazzi', true, true, true, true, true, true)
on conflict (email) do update
  set is_admin = true, ativo = true,
      pode_diligencias = true, pode_cobrancas = true,
      pode_repasse = true, pode_notas = true;

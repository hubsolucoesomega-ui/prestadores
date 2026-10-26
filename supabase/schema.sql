-- OmegaHub · tabelas de prestadores
-- Rodar no SQL Editor do Supabase DEPOIS de criar o projeto. Não rodar antes.

create type provider_type as enum ('PF', 'MEI', 'ME', 'PJ');
create type provider_status as enum ('pending', 'approved', 'rejected');

-- Administradores: o usuário precisa estar nesta tabela para acessar o painel ADM.
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
-- Ninguém lê ou altera esta tabela pelo site. Inclua administradores pelo SQL Editor.

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  provider_type provider_type not null,
  full_name text not null check (char_length(full_name) between 5 and 120),
  cpf text not null check (cpf ~ '^[0-9]{11}$'),
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  email text not null,
  phone text not null,
  city text not null,
  uf char(2) not null,
  service_area text not null,
  category text not null,
  professional_registry text,
  years_experience int not null check (years_experience between 0 and 60),
  description text check (description is null or char_length(description) <= 300),
  bank_name text not null,
  bank_agency text not null,
  bank_account text not null,
  account_type text not null check (account_type in ('corrente', 'poupanca')),
  documents jsonb not null default '[]'::jsonb,   -- só nomes e tipos; arquivos ficam no Storage privado
  terms_accepted boolean not null default false,
  status provider_status not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- MEI, ME e PJ precisam de CNPJ; PF não pode ter CNPJ obrigatório
  constraint cnpj_required_for_companies check (provider_type = 'PF' or cnpj is not null)
);

alter table public.providers enable row level security;

-- Visitante ou prestador envia cadastro. Sempre entra como pendente e com termos aceitos.
create policy "cadastro_publico_insert" on public.providers
  for insert to anon, authenticated
  with check (status = 'pending' and terms_accepted = true);

-- Administradores leem e decidem tudo.
create policy "admin_tudo" on public.providers
  for all to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- Vitrine pública: só aprovados e só dados que podem aparecer no site.
-- Sem CPF, CNPJ, e-mail, telefone, banco e documentos.
create view public.providers_public
with (security_invoker = false) as
  select id, provider_type, full_name, city, uf, service_area, category,
         professional_registry, years_experience, description
  from public.providers
  where status = 'approved';

grant select on public.providers_public to anon, authenticated;

-- Índices para o painel ADM
create index providers_status_created_idx on public.providers (status, created_at desc);

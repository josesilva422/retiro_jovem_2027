-- Rode este arquivo uma vez no Supabase: SQL Editor > New query > Run.

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  status text not null default 'pre-cadastro'
    check (status in ('pre-cadastro', 'confirmada', 'cancelada')),
  created_at timestamptz not null default now(),
  participants jsonb not null,
  cpfs text[] not null,
  payment jsonb not null,
  info jsonb
);

create index if not exists registrations_cpfs_idx on public.registrations using gin (cpfs);
create index if not exists registrations_created_idx on public.registrations (created_at);

-- Segurança: RLS ligada e NENHUMA policy = a chave pública (anon) não lê nem grava nada.
-- Só as funções do Netlify, com a chave de serviço (service_role), acessam os dados.
alter table public.registrations enable row level security;
revoke all on public.registrations from anon, authenticated;

-- Se a tabela já existia (versão anterior), rode também esta linha:
alter table public.registrations add column if not exists info jsonb;

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text,
  subscription_status text not null default 'inactive' check (subscription_status in ('active','inactive','trial','cancelled')),
  ayrshare_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  text text not null,
  author_name text not null,
  rating smallint not null check (rating between 1 and 5),
  is_published boolean not null default false,
  published_at timestamptz,
  processing_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running','completed','failed')),
  clients_processed integer not null default 0,
  reviews_published integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.automation_client_runs (
  id uuid primary key default gen_random_uuid(),
  automation_run_id uuid not null references public.automation_runs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete set null,
  status text not null check (status in ('running','completed','skipped','failed')),
  stage text,
  message text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (automation_run_id, user_id)
);

alter table public.reviews
  drop constraint if exists reviews_processing_run_id_fkey;
alter table public.reviews
  add constraint reviews_processing_run_id_fkey
  foreign key (processing_run_id) references public.automation_runs(id) on delete set null;

alter table public.reviews add column if not exists processing_run_id uuid;

create index if not exists reviews_user_created_idx on public.reviews(user_id, created_at);
create index if not exists reviews_unpublished_5star_idx on public.reviews(user_id, created_at) where rating = 5 and is_published = false;
create index if not exists reviews_processing_idx on public.reviews(processing_run_id) where processing_run_id is not null;
create index if not exists automation_client_runs_user_idx on public.automation_client_runs(user_id, started_at desc);
create index if not exists automation_client_runs_run_idx on public.automation_client_runs(automation_run_id);
create index if not exists automation_runs_started_idx on public.automation_runs(started_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at before update on public.reviews for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.users enable row level security;
alter table public.reviews enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_client_runs enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users for select to authenticated using (auth.uid() = id);
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists reviews_select_own on public.reviews;
create policy reviews_select_own on public.reviews for select to authenticated using (auth.uid() = user_id);
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete_own on public.reviews for delete to authenticated using (auth.uid() = user_id);

-- Automation tables are server-only. The service role bypasses RLS.
revoke all on public.automation_runs from anon, authenticated;
revoke all on public.automation_client_runs from anon, authenticated;

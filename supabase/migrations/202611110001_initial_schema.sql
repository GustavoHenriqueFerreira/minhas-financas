create extension if not exists pgcrypto;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('recurring', 'installment')),
  description text not null check (char_length(description) between 1 and 120),
  category text not null check (char_length(category) between 1 and 70),
  start_date date not null,
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  installment_count integer check (
    (kind = 'recurring' and installment_count is null) or
    (kind = 'installment' and installment_count between 2 and 120 and installment_count <= amount_cents)
  ),
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  description text not null check (char_length(description) between 1 and 120),
  type text not null check (type in ('income', 'expense')),
  category text not null check (char_length(category) between 1 and 70),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  source text not null check (source in ('historical', 'manual', 'import', 'recurrence', 'installment')),
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 1000),
  deleted_at timestamptz,
  client_key text,
  plan_id uuid,
  occurrence_index integer check (occurrence_index is null or occurrence_index >= 0),
  unique (id, user_id),
  constraint transactions_plan_owner_fk foreign key (plan_id, user_id)
    references public.plans(id, user_id) on delete restrict,
  constraint transactions_plan_occurrence_shape check (
    (plan_id is null and occurrence_index is null) or
    (plan_id is not null and occurrence_index is not null)
  )
);

create unique index transactions_user_client_key_unique
  on public.transactions(user_id, client_key) where client_key is not null;
create unique index transactions_user_plan_occurrence_unique
  on public.transactions(user_id, plan_id, occurrence_index) where plan_id is not null;
create index transactions_user_date_idx on public.transactions(user_id, date desc);
create index transactions_active_idx on public.transactions(user_id, date desc) where deleted_at is null;

create table public.transaction_versions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('edit', 'delete', 'restore')),
  previous_json jsonb not null,
  changed_at timestamptz not null default now(),
  constraint transaction_versions_transaction_owner_fk foreign key (transaction_id, user_id)
    references public.transactions(id, user_id) on delete cascade
);
create index transaction_versions_user_transaction_idx
  on public.transaction_versions(user_id, transaction_id, changed_at desc);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  category_key text not null check (char_length(category_key) between 1 and 70),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, category_key)
);
create index budgets_user_month_idx on public.budgets(user_id, month desc);

create table public.category_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 70),
  normalized_key text not null check (char_length(normalized_key) between 1 and 70),
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type, normalized_key),
  unique (user_id, name)
);
create index category_definitions_user_idx on public.category_definitions(user_id);

create table public.benefit_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 1 and 80),
  opening_balance_cents bigint not null check (opening_balance_cents between 0 and 100000000000),
  opening_date date not null,
  monthly_credit_cents bigint not null check (monthly_credit_cents between 1 and 100000000000),
  credit_day integer not null check (credit_day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code),
  unique (id, user_id)
);
create index benefit_wallets_user_idx on public.benefit_wallets(user_id);

create table public.benefit_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null,
  kind text not null check (kind in ('credit', 'expense', 'adjustment')),
  date date not null,
  description text not null check (char_length(description) between 1 and 120),
  category text check (category is null or char_length(category) between 1 and 70),
  amount_cents bigint not null check (
    amount_cents between -100000000000 and 100000000000 and
    amount_cents <> 0 and (kind = 'adjustment' or amount_cents > 0)
  ),
  credit_month date check (credit_month is null or extract(day from credit_month) = 1),
  notes text check (notes is null or char_length(notes) <= 1000),
  client_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint benefit_movements_wallet_owner_fk foreign key (wallet_id, user_id)
    references public.benefit_wallets(id, user_id) on delete cascade,
  constraint benefit_movement_shape check (
    (kind = 'credit' and credit_month is not null and category is null) or
    (kind = 'expense' and credit_month is null and category is not null) or
    (kind = 'adjustment' and credit_month is null and category is null)
  )
);
create index benefit_movements_user_date_idx on public.benefit_movements(user_id, date desc);
create unique index benefit_movements_user_client_key_unique
  on public.benefit_movements(user_id, client_key) where client_key is not null;
create unique index benefit_movements_credit_month_unique
  on public.benefit_movements(wallet_id, credit_month) where kind = 'credit' and deleted_at is null;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.capture_transaction_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare version_action text;
begin
  if old.deleted_at is null and new.deleted_at is not null then version_action := 'delete';
  elsif old.deleted_at is not null and new.deleted_at is null then version_action := 'restore';
  else version_action := 'edit';
  end if;
  insert into public.transaction_versions(transaction_id, user_id, action, previous_json)
  values (old.id, old.user_id, version_action, to_jsonb(old));
  return new;
end;
$$;

create trigger transactions_capture_version before update on public.transactions
for each row execute function public.capture_transaction_version();

do $$
declare table_name text;
begin
  foreach table_name in array array['plans','transactions','budgets','category_definitions','benefit_wallets','benefit_movements']
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

alter table public.transactions enable row level security;
alter table public.transaction_versions enable row level security;
alter table public.plans enable row level security;
alter table public.budgets enable row level security;
alter table public.category_definitions enable row level security;
alter table public.benefit_wallets enable row level security;
alter table public.benefit_movements enable row level security;

create policy transactions_select_own on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy transactions_insert_own on public.transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy transactions_update_own on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy transactions_delete_own on public.transactions for delete to authenticated using ((select auth.uid()) = user_id);

create policy transaction_versions_select_own on public.transaction_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy transaction_versions_insert_own on public.transaction_versions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy transaction_versions_update_own on public.transaction_versions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy transaction_versions_delete_own on public.transaction_versions for delete to authenticated using ((select auth.uid()) = user_id);

create policy plans_select_own on public.plans for select to authenticated using ((select auth.uid()) = user_id);
create policy plans_insert_own on public.plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy plans_update_own on public.plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy plans_delete_own on public.plans for delete to authenticated using ((select auth.uid()) = user_id);

create policy budgets_select_own on public.budgets for select to authenticated using ((select auth.uid()) = user_id);
create policy budgets_insert_own on public.budgets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy budgets_update_own on public.budgets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy budgets_delete_own on public.budgets for delete to authenticated using ((select auth.uid()) = user_id);

create policy category_definitions_select_own on public.category_definitions for select to authenticated using ((select auth.uid()) = user_id);
create policy category_definitions_insert_own on public.category_definitions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy category_definitions_update_own on public.category_definitions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy category_definitions_delete_own on public.category_definitions for delete to authenticated using ((select auth.uid()) = user_id);

create policy benefit_wallets_select_own on public.benefit_wallets for select to authenticated using ((select auth.uid()) = user_id);
create policy benefit_wallets_insert_own on public.benefit_wallets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy benefit_wallets_update_own on public.benefit_wallets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy benefit_wallets_delete_own on public.benefit_wallets for delete to authenticated using ((select auth.uid()) = user_id);

create policy benefit_movements_select_own on public.benefit_movements for select to authenticated using ((select auth.uid()) = user_id);
create policy benefit_movements_insert_own on public.benefit_movements for insert to authenticated with check ((select auth.uid()) = user_id);
create policy benefit_movements_update_own on public.benefit_movements for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy benefit_movements_delete_own on public.benefit_movements for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

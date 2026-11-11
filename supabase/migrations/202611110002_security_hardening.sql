create index if not exists plans_user_status_idx
  on public.plans(user_id, status);

create index if not exists benefit_movements_user_wallet_date_idx
  on public.benefit_movements(user_id, wallet_id, date desc);

create or replace function public.rename_category(
  p_source_name text,
  p_target_name text,
  p_target_key text,
  p_type text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_type not in ('income', 'expense')
    or char_length(p_source_name) not between 1 and 70
    or char_length(p_target_name) not between 1 and 70
    or char_length(p_target_key) not between 1 and 70 then
    raise exception 'invalid category';
  end if;

  insert into public.category_definitions(id, user_id, name, normalized_key, type)
  values (gen_random_uuid(), current_user_id, p_target_name, p_target_key, p_type)
  on conflict (user_id, type, normalized_key) do nothing;

  update public.transactions
    set category = p_target_name
    where user_id = current_user_id and category = p_source_name;
  update public.plans
    set category = p_target_name
    where user_id = current_user_id and category = p_source_name;
  update public.benefit_movements
    set category = p_target_name
    where user_id = current_user_id and category = p_source_name;

  delete from public.budgets as source_budget
    where source_budget.user_id = current_user_id
      and source_budget.category_key = p_source_name
      and exists (
        select 1 from public.budgets as target_budget
        where target_budget.user_id = current_user_id
          and target_budget.month = source_budget.month
          and target_budget.category_key = p_target_name
      );
  update public.budgets
    set category_key = p_target_name
    where user_id = current_user_id and category_key = p_source_name;

  delete from public.category_definitions
    where user_id = current_user_id and name = p_source_name;
end;
$$;

revoke all on function public.rename_category(text, text, text, text) from public, anon;
grant execute on function public.rename_category(text, text, text, text) to authenticated;

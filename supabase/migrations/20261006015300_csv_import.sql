begin;

alter table public.import_batches
  add column row_count integer check (row_count between 1 and 1000),
  add column payload_hash text;

create function public.import_csv_transactions(
  p_account uuid, p_request uuid, p_rows jsonb, p_allow_duplicates boolean default false
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  account_row public.accounts%rowtype;
  prior public.import_batches%rowtype;
  batch_id uuid;
  total integer;
  fingerprint text;
begin
  if owner_id is null then raise exception 'Sign in to import transactions.'; end if;
  if p_request is null or jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 1000
     or octet_length(p_rows::text) > 700000 then
    raise exception 'Invalid import request.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item->>'amount_cents', '') !~ '^[0-9]+$'
      or coalesce(item->>'row', '') !~ '^[0-9]+$') then
    raise exception 'Use whole integer cents and row numbers.';
  end if;
  total := jsonb_array_length(p_rows);
  fingerprint := encode(sha256(convert_to(p_rows::text, 'UTF8')), 'hex');

  -- Serialize imports for an account so duplicate checks and inserts share one transaction.
  select * into account_row from public.accounts
    where id = p_account and user_id = owner_id for update;
  if not found then raise exception 'Choose an account you own.'; end if;
  select * into prior from public.import_batches
    where user_id = owner_id and request_id = p_request;
  if found then
    if prior.account_id <> p_account or prior.payload_hash is distinct from fingerprint then
      raise exception 'This import request was already used for different rows.';
    end if;
    return prior.row_count;
  end if;
  if account_row.archived then raise exception 'Choose an active account.'; end if;

  perform id from public.categories where user_id = owner_id
    and id in (select (item->>'category_id')::uuid from jsonb_array_elements(p_rows) item)
    order by id for share;

  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(
      row integer, kind text, category_id uuid, amount_cents bigint,
      transaction_date text, description text
    ) left join public.categories c on c.id = r.category_id and c.user_id = owner_id
    where r.row is null or r.row not between 1 and 1000
      or r.kind is null or r.kind not in ('income', 'expense')
      or r.amount_cents is null or r.amount_cents not between 1 and 9000000000000
      or r.description is null or char_length(r.description) > 500
      or r.transaction_date is null or r.transaction_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or r.transaction_date::date < account_row.opening_date
      or c.id is null or c.archived or c.kind <> r.kind
  ) or (select count(distinct (item->>'row')::integer) from jsonb_array_elements(p_rows) item) <> total then
    raise exception 'Some rows are invalid or reference unavailable categories.';
  end if;

  -- A match is a warning, not a uniqueness rule: real transactions can be identical.
  if not coalesce(p_allow_duplicates, false) and (
    exists (
      select 1 from jsonb_to_recordset(p_rows) as r(
        kind text, amount_cents bigint, transaction_date date, description text
      ) join public.transactions t on t.user_id = owner_id and t.account_id = p_account
        and t.kind = r.kind and t.amount_cents = r.amount_cents
        and t.transaction_date = r.transaction_date and t.description = r.description
    ) or exists (
      select 1 from jsonb_to_recordset(p_rows) as r(
        kind text, amount_cents bigint, transaction_date date, description text
      ) group by r.kind, r.amount_cents, r.transaction_date, r.description having count(*) > 1
    )
  ) then raise exception 'Possible duplicates found. Review again before importing.'; end if;

  insert into public.import_batches(user_id, account_id, request_id, row_count, payload_hash)
    values(owner_id, p_account, p_request, total, fingerprint) returning id into batch_id;
  insert into public.transactions(user_id, account_id, category_id, kind, amount_cents,
    transaction_date, description, import_batch_id, import_row_number)
    select owner_id, p_account, r.category_id, r.kind, r.amount_cents,
      r.transaction_date, r.description, batch_id, r.row
    from jsonb_to_recordset(p_rows) as r(
      row integer, category_id uuid, kind text, amount_cents bigint,
      transaction_date date, description text
    );
  return total;
end;
$$;
revoke all on function public.import_csv_transactions(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_csv_transactions(uuid, uuid, jsonb, boolean) to authenticated;

commit;

begin;

-- Hold the ledger row lock so a concurrent manual edit cannot be overwritten after comparison.
create or replace function public.plaid_ledger_snapshot(p_transaction uuid)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select jsonb_build_object(
    'account_id', account_id, 'kind', kind, 'amount_cents', amount_cents,
    'transaction_date', transaction_date, 'description', description,
    'destination_account_id', destination_account_id
  )
  from public.transactions
  where id = p_transaction and user_id = auth.uid()
  for update;
$$;

commit;

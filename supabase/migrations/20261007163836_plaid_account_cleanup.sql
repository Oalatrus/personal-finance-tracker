begin;
alter table public.plaid_accounts drop constraint plaid_accounts_user_id_account_id_fkey;
alter table public.plaid_accounts add constraint plaid_accounts_user_id_account_id_fkey
foreign key(user_id,account_id) references public.accounts(user_id,id) on delete set null (account_id);
drop index public.plaid_records_transaction_idx;
create index plaid_records_transaction_idx on public.plaid_records(user_id,transaction_id) where transaction_id is not null;
commit;

begin;
create or replace function public.review_plaid_record(p_connection uuid,p_provider text,p_version integer,p_category uuid,p_ignore boolean default false,p_allow_duplicate boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.plaid_records%rowtype; a public.accounts%rowtype; k text; tx uuid;
begin
 -- Use the connection lock for both review and sync to avoid lock inversions.
 perform 1 from public.plaid_connections where id=p_connection and user_id=auth.uid() for update;
 if not found then raise exception 'Connection unavailable'; end if;
 select * into r from public.plaid_records where connection_id=p_connection and provider_id=p_provider and user_id=auth.uid() for update;
 if not found or r.version<>p_version then raise exception 'Review changed; reload'; end if;
 if not r.needs_review then return; end if;
 if p_ignore then
 update public.plaid_records set ignored=true,needs_review=false where connection_id=p_connection and provider_id=p_provider;
 return;
 end if;
 if r.removed then
 delete from public.transactions where id=r.transaction_id and user_id=auth.uid();
 update public.plaid_records set needs_review=false where connection_id=p_connection and provider_id=p_provider;
 return;
 end if;
 if r.pending or r.signed_cents=0 then raise exception 'Only posted nonzero transactions can be imported'; end if;
 select ac.* into a from public.accounts ac join public.plaid_accounts pa on pa.account_id=ac.id and pa.user_id=ac.user_id
 where pa.connection_id=p_connection and pa.bank_account_id=r.bank_account_id and ac.user_id=auth.uid() for update of ac;
 if not found or a.archived or r.transaction_date<a.opening_date then raise exception 'Choose an active account with an earlier opening date'; end if;
 k:=case when r.signed_cents<0 then 'income' else 'expense' end;
 perform 1 from public.categories where id=p_category and user_id=auth.uid() and kind=k and not archived for share;
 if not found then raise exception 'Choose a matching active category'; end if;
 if r.transaction_id is not null and exists(select 1 from public.transactions where id=r.transaction_id and (user_id<>auth.uid() or account_id<>a.id)) then raise exception 'Account mapping changed'; end if;
 if not p_allow_duplicate and exists(select 1 from public.transactions where user_id=auth.uid() and account_id=a.id and transaction_date=r.transaction_date and kind=k and amount_cents=abs(r.signed_cents) and id is distinct from r.transaction_id) then raise exception 'Possible duplicate'; end if;
 if r.transaction_id is null then
 insert into public.transactions(user_id,account_id,category_id,kind,amount_cents,transaction_date,description)
 values(auth.uid(),a.id,p_category,k,abs(r.signed_cents),r.transaction_date,r.description) returning id into tx;
 else
 update public.transactions set category_id=p_category,kind=k,amount_cents=abs(r.signed_cents),transaction_date=r.transaction_date,description=r.description,destination_account_id=null
 where id=r.transaction_id and user_id=auth.uid() returning id into tx;
 end if;
 update public.plaid_records set transaction_id=tx,needs_review=false,ignored=false where connection_id=p_connection and provider_id=p_provider;
end $$;

create function public.map_plaid_account(p_connection uuid,p_bank_account text,p_account uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.plaid_connections where id=p_connection and user_id=auth.uid() for update;
 if not found then raise exception 'Connection unavailable'; end if;
 perform 1 from public.accounts where id=p_account and user_id=auth.uid() and not archived for share;
 if not found then raise exception 'Choose an active tracker account'; end if;
 if exists(select 1 from public.plaid_records where user_id=auth.uid() and connection_id=p_connection and bank_account_id=p_bank_account and transaction_id is not null) then raise exception 'Mapping cannot change after import'; end if;
 update public.plaid_accounts set account_id=p_account where user_id=auth.uid() and connection_id=p_connection and bank_account_id=p_bank_account;
 if not found then raise exception 'Bank account unavailable'; end if;
end $$;
revoke execute on function public.map_plaid_account(uuid,text,uuid) from public,anon;
grant execute on function public.map_plaid_account(uuid,text,uuid) to authenticated;
commit;

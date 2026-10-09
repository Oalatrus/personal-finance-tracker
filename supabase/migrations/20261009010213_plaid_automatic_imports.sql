begin;
alter table public.plaid_connections add column auto_import boolean not null default true;
alter table public.plaid_connections add column classification_ready boolean not null default false;
alter table public.plaid_records add column auto_category_name text not null default 'Uncategorized' check(char_length(auto_category_name) between 1 and 80);
alter table public.plaid_records add column transfer_review boolean not null default true;
alter table public.plaid_records add column ledger_snapshot jsonb;

create function public.plaid_ledger_snapshot(p_transaction uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('account_id',account_id,'kind',kind,'amount_cents',amount_cents,'transaction_date',transaction_date,'description',description,'destination_account_id',destination_account_id)
 from public.transactions where id=p_transaction and user_id=auth.uid();
$$;
-- Only unchanged existing imports receive a baseline; edited records still need review.
update public.plaid_records r set ledger_snapshot=jsonb_build_object('account_id',t.account_id,'kind',t.kind,'amount_cents',t.amount_cents,'transaction_date',t.transaction_date,'description',t.description,'destination_account_id',t.destination_account_id)
from public.transactions t where t.id=r.transaction_id and t.user_id=r.user_id and t.amount_cents=abs(r.signed_cents) and t.transaction_date=r.transaction_date and t.description=r.description
and t.kind=case when r.signed_cents<0 then 'income' else 'expense' end and t.destination_account_id is null;

create function public.remember_plaid_review() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.transaction_id is not null and not new.needs_review and not new.ignored then
   new.ledger_snapshot:=public.plaid_ledger_snapshot(new.transaction_id);
 end if;
 return new;
end $$;
create trigger remember_plaid_review before update of transaction_id,needs_review on public.plaid_records for each row execute function public.remember_plaid_review();

create function public.import_ready_plaid_transactions(p_connection uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.plaid_records%rowtype; a public.accounts%rowtype; tx public.transactions%rowtype;
cat uuid; k text; category_name text; fresh integer:=0; changed integer:=0; deleted integer:=0; count_review integer; count_pending integer;
begin
 perform 1 from public.plaid_connections where id=p_connection and user_id=auth.uid() for update;
 if not found then raise exception 'Connection unavailable'; end if;
 for r in select * from public.plaid_records where connection_id=p_connection and user_id=auth.uid() and needs_review and not ignored and (not pending or removed) order by transaction_date,provider_id for update loop
   if r.transaction_id is null and r.ledger_snapshot is not null and not r.removed then continue; end if;
   if r.transaction_id is not null then
     -- Category-only edits are preserved; other manual edits prevent automatic changes.
     if r.ledger_snapshot is null or r.ledger_snapshot is distinct from public.plaid_ledger_snapshot(r.transaction_id) then continue; end if;
   end if;
   if r.removed then
     if r.transaction_id is not null then
       perform public.review_plaid_record(p_connection,r.provider_id,r.version,null);
       deleted:=deleted+1;
     end if;
     continue;
   end if;
   if r.pending or r.signed_cents=0 or r.transfer_review then continue; end if;
   select ac.* into a from public.accounts ac join public.plaid_accounts pa on pa.user_id=ac.user_id and pa.account_id=ac.id
   where pa.user_id=auth.uid() and pa.connection_id=p_connection and pa.bank_account_id=r.bank_account_id for update of ac;
   if not found or a.archived or r.transaction_date<a.opening_date then continue; end if;
   k:=case when r.signed_cents<0 then 'income' else 'expense' end;
   if exists(select 1 from public.transactions where user_id=auth.uid() and account_id=a.id and transaction_date=r.transaction_date and amount_cents=abs(r.signed_cents) and kind=k and id is distinct from r.transaction_id) then continue; end if;
   if r.transaction_id is not null then
     select * into tx from public.transactions where id=r.transaction_id and user_id=auth.uid() for update;
     if not found or tx.account_id<>a.id then continue; end if;
   end if;
   cat:=null;
   if r.transaction_id is not null and tx.kind=k then
     select id into cat from public.categories where id=tx.category_id and user_id=auth.uid() and kind=k and not archived for share;
   end if;
   if cat is null then
     category_name:=r.auto_category_name;
     select id into cat from public.categories where user_id=auth.uid() and kind=k and lower(btrim(categories.name))=lower(btrim(category_name)) and not archived for share;
     if cat is null and exists(select 1 from public.categories where user_id=auth.uid() and kind=k and lower(btrim(categories.name))=lower(btrim(category_name))) then
       -- An archived category stays archived; use a separate uncategorized fallback.
       category_name:='Uncategorized';
       select id into cat from public.categories where user_id=auth.uid() and kind=k and lower(btrim(categories.name))=lower(category_name) and not archived for share;
       if cat is null and exists(select 1 from public.categories where user_id=auth.uid() and kind=k and lower(btrim(categories.name))=lower(category_name)) then continue; end if;
     end if;
     if cat is null then
       insert into public.categories(user_id,name,kind) values(auth.uid(),category_name,k) on conflict do nothing returning id into cat;
       if cat is null then select id into cat from public.categories where user_id=auth.uid() and kind=k and lower(btrim(categories.name))=lower(btrim(category_name)) and not archived for share; end if;
     end if;
   end if;
   if cat is null then continue; end if;
   perform public.review_plaid_record(p_connection,r.provider_id,r.version,cat);
   if r.transaction_id is null then fresh:=fresh+1; else changed:=changed+1; end if;
 end loop;
 select count(*) into count_review from public.plaid_records where user_id=auth.uid() and connection_id=p_connection and needs_review and (not pending or removed);
 select count(*) into count_pending from public.plaid_records where user_id=auth.uid() and connection_id=p_connection and pending and not removed;
 return jsonb_build_object('imported',fresh,'updated',changed,'removed',deleted,'review',count_review,'pending',count_pending);
end $$;

create function public.sync_plaid_transactions(p_connection uuid,p_previous text,p_cursor text,p_rows jsonb,p_removed jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; automatic boolean; count_review integer; count_pending integer;
begin
 select auto_import into automatic from public.plaid_connections where id=p_connection and user_id=auth.uid() for update;
 if not found then raise exception 'Connection unavailable'; end if;
 perform public.stage_plaid_sync(p_connection,p_previous,p_cursor,p_rows,p_removed);
 for r in select value from jsonb_array_elements(p_rows) loop
   update public.plaid_records set auto_category_name=coalesce(r->>'auto_category_name','Uncategorized'),transfer_review=coalesce((r->>'transfer_review')::boolean,true)
   where user_id=auth.uid() and connection_id=p_connection and provider_id=r->>'provider_id';
 end loop;
 update public.plaid_connections set classification_ready=true where id=p_connection and user_id=auth.uid();
 if automatic then return public.import_ready_plaid_transactions(p_connection); end if;
 select count(*) into count_review from public.plaid_records where user_id=auth.uid() and connection_id=p_connection and needs_review and (not pending or removed);
 select count(*) into count_pending from public.plaid_records where user_id=auth.uid() and connection_id=p_connection and pending and not removed;
 return jsonb_build_object('imported',0,'updated',0,'removed',0,'review',count_review,'pending',count_pending);
end $$;
revoke execute on function public.plaid_ledger_snapshot(uuid) from public,anon;
grant execute on function public.plaid_ledger_snapshot(uuid) to authenticated;
revoke execute on function public.remember_plaid_review() from public,anon,authenticated;
revoke execute on function public.import_ready_plaid_transactions(uuid) from public,anon;
grant execute on function public.import_ready_plaid_transactions(uuid) to authenticated;
revoke execute on function public.sync_plaid_transactions(uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.sync_plaid_transactions(uuid,text,text,jsonb,jsonb) to authenticated;
commit;

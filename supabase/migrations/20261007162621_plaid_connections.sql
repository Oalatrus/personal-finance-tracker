begin;
create table public.plaid_connections (
 id uuid primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 item_id text not null,
 encrypted_token text,
 environment text not null check (environment in ('sandbox','production')),
 institution text not null default 'Connected bank',
 cursor text,
 disconnected boolean not null default false,
 last_synced_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,id), unique(user_id,item_id)
);
create table public.plaid_accounts (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 connection_id uuid not null,
 bank_account_id text not null,
 name text not null,
 mask text,
 account_id uuid,
 primary key(connection_id,bank_account_id),
 unique(user_id,connection_id,bank_account_id),
 foreign key(user_id,connection_id) references public.plaid_connections(user_id,id) on delete cascade,
 foreign key(user_id,account_id) references public.accounts(user_id,id)
);
create index plaid_accounts_owner_account_idx on public.plaid_accounts(user_id,account_id);
alter table public.transactions add constraint transactions_user_id_id_key unique(user_id,id);
create table public.plaid_records (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 connection_id uuid not null,
 provider_id text not null,
 bank_account_id text not null,
 signed_cents bigint not null check (signed_cents between -9000000000000 and 9000000000000),
 transaction_date date not null,
 description text not null check (char_length(description)<=500),
 pending boolean not null,
 removed boolean not null default false,
 ignored boolean not null default false,
 needs_review boolean not null default true,
 version integer not null default 1,
 transaction_id uuid,
 primary key(connection_id,provider_id),
 foreign key(user_id,transaction_id) references public.transactions(user_id,id) on delete set null (transaction_id),
 foreign key(user_id,connection_id,bank_account_id) references public.plaid_accounts(user_id,connection_id,bank_account_id)
);
create index plaid_records_review_idx on public.plaid_records(user_id,needs_review,transaction_date desc);
create index plaid_records_account_idx on public.plaid_records(user_id,connection_id,bank_account_id);
create index plaid_records_transaction_idx on public.plaid_records(transaction_id) where transaction_id is not null;
do $$ declare t text; begin
 foreach t in array array['plaid_connections','plaid_accounts','plaid_records'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
 end loop;
end $$;

-- Stage all pages and advance the cursor together; concurrent syncs must start from the same cursor.
create function public.stage_plaid_sync(p_connection uuid,p_previous text,p_cursor text,p_rows jsonb,p_removed jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare c public.plaid_connections%rowtype; r jsonb; n integer:=0;
begin
 select * into c from public.plaid_connections where id=p_connection and user_id=auth.uid() for update;
 if not found or c.disconnected then raise exception 'Connection unavailable'; end if;
 if c.cursor is distinct from p_previous then raise exception 'Sync changed; retry'; end if;
 if jsonb_array_length(p_rows)>10000 or jsonb_array_length(p_removed)>10000 then raise exception 'Too many updates'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 insert into public.plaid_records(user_id,connection_id,provider_id,bank_account_id,signed_cents,transaction_date,description,pending)
 values(auth.uid(),p_connection,r->>'provider_id',r->>'bank_account_id',(r->>'signed_cents')::bigint,(r->>'transaction_date')::date,r->>'description',(r->>'pending')::boolean)
 on conflict(connection_id,provider_id) do update set
 bank_account_id=excluded.bank_account_id,signed_cents=excluded.signed_cents,transaction_date=excluded.transaction_date,
 description=excluded.description,pending=excluded.pending,removed=false,
 needs_review=not public.plaid_records.ignored,version=public.plaid_records.version+1;
 n:=n+1;
 end loop;
 for r in select value from jsonb_array_elements(p_removed) loop
 update public.plaid_records set removed=true,needs_review=(transaction_id is not null),version=version+1
 where connection_id=p_connection and user_id=auth.uid() and provider_id=r#>>'{}';
 end loop;
 update public.plaid_connections set cursor=p_cursor,last_synced_at=now() where id=p_connection;
 return n;
end $$;

create function public.review_plaid_record(p_connection uuid,p_provider text,p_version integer,p_category uuid,p_ignore boolean default false,p_allow_duplicate boolean default false)
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
 if not p_allow_duplicate and exists(select 1 from public.transactions where user_id=auth.uid() and account_id=a.id and transaction_date=r.transaction_date and kind=k and amount_cents=abs(r.signed_cents) and description=r.description and id is distinct from r.transaction_id) then raise exception 'Possible duplicate'; end if;
 if r.transaction_id is null then
 insert into public.transactions(user_id,account_id,category_id,kind,amount_cents,transaction_date,description)
 values(auth.uid(),a.id,p_category,k,abs(r.signed_cents),r.transaction_date,r.description) returning id into tx;
 else
 update public.transactions set category_id=p_category,kind=k,amount_cents=abs(r.signed_cents),transaction_date=r.transaction_date,description=r.description,destination_account_id=null
 where id=r.transaction_id and user_id=auth.uid() returning id into tx;
 end if;
 update public.plaid_records set transaction_id=tx,needs_review=false,ignored=false where connection_id=p_connection and provider_id=p_provider;
end $$;
revoke execute on function public.stage_plaid_sync(uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.stage_plaid_sync(uuid,text,text,jsonb,jsonb) to authenticated;
revoke execute on function public.review_plaid_record(uuid,text,integer,uuid,boolean,boolean) from public,anon;
grant execute on function public.review_plaid_record(uuid,text,integer,uuid,boolean,boolean) to authenticated;
commit;

begin;
alter table public.plaid_connections
  add column last_checked_at timestamptz,
  add column sync_started_at timestamptz,
  add column sync_lease uuid,
  add column sync_error text,
  add column webhook_url text;

create function public.claim_plaid_sync(p_connection uuid, p_automatic boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.plaid_connections%rowtype; lease uuid;
begin
  select * into c from public.plaid_connections
  where id=p_connection and (user_id=auth.uid() or current_user='service_role') for update;
  if not found or c.disconnected or c.encrypted_token is null then return null; end if;
  if c.sync_started_at > now()-interval '2 minutes' then return null; end if;
  if p_automatic and c.last_checked_at > now()-interval '5 minutes' then return null; end if;
  lease:=gen_random_uuid();
  update public.plaid_connections set sync_lease=lease,sync_started_at=now(),last_checked_at=now()
  where id=c.id and user_id=c.user_id;
  return lease;
end $$;

create function public.sync_plaid_background(p_connection uuid,p_previous text,p_cursor text,p_rows jsonb,p_removed jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid; previous_sub text; result jsonb;
begin
  if current_user<>'service_role' then raise exception 'Background sync is server-only'; end if;
  select user_id into owner from public.plaid_connections where id=p_connection and not disconnected;
  if not found then raise exception 'Connection unavailable'; end if;
  -- Reuse the owner-scoped importer; the verified webhook never supplies an owner ID.
  previous_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',owner::text,true);
  result:=public.sync_plaid_transactions(p_connection,p_previous,p_cursor,p_rows,p_removed);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  return result;
end $$;
revoke execute on function public.claim_plaid_sync(uuid,boolean) from public,anon;
grant execute on function public.claim_plaid_sync(uuid,boolean) to authenticated,service_role;
revoke execute on function public.sync_plaid_background(uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_plaid_background(uuid,text,text,jsonb,jsonb) to service_role;
commit;

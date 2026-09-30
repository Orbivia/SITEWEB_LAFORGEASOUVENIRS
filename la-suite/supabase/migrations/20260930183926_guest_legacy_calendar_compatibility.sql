create or replace function la_suite_internal.capsule_state(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.capsules; effective_plan text; capacity bigint; used bigint; start_at timestamptz; close_at timestamptz; end_at timestamptz; reveal_at timestamptz;
begin
 select * into c from public.capsules where id=p_id;
 if not found then return null; end if;
 effective_plan:=case when c.activation_source in ('legacy','free_beta') then 'premium' else c.plan end;
 capacity:=case effective_plan when 'photo' then 1000000000 when 'audio' then 2000000000 else 5000000000 end;
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0)
 into used from storage.objects o where o.bucket_id='capsule-media' and o.name like c.id::text||'/%';
 select used+coalesce(sum(m.reserved_bytes),0) into used from public.messages m
 where m.capsule_id=c.id and m.media_path is null and m.reservation_until>now()
 and not exists(select 1 from storage.objects o where o.bucket_id='capsule-media' and o.name=m.upload_path);
 start_at:=c.wedding_date::timestamp at time zone 'Europe/Paris';
 close_at:=(c.wedding_date::timestamp+interval '2 days') at time zone 'Europe/Paris';
 end_at:=(c.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris';
 reveal_at:=(c.wedding_date::timestamp+interval '30 months'+interval '1 day') at time zone 'Europe/Paris';
 if c.guest_rules_version=0 and c.status='active' then start_at:=c.created_at;close_at:=end_at;reveal_at:=end_at;end if;
 return jsonb_build_object('effective_plan',effective_plan,'quota_bytes',capacity,'used_bytes',used,
 'opens_at',start_at,'closes_at',close_at,'expires_at',end_at,'delivery_before',reveal_at,
 'legacy',c.guest_rules_version=0 and c.status='active',
 'state',case when c.status<>'active' then 'draft' when end_at is null then 'missing_date'
 when now()>=end_at then 'expired' when now()<start_at then 'scheduled'
 when now()>=close_at then 'closed' when used>=capacity then 'full' else 'open' end);
end $$;
revoke all on function la_suite_internal.capsule_state(uuid) from public,anon,authenticated;


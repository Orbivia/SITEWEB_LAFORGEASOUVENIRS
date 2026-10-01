-- All test accounts, capsules and allowance changes are rolled back.
begin;
update public.capsule_billing_settings set free_activation_enabled=true;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.rate_owner',gen_random_uuid()::text,true),set_config('test.capsule',gen_random_uuid()::text,true);
insert into auth.users(id,email_confirmed_at) values(current_setting('test.owner')::uuid,now()),(current_setting('test.rate_owner')::uuid,now());
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$ begin
 if not (public.owner_capsule_access()->>'can_create')::boolean then raise exception 'Empty account cannot create';end if;
end $$;
insert into public.capsules(id,owner_id,slug,couple_name,wedding_date) values(current_setting('test.capsule')::uuid,auth.uid(),'limits-'||current_setting('test.capsule'),'Limits test',current_date+30);
do $$ declare extra uuid:=gen_random_uuid(); begin
 if (public.owner_capsule_access()->>'can_create')::boolean then raise exception 'Second creation is exposed';end if;
 if public.owner_capsule_access()->>'existing_slug'<>'limits-'||current_setting('test.capsule') then raise exception 'Resume slug missing';end if;
 begin
  insert into public.capsules(id,owner_id,slug,couple_name,wedding_date) values(extra,auth.uid(),'limits-'||extra,'Second test',current_date+30);
  raise exception 'TEST: second free capsule allowed';
 exception when others then if SQLERRM not like 'Une seule capsule gratuite%' then raise;end if;end;
 begin
  perform * from la_suite_internal.capsule_account_guard;
  raise exception 'TEST: internal allowance exposed';
 exception when insufficient_privilege then null;end;
end $$;
update public.capsules set couple_name='Personalisation saved' where id=current_setting('test.capsule')::uuid;
select public.activate_capsule(current_setting('test.capsule')::uuid);
select public.activate_capsule(current_setting('test.capsule')::uuid);
-- A consumed free allowance cannot be regained by deleting the active capsule via REST.
delete from public.capsules where id=current_setting('test.capsule')::uuid;
do $$ declare extra uuid:=gen_random_uuid(); begin
 if (public.owner_capsule_access()->>'can_create')::boolean then raise exception 'Delete resets free allowance';end if;
 begin
  insert into public.capsules(id,owner_id,slug,couple_name,wedding_date) values(extra,auth.uid(),'limits-'||extra,'After deletion',current_date+30);
  raise exception 'TEST: consumed allowance bypassed';
 exception when others then if SQLERRM not like 'Une seule capsule gratuite%' then raise;end if;end;
end $$;
reset role;
-- Future paid flow permits multiple preparations once free activation is disabled.
update public.capsule_billing_settings set free_activation_enabled=false;
set local role authenticated;
do $$ declare extra uuid;begin
 for i in 1..2 loop
  extra:=gen_random_uuid();
  insert into public.capsules(id,owner_id,slug,couple_name,wedding_date) values(extra,auth.uid(),'paid-limits-'||extra,'Future paid preparation',current_date+30);
 end loop;
 if not (public.owner_capsule_access()->>'can_create')::boolean then raise exception 'Paid preparations blocked';end if;
end $$;
reset role;
update public.capsule_billing_settings set free_activation_enabled=true;
select set_config('request.jwt.claim.sub',current_setting('test.rate_owner'),true);
set local role authenticated;
do $$ declare extra uuid;begin
 -- Deleting an unactivated capsule permits restarting, but cannot bypass frequency limits.
 for i in 1..5 loop
  extra:=gen_random_uuid();
  insert into public.capsules(id,owner_id,slug,couple_name,wedding_date) values(extra,auth.uid(),'rate-'||extra,'Restart test',current_date+30);
  delete from public.capsules where id=extra;
 end loop;
 if (public.owner_capsule_access()->>'can_create')::boolean then raise exception 'Rate limit missing from access';end if;
 begin
  extra:=gen_random_uuid();
  insert into public.capsules(id,owner_id,slug,couple_name,wedding_date) values(extra,auth.uid(),'rate-'||extra,'Sixth test',current_date+30);
  raise exception 'TEST: rate limit bypassed';
 exception when others then if SQLERRM not like 'Trop de créations%' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS: one free capsule, private allowance, idempotent activation, deleted allowance preserved, future paid preparations and 24-hour rate limit' as result;

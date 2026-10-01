-- Integration regression test. Every fixture and change is rolled back.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.capsule',gen_random_uuid()::text,true),set_config('test.token',encode(gen_random_bytes(18),'hex'),true);
insert into auth.users(id,email_confirmed_at) values(current_setting('test.owner')::uuid,now()),(current_setting('test.other')::uuid,now());
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
insert into public.capsules(id,owner_id,slug,guest_token,couple_name,wedding_date) values(current_setting('test.capsule')::uuid,auth.uid(),'test-'||current_setting('test.capsule'),current_setting('test.token'),'Activation test',current_date+30);
do $$ begin
 if (select status from public.capsules where id=current_setting('test.capsule')::uuid)<>'draft' then raise exception 'New capsule is not draft'; end if;
 begin
  update public.capsules set status='active' where id=current_setting('test.capsule')::uuid;
  raise exception 'TEST: direct activation allowed';
 exception when others then
  if SQLERRM='TEST: direct activation allowed' then raise; end if;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 if exists(select * from public.get_capsule_public(current_setting('test.token'))) then raise exception 'Draft leaked'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.capsules where id=current_setting('test.capsule')::uuid) then raise exception 'Cross-account read'; end if;
 update public.capsules set couple_name='Unauthorized' where id=current_setting('test.capsule')::uuid;
 if found then raise exception 'Cross-account update'; end if;
 delete from public.capsules where id=current_setting('test.capsule')::uuid and status='draft';
 if found then raise exception 'Cross-account delete'; end if;
 begin
  perform public.activate_capsule(current_setting('test.capsule')::uuid);
  raise exception 'TEST: cross-account activation allowed';
 exception when others then
  if SQLERRM='TEST: cross-account activation allowed' then raise; end if;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
update public.capsule_billing_settings set free_activation_enabled=false;
set local role authenticated;
do $$ begin
 begin
  perform public.activate_capsule(current_setting('test.capsule')::uuid);
  raise exception 'TEST: billing switch bypassed';
 exception when others then
  if SQLERRM='TEST: billing switch bypassed' then raise; end if;
 end;
end $$;
reset role;
update public.capsule_billing_settings set free_activation_enabled=true;
update auth.users set email_confirmed_at=null where id=current_setting('test.owner')::uuid;
set local role authenticated;
do $$ begin
 begin
  perform public.activate_capsule(current_setting('test.capsule')::uuid);
  raise exception 'TEST: unconfirmed activation allowed';
 exception when others then
  if SQLERRM='TEST: unconfirmed activation allowed' then raise; end if;
 end;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('test.owner')::uuid;
set local role authenticated;
reset role;
-- Rolled-back metadata fixture for the now-validated greeting path.
insert into storage.objects(bucket_id,name,metadata) values('capsule-media',current_setting('test.capsule')||'/organizer/greeting.png','{"size":100,"mimetype":"image/png"}');
set local role authenticated;
update public.capsules set welcome_message='Bienvenue dans notre capsule',intro_path=current_setting('test.capsule')||'/organizer/greeting.png' where id=current_setting('test.capsule')::uuid;
update public.capsules set couple_name='Updated name',wedding_date=current_date+40,plan='audio' where id=current_setting('test.capsule')::uuid;
select public.activate_capsule(current_setting('test.capsule')::uuid);
select public.activate_capsule(current_setting('test.capsule')::uuid);
do $$ begin
 if not exists(select 1 from public.capsules where id=current_setting('test.capsule')::uuid and status='active' and activation_source='free_beta' and couple_name='Updated name' and plan='audio') then raise exception 'Activation failed'; end if;
end $$;
do $$ declare extra_id uuid:=gen_random_uuid(); begin
 begin
  insert into public.capsules(id,owner_id,slug,couple_name,wedding_date) values(extra_id,auth.uid(),'test-'||extra_id,'Extra capsule',current_date+30);
  raise exception 'TEST: second free capsule allowed';
 exception when others then
  if SQLERRM not like 'Une seule capsule gratuite%' then raise;end if;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 if not exists(select * from public.get_capsule_public(current_setting('test.token')) where welcome_message='Bienvenue dans notre capsule' and has_intro) then raise exception 'Active capsule inaccessible'; end if;
end $$;
reset role;
rollback;
select 'PASS: private drafts, RLS ownership, activation guards, confirmation, billing switch and idempotence' as result;

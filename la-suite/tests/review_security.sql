-- No real accounts, emails or payments: the transaction is rolled back.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.capsule',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.owner')::uuid,'review-fixture@example.invalid',now());
update public.capsule_billing_settings set free_activation_enabled=true;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
insert into public.capsules(id,owner_id,slug,couple_name,wedding_date) values(current_setting('test.capsule')::uuid,auth.uid(),'review-'||current_setting('test.capsule'),'Review fixture',(now() at time zone 'Europe/Paris')::date);
do $$ begin
 begin perform public.activate_capsule(current_setting('test.capsule')::uuid);raise exception 'TEST: today activation accepted';exception when others then if SQLERRM not like 'Choisissez une date d’événement à partir de demain%' then raise;end if;end;
 if not exists(select 1 from public.capsules where id=current_setting('test.capsule')::uuid and status='draft') then raise exception 'Failed activation changed status';end if;
 begin update public.capsules set couple_name=repeat('a',51) where id=current_setting('test.capsule')::uuid;raise exception 'TEST: long name accepted';exception when check_violation then null;end;
 begin update public.capsules set couple_name='   ' where id=current_setting('test.capsule')::uuid;raise exception 'TEST: blank name accepted';exception when check_violation then null;end;
 begin update public.capsules set welcome_message=repeat('a',2001) where id=current_setting('test.capsule')::uuid;raise exception 'TEST: long greeting accepted';exception when check_violation then null;end;
 begin update public.capsules set print_title=repeat('a',43) where id=current_setting('test.capsule')::uuid;raise exception 'TEST: long title accepted';exception when check_violation then null;end;
 begin update public.capsules set print_note=repeat('a',121) where id=current_setting('test.capsule')::uuid;raise exception 'TEST: long note accepted';exception when check_violation then null;end;
 begin update public.capsules set print_explanation=repeat('a',241) where id=current_setting('test.capsule')::uuid;raise exception 'TEST: long explanation accepted';exception when check_violation then null;end;
 begin update public.capsules set qr_initials='ABCDE' where id=current_setting('test.capsule')::uuid;raise exception 'TEST: long initials accepted';exception when check_violation then null;end;
 update public.capsules set wedding_date=(now() at time zone 'Europe/Paris')::date+1 where id=current_setting('test.capsule')::uuid;
 perform public.activate_capsule(current_setting('test.capsule')::uuid);
 perform public.activate_capsule(current_setting('test.capsule')::uuid);
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ declare owner uuid:=gen_random_uuid();c uuid:=gen_random_uuid();o jsonb;result jsonb;payload jsonb;job uuid;begin
 insert into auth.users(id,email,email_confirmed_at) values(owner,'review-paid@example.invalid',now());
 insert into public.capsules(id,owner_id,slug,couple_name,wedding_date,status,activation_source,plan) values(c,owner,'review-paid-'||c,'Payment review',current_date,'active','payment','photo');
 update la_suite_internal.offer_services set payments_enabled=true,notifications_enabled=true;
 o:=public.offer_backend('reserve',owner,jsonb_build_object('capsule_id',c,'plan','audio'));
 payload:=jsonb_build_object('id',o->>'id','session_id','cs_deleted_capsule','payment_intent','pi_deleted_capsule','currency','eur','amount_cents',500);
 delete from public.capsules where id=c;
 if not exists(select 1 from la_suite_internal.upgrade_orders where id=(o->>'id')::uuid and capsule_id is null) then raise exception 'Deletion lost pending payment';end if;
 result:=public.offer_backend('settle',null,payload);if result->>'state'<>'refund_required' then raise exception 'Deleted capsule payment not refunded';end if;
 perform public.offer_backend('refund',null,jsonb_build_object('id',o->>'id','refund_id','re_test'));
 result:=public.offer_backend('settle',null,payload);if result->>'state'<>'refunded' then raise exception 'Refund replay changed state';end if;
 c:=gen_random_uuid();
 insert into public.capsules(id,owner_id,slug,couple_name,wedding_date,status,activation_source,plan) values(c,owner,'review-owner-'||c,'Account review',current_date,'active','payment','photo');
 o:=public.offer_backend('reserve',owner,jsonb_build_object('capsule_id',c,'plan','audio'));
 delete from auth.users where id=owner;
 result:=public.offer_backend('settle',null,jsonb_build_object('id',o->>'id','session_id','cs_deleted_owner','payment_intent','pi_deleted_owner','currency','eur','amount_cents',500));
 if result->>'state'<>'refund_required' or result->>'owner_id' is not null then raise exception 'Deleted owner payment not refunded';end if;
 -- Stale reminder payloads are cancelled when the current calendar differs.
 c:=current_setting('test.capsule')::uuid;
 insert into la_suite_internal.notifications(capsule_id,kind,period,recipient,label,slug,expires_at) values(c,'expiry30',current_date,'review-fixture@example.invalid','Frozen','frozen',now()+interval '1 day') returning id into job;
 result:=public.offer_backend('notify_lease');
 if result is not null or (select state from la_suite_internal.notifications where id=job)<>'cancelled' then raise exception 'Stale calendar notification leased';end if;
end $$;
rollback;
select 'PASS: server text bounds, Paris activation date, idempotence, deleted capsule/account payment refunds and stale notification cancellation' as result;

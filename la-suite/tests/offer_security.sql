-- Every fixture and simulated activation is rolled back; no provider is called.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.capsule',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.owner')::uuid,'offer-test@example.invalid',now()),(current_setting('test.other')::uuid,'other-offer@example.invalid',now());
insert into public.capsules(id,owner_id,slug,couple_name,wedding_date,status,activation_source,plan) values(current_setting('test.capsule')::uuid,current_setting('test.owner')::uuid,'offer-test-'||current_setting('test.capsule'),'Offer test',(now() at time zone 'Europe/Paris')::date,'active','payment','photo');
insert into public.messages(capsule_id,guest_name,message_text,media_type,delivery_at) values(current_setting('test.capsule')::uuid,'Alice','Opened text','text',now()),(current_setting('test.capsule')::uuid,'Bob','Locked secret','text',now()+interval '1 day');
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$ declare b jsonb;denied boolean;begin
 b:=public.owner_export_bundle(current_setting('test.capsule')::uuid);
 if jsonb_array_length(b->'messages')<>1 or b::text like '%Locked secret%' then raise exception 'Export leaked unopened memory';end if;
 update public.capsules set suggested_delivery_months=24 where id=current_setting('test.capsule')::uuid;
 begin update public.capsules set notification_cursor='2000-01-01' where id=current_setting('test.capsule')::uuid;raise exception 'TEST: cursor writable';exception when others then if SQLERRM='TEST: cursor writable' then raise;end if;end;
 begin perform public.offer_backend('configure',auth.uid(),'{"payments_enabled":true}');raise exception 'TEST: service gateway public';exception when insufficient_privilege then null;end;
 begin update public.capsules set plan='premium' where id=current_setting('test.capsule')::uuid;raise exception 'TEST: plan writable';exception when others then if SQLERRM='TEST: plan writable' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
do $$ begin
 begin perform public.owner_export_bundle(current_setting('test.capsule')::uuid);raise exception 'TEST: cross-owner export';exception when others then if SQLERRM='TEST: cross-owner export' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ declare o jsonb;o2 jsonb;out jsonb;pid uuid;job jsonb;original date;begin
 if (select notifications_enabled or payments_enabled from la_suite_internal.offer_services) then raise exception 'Services enabled by default';end if;
 begin perform public.offer_backend('reserve',current_setting('test.owner')::uuid,jsonb_build_object('capsule_id',current_setting('test.capsule'),'plan','audio'));raise exception 'TEST: disabled checkout accepted';exception when others then if SQLERRM='TEST: disabled checkout accepted' then raise;end if;end;
 update la_suite_internal.offer_services set payments_enabled=true;
 o:=public.offer_backend('reserve',current_setting('test.owner')::uuid,jsonb_build_object('capsule_id',current_setting('test.capsule'),'plan','audio'));
 o2:=public.offer_backend('reserve',current_setting('test.owner')::uuid,jsonb_build_object('capsule_id',current_setting('test.capsule'),'plan','audio'));
 if o->>'id'<>o2->>'id' or (o->>'amount_cents')::integer<>500 then raise exception 'Reservation not idempotent or wrong price difference';end if;
 if (select plan from public.capsules where id=current_setting('test.capsule')::uuid)<>'photo' then raise exception 'Unpaid upgrade granted';end if;
 begin perform public.offer_backend('settle',null,jsonb_build_object('id',o->>'id','session_id','cs_test','amount_cents',1,'currency','eur','payment_intent','pi_test'));raise exception 'TEST: wrong amount accepted';exception when others then if SQLERRM='TEST: wrong amount accepted' then raise;end if;end;
 select wedding_date into original from public.capsules where id=current_setting('test.capsule')::uuid;
 out:=public.offer_backend('settle',null,jsonb_build_object('id',o->>'id','session_id','cs_test','amount_cents',500,'currency','eur','payment_intent','pi_test'));
 if out->>'state'<>'paid' or (select plan from public.capsules where id=current_setting('test.capsule')::uuid)<>'audio' or (select wedding_date from public.capsules where id=current_setting('test.capsule')::uuid)<>original then raise exception 'Paid upgrade or original calendar failed';end if;
 out:=public.offer_backend('settle',null,jsonb_build_object('id',o->>'id','session_id','cs_test','amount_cents',500,'currency','eur','payment_intent','pi_test'));
 if out->>'state'<>'paid' then raise exception 'Webhook replay failed';end if;
 o:=public.offer_backend('reserve',current_setting('test.owner')::uuid,jsonb_build_object('capsule_id',current_setting('test.capsule'),'plan','premium'));
 if (o->>'amount_cents')::integer<>1000 then raise exception 'Wrong Plus to Premium price';end if;
 update public.capsules set admin_suspended=true where id=current_setting('test.capsule')::uuid;
 out:=public.offer_backend('settle',null,jsonb_build_object('id',o->>'id','session_id','cs_second','amount_cents',1000,'currency','eur','payment_intent','pi_second'));
 if out->>'state'<>'refund_required' or (select plan from public.capsules where id=current_setting('test.capsule')::uuid)<>'audio' then raise exception 'Suspended paid checkout not refunded';end if;
 update public.capsules set admin_suspended=false,activation_source='free_beta' where id=current_setting('test.capsule')::uuid;
 out:=public.offer_backend('status',current_setting('test.owner')::uuid,jsonb_build_object('capsule_id',current_setting('test.capsule')));
 if jsonb_array_length(out->'upgrades')<>0 or public.guest_capsule_state(current_setting('test.capsule')::uuid)->>'effective_plan'<>'premium' then raise exception 'Free beta rights lost or upgrade sold';end if;
 -- Freeze queue payload and retry the same job; disable cancels leases.
 update la_suite_internal.offer_services set notifications_enabled=true;
 insert into la_suite_internal.notifications(capsule_id,kind,period,recipient,label,slug,opened_count,expires_at) values(current_setting('test.capsule')::uuid,'opened',current_date,'offer-test@example.invalid','Frozen name','frozen-slug',1,now()+interval '1 day') returning id into pid;
 job:=public.offer_backend('notify_lease',null,'{"sender":"La Suite <no-reply@example.invalid>"}');
 if job->>'id'<>pid::text or job->>'sender'<>'La Suite <no-reply@example.invalid>' then raise exception 'Notification lease failed';end if;
 perform public.offer_backend('notify_result',null,jsonb_build_object('id',pid,'lease',job->>'lease','provider_id',null));
 update la_suite_internal.notifications set next_at=now() where id=pid;
 job:=public.offer_backend('notify_lease',null,'{"sender":"Changed sender"}');if job->>'sender'<>'La Suite <no-reply@example.invalid>' then raise exception 'Retry payload changed';end if;
 perform public.offer_backend('notify_result',null,jsonb_build_object('id',pid,'lease',job->>'lease','provider_id',null));
 update public.capsules set notify_by_email=false where id=current_setting('test.capsule')::uuid;
 job:=public.offer_backend('notify_lease');
 if job is not null or (select state from la_suite_internal.notifications where id=pid)<>'cancelled' then raise exception 'Opt-out not honoured';end if;
 -- Old backup JSON predates the new columns: restore remains compatible.
 perform public.admin_backend('restore_metadata',jsonb_build_object('snapshot',jsonb_build_object('capsules',jsonb_build_array((select to_jsonb(c)-'notify_by_email'-'notification_cursor'-'suggested_delivery_months'-'suggested_delivery_date' from public.capsules c where id=current_setting('test.capsule')::uuid)),'messages','[]'::jsonb)));
end $$;
rollback;

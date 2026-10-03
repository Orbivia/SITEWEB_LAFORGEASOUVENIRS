begin;
do $$ declare owner uuid:=gen_random_uuid();c uuid:=gen_random_uuid();near_expiry uuid:=gen_random_uuid();mid uuid;job jsonb;begin
 insert into auth.users(id,email,email_confirmed_at) values(owner,'notifications-fixture@example.invalid',now());
 insert into public.capsules(id,owner_id,slug,couple_name,wedding_date,status,activation_source,notification_cursor) values(c,owner,'notifications-'||c,'Digest fixture',current_date,'active','payment',now()-interval '1 hour'),(near_expiry,owner,'expiry-'||near_expiry,'Expiry fixture',(current_date-interval '3 years'+interval '20 days')::date,'active','payment',now()-interval '1 hour');
 insert into public.messages(capsule_id,message_text,media_type,delivery_at) values(c,'Opened','text',now()) returning id into mid;
 if (select notification_ready_at from public.messages where id=mid)<=now() then raise exception 'Finalization used transaction time instead of wall clock';end if;
 -- Simulate a committed message before the next worker transaction.
 update public.messages set notification_ready_at=now() where id=mid;
 insert into public.messages(capsule_id,message_text,media_type,delivery_at) values(c,'Future secret','text',now()+interval '1 day');
 perform public.offer_backend('notify_enqueue');
 if exists(select 1 from la_suite_internal.notifications where capsule_id in(c,near_expiry)) then raise exception 'Disabled worker queued emails';end if;
 update la_suite_internal.offer_services set notifications_enabled=true;
 perform public.offer_backend('notify_enqueue');perform public.offer_backend('notify_enqueue');
 if not exists(select 1 from la_suite_internal.notifications where capsule_id=near_expiry and kind='expiry30') then raise exception '30-day reminder missing';end if;
 if (now() at time zone 'Europe/Paris')::time>='10:00' then
  if (select count(*) from la_suite_internal.notifications where capsule_id=c and kind='opened')<>1 or (select opened_count from la_suite_internal.notifications where capsule_id=c and kind='opened')<>1 then raise exception 'Daily digest duplicated or included locked memory';end if;
 end if;
 update public.capsules set wedding_date=(current_date-interval '3 years'+interval '5 days')::date where id=near_expiry;
 perform public.offer_backend('notify_enqueue');if not exists(select 1 from la_suite_internal.notifications where capsule_id=near_expiry and kind='expiry7') then raise exception '7-day reminder missing';end if;
 update la_suite_internal.offer_services set notifications_enabled=false;
 if public.offer_backend('notify_lease') is not null then raise exception 'Disabled worker leased email';end if;
end $$;
rollback;

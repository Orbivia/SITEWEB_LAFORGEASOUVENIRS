-- Match form limits on the server; updates and restores cannot bypass them.
alter table public.capsules add constraint capsule_text_limits check (
 couple_name is not null and char_length(btrim(couple_name)) between 1 and 50
 and coalesce(char_length(welcome_message),0)<=2000
 and coalesce(char_length(print_title),0)<=42
 and coalesce(char_length(print_note),0)<=120
 and coalesce(char_length(print_explanation),0)<=240
 and coalesce(char_length(qr_initials),0)<=4);
-- Preserve provider references needed to refund a payment completed after deletion.
-- No customer content or email is retained in these private order rows.
alter table la_suite_internal.upgrade_orders
 alter column capsule_id drop not null,alter column owner_id drop not null,
 drop constraint upgrade_orders_capsule_id_fkey,drop constraint upgrade_orders_owner_id_fkey,
 add constraint upgrade_orders_capsule_id_fkey foreign key(capsule_id) references public.capsules(id) on delete set null,
 add constraint upgrade_orders_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete set null;
create or replace function public.guard_capsule_activation()
returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if TG_OP='INSERT' then
   if new.status<>'draft' or new.activation_source is not null or new.activated_at is not null or new.guest_rules_version<>1 then raise exception 'Activation requires the activation service';end if;
  else
   if new.status is distinct from old.status or new.activation_source is distinct from old.activation_source or new.activated_at is distinct from old.activated_at or new.guest_rules_version is distinct from old.guest_rules_version then raise exception 'Activation requires the activation service';end if;
   if old.status='active' and (new.plan is distinct from old.plan or old.guest_rules_version=1 and new.wedding_date is distinct from old.wedding_date) then raise exception 'La formule et la date sont fixées après activation.';end if;
  end if;
 end if;
 if TG_OP='UPDATE' and old.status='draft' and new.status='active' then
  if new.wedding_date is null then raise exception 'Choisissez la date de l’événement.';end if;
  if new.wedding_date<=(now() at time zone 'Europe/Paris')::date then raise exception 'Choisissez une date d’événement à partir de demain avant d’activer votre capsule.';end if;
  new.guest_rules_version:=1;
 end if;
 return new;
end $$;

create or replace function public.offer_backend(p_action text,p_user uuid default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.capsules;svc la_suite_internal.offer_services;job la_suite_internal.notifications;ord la_suite_internal.upgrade_orders;s jsonb;options jsonb;price integer;target_price integer;day_key date;count_open integer;expiry timestamptz;recipient_email text;kind_name text;
begin
 select * into svc from la_suite_internal.offer_services where id;
 if p_action in ('services','configure') then
  if not exists(select 1 from la_suite_internal.admins where user_id=p_user) then raise exception 'Accès refusé.';end if;
  if p_action='configure' then
   update la_suite_internal.offer_services set notifications_enabled=coalesce((p_payload->>'notifications_enabled')::boolean,notifications_enabled),payments_enabled=coalesce((p_payload->>'payments_enabled')::boolean,payments_enabled) where id returning * into svc;
   insert into la_suite_internal.admin_events(actor,action) values(p_user,'configure_offer');
  end if;
  return to_jsonb(svc)||jsonb_build_object('failed_notifications',(select count(*) from la_suite_internal.notifications where state='failed'),'refunds_to_check',(select count(*) from la_suite_internal.upgrade_orders where state='refund_required'));
 elsif p_action in ('status','reserve') then
  select * into c from public.capsules where id=(p_payload->>'capsule_id')::uuid and owner_id=p_user for update;
  if not found then raise exception 'Capsule introuvable.';end if;
  s:=la_suite_internal.capsule_state(c.id);price:=case c.plan when 'photo' then 990 when 'audio' then 1490 else 2490 end;
  select coalesce(jsonb_agg(jsonb_build_object('plan',plan,'cents',cents-price) order by cents),'[]') into options from (values('audio',1490),('premium',2490))catalog(plan,cents)
  where cents>price and c.activation_source='payment' and c.status='active' and s->>'state' in ('open','full','scheduled');
  if p_action='status' then return jsonb_build_object('notifications_enabled',svc.notifications_enabled,'payments_enabled',svc.payments_enabled,'upgrades',options);end if;
  if not svc.payments_enabled or not exists(select 1 from jsonb_array_elements(options)o where o->>'plan'=p_payload->>'plan') then raise exception 'Cette formule n’est pas disponible pour cette capsule.';end if;
  update la_suite_internal.upgrade_orders set state='expired' where capsule_id=c.id and state in ('reserved','checkout') and (expires_at<=now() or state='reserved' and expires_at<now()+interval '30 minutes');
  select * into ord from la_suite_internal.upgrade_orders where capsule_id=c.id and state in ('reserved','checkout');
  if found then if ord.to_plan<>p_payload->>'plan' then raise exception 'Un paiement est déjà en cours. Terminez-le ou attendez son expiration.';end if;
  else
   target_price:=case p_payload->>'plan' when 'audio' then 1490 when 'premium' then 2490 end;
   insert into la_suite_internal.upgrade_orders(capsule_id,owner_id,from_plan,to_plan,amount_cents) values(c.id,p_user,c.plan,p_payload->>'plan',target_price-price) returning * into ord;
  end if;
  return to_jsonb(ord)||jsonb_build_object('slug',c.slug,'email',(select email from auth.users where id=p_user and email_confirmed_at is not null));
 elsif p_action='bind' then
  update la_suite_internal.upgrade_orders set session_id=p_payload->>'session_id',state='checkout' where id=(p_payload->>'id')::uuid and owner_id=p_user and state='reserved' and session_id is null;
  if not found and not exists(select 1 from la_suite_internal.upgrade_orders where id=(p_payload->>'id')::uuid and session_id=p_payload->>'session_id' and owner_id=p_user) then raise exception 'Paiement indisponible.';end if;return 'true';
 elsif p_action='settle' then
  -- Lock capsule first, as in reserve: no opposing row-lock order.
  select * into c from public.capsules where id=(select capsule_id from la_suite_internal.upgrade_orders where id=(p_payload->>'id')::uuid) for update;
  select * into ord from la_suite_internal.upgrade_orders where id=(p_payload->>'id')::uuid for update;
  if not found then raise exception 'Commande introuvable.';end if;
  if nullif(p_payload->>'session_id','') is null or (ord.session_id is not null and ord.session_id is distinct from p_payload->>'session_id') or ord.amount_cents is distinct from (p_payload->>'amount_cents')::integer or (p_payload->>'currency') is distinct from 'eur' or nullif(p_payload->>'payment_intent','') is null then raise exception 'Paiement non conforme à la commande.';end if;
  if ord.state in ('paid','refunded') then return to_jsonb(ord);end if;
  s:=la_suite_internal.capsule_state(c.id);
  if ord.state='refund_required' or c.id is null or ord.owner_id is null or c.owner_id is distinct from ord.owner_id or c.plan is distinct from ord.from_plan or c.activation_source is distinct from 'payment' or c.status is distinct from 'active' or coalesce(s->>'state','missing') not in ('open','full','scheduled') then
   update la_suite_internal.upgrade_orders set state='refund_required',session_id=p_payload->>'session_id',payment_intent=p_payload->>'payment_intent' where id=ord.id returning * into ord;
  else
   update public.capsules set plan=ord.to_plan,quota_override_bytes=case when quota_override_bytes is null then null else greatest(quota_override_bytes,case ord.to_plan when 'audio' then 2000000000 else 5000000000 end) end where id=c.id;
   update la_suite_internal.upgrade_orders set state='paid',session_id=p_payload->>'session_id',payment_intent=p_payload->>'payment_intent',paid_at=now() where id=ord.id returning * into ord;
  end if;return to_jsonb(ord);
 elsif p_action='refund' then
  update la_suite_internal.upgrade_orders set state='refunded',refund_id=p_payload->>'refund_id' where id=(p_payload->>'id')::uuid and state='refund_required';return 'true';
 elsif p_action='notify_enqueue' then
  if not svc.notifications_enabled then return 'false';end if;
  delete from la_suite_internal.notifications where state in ('sent','cancelled') and created_at<now()-interval '90 days';
  -- One digest daily after 10:00 Paris; old messages predate the activation cursor.
  day_key:=(now() at time zone 'Europe/Paris')::date;
  for c in select * from public.capsules where status='active' and notify_by_email and not admin_suspended for update skip locked loop
   expiry:=(c.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris';
   if expiry<=now() or expiry is null then continue;end if;
   select email into recipient_email from auth.users where id=c.owner_id and email_confirmed_at is not null;
   if recipient_email is null then continue;end if;
   if (now() at time zone 'Europe/Paris')::time>='10:00' then
    select count(*) into count_open from public.messages where capsule_id=c.id and delivery_at<=now() and notification_ready_at>c.notification_cursor and notification_ready_at<=now() and (media_type='text' or media_path is not null);
    if count_open>0 then
     insert into la_suite_internal.notifications(capsule_id,kind,period,recipient,label,slug,opened_count,expires_at) values(c.id,'opened',day_key,recipient_email,c.couple_name,c.slug,count_open,expiry) on conflict do nothing returning * into job;
     if found then update public.capsules set notification_cursor=now() where id=c.id;end if;
    end if;
   end if;
   kind_name:=case when expiry<=now()+interval '7 days' then 'expiry7' when expiry<=now()+interval '30 days' then 'expiry30' else null end;
   if kind_name is not null then insert into la_suite_internal.notifications(capsule_id,kind,period,recipient,label,slug,expires_at) values(c.id,kind_name,(expiry at time zone 'Europe/Paris')::date,recipient_email,c.couple_name,c.slug,expiry) on conflict do nothing;end if;
  end loop;return 'true';
 elsif p_action='notify_lease' then
  if not svc.notifications_enabled then return null;end if;
  update la_suite_internal.notifications n set state='cancelled' where state in ('pending','sending') and (expires_at<=now() or not exists(select 1 from public.capsules cap join auth.users u on u.id=cap.owner_id where cap.id=n.capsule_id and cap.notify_by_email and not cap.admin_suspended and cap.status='active' and u.email_confirmed_at is not null and u.email=n.recipient and n.expires_at=(cap.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris' and now()<(cap.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris'));
  update la_suite_internal.notifications set state='failed' where state in ('pending','sending') and (attempts>=6 or first_attempt_at<now()-interval '23 hours') and coalesce(lease_until,'-infinity')<now();
  select * into job from la_suite_internal.notifications where state in ('pending','sending') and next_at<=now() and coalesce(lease_until,'-infinity')<now() order by next_at for update skip locked limit 1;
  if not found then return null;end if;
  update la_suite_internal.notifications set state='sending',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),sender=coalesce(sender,p_payload->>'sender') where id=job.id returning * into job;return to_jsonb(job);
 elsif p_action='notify_result' then
  update la_suite_internal.notifications set state=case when nullif(p_payload->>'provider_id','') is not null then 'sent' else 'pending' end,provider_id=p_payload->>'provider_id',sent_at=case when nullif(p_payload->>'provider_id','') is not null then now() end,next_at=now()+least(interval '1 hour',interval '1 minute'*power(2,attempts)),lease=null,lease_until=null where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid;
  if not found then raise exception 'Opération reprise par un autre processus.';end if;return 'true';
 end if;
 raise exception 'Action invalide.';
end $$;
revoke all on function public.offer_backend(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.offer_backend(text,uuid,jsonb) to service_role;

-- Guest experience, atomic storage reservations and Paris calendar.
create schema if not exists la_suite_internal;
revoke all on schema la_suite_internal from public, anon, authenticated;
alter table public.capsules add column if not exists guest_rules_version integer not null default 0;
alter table public.capsules alter column guest_rules_version set default 1;
alter table public.messages
 add column if not exists request_id uuid,
 add column if not exists reserved_bytes bigint not null default 0,
 add column if not exists upload_path text,
 add column if not exists upload_mime text,
 add column if not exists reservation_until timestamptz;
create unique index if not exists messages_request_unique on public.messages(capsule_id,request_id) where request_id is not null;

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
 if c.guest_rules_version=0 then start_at:=c.created_at;close_at:=end_at;end if;
 return jsonb_build_object('effective_plan',effective_plan,'quota_bytes',capacity,'used_bytes',used,
 'opens_at',start_at,'closes_at',close_at,'expires_at',end_at,'delivery_before',reveal_at,
 'legacy',c.guest_rules_version=0,
 'state',case when c.status<>'active' then 'draft' when end_at is null then 'missing_date'
 when now()>=end_at then 'expired' when now()<start_at then 'scheduled'
 when now()>=close_at then 'closed' when used>=capacity then 'full' else 'open' end);
end $$;
revoke all on function la_suite_internal.capsule_state(uuid) from public,anon,authenticated;

create or replace function public.owner_capsule_usage(p_capsule_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select la_suite_internal.capsule_state(c.id) from public.capsules c where c.id=p_capsule_id and c.owner_id=(select auth.uid());
$$;
revoke all on function public.owner_capsule_usage(uuid) from public,anon;
grant execute on function public.owner_capsule_usage(uuid) to authenticated;

create or replace function public.guest_capsule_state(p_capsule_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select la_suite_internal.capsule_state(p_capsule_id);
$$;
revoke all on function public.guest_capsule_state(uuid) from public,anon,authenticated;
grant execute on function public.guest_capsule_state(uuid) to service_role;

create or replace function public.reserve_guest_memory(p_capsule_id uuid,p_request_id uuid,p_name text,p_text text,p_type text,p_mime text,p_bytes bigint,p_delivery timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.capsules; s jsonb; m public.messages; path text; limit_bytes bigint; suffix text;
begin
 select * into c from public.capsules where id=p_capsule_id and status='active' for update;
 if not found then raise exception 'Cette capsule est introuvable.';end if;
 select * into m from public.messages where capsule_id=c.id and request_id=p_request_id;
 if found then
  if m.media_type='text' or m.media_path is not null then return jsonb_build_object('ok',true,'complete',true,'message_id',m.id); end if;
  if m.reservation_until<=now() then raise exception 'Cet envoi a expiré. Réessayez avec un nouvel envoi.';end if;
  if m.reserved_bytes<>p_bytes or m.upload_mime<>p_mime then raise exception 'Le fichier a changé. Préparez un nouvel envoi.';end if;
  return jsonb_build_object('ok',true,'message_id',m.id,'path',m.upload_path,'media_type',m.media_type);
 end if;
 s:=la_suite_internal.capsule_state(c.id);
 if s->>'state' not in ('open','full') then raise exception 'Les dépôts sont fermés. Ils sont ouverts le jour de l’événement et le lendemain.';end if;
 if p_delivery is null or p_delivery>=(s->>'delivery_before')::timestamptz then raise exception 'Choisissez une date dans les 30 mois suivant l’événement.';end if;
 if p_type not in ('text','image','audio','video') then raise exception 'Format non pris en charge.';end if;
 if p_type='video' and s->>'effective_plan'<>'premium' or p_type='audio' and s->>'effective_plan'='photo' then raise exception 'Ce format ne fait pas partie de cette formule.';end if;
 limit_bytes:=case p_type when 'image' then 10000000 when 'audio' then 20000000 when 'video' then 50000000 else 0 end;
 if p_type<>'text' and (p_bytes<=0 or p_bytes>limit_bytes) then raise exception 'Ce fichier dépasse la taille autorisée.';end if;
 if p_type='text' and (length(trim(coalesce(p_text,'')))=0 or p_bytes<>0) then raise exception 'Écrivez votre petit mot.';end if;
 if p_type<>'text' and (s->>'used_bytes')::bigint+p_bytes>(s->>'quota_bytes')::bigint then raise exception 'La capsule est pleine pour ce fichier. Vous pouvez encore laisser un petit mot.';end if;
 if length(coalesce(p_text,''))>4000 or length(coalesce(p_name,''))>80 then raise exception 'Votre texte est trop long.';end if;
 suffix:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif'
 when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' when 'video/webm' then 'webm'
 when 'audio/mpeg' then 'mp3' when 'audio/wav' then 'wav' when 'audio/x-wav' then 'wav' when 'audio/webm' then 'webm' when 'audio/mp4' then 'm4a' when 'audio/ogg' then 'ogg' else null end;
 if p_type<>'text' and (suffix is null or split_part(p_mime,'/',1)<>case p_type when 'image' then 'image' else p_type end) then raise exception 'Format non pris en charge.';end if;
 m.id:=gen_random_uuid(); path:=case when p_type='text' then null else c.id::text||'/'||m.id::text||'/media.'||suffix end;
 insert into public.messages(id,capsule_id,request_id,guest_name,message_text,media_type,delivery_at,reserved_bytes,upload_path,upload_mime,reservation_until)
 values(m.id,c.id,p_request_id,coalesce(nullif(trim(p_name),''),'Un invité'),nullif(trim(p_text),''),p_type,greatest(p_delivery,now()),p_bytes,path,p_mime,case when p_type='text' then null else now()+interval '25 hours' end);
 return jsonb_build_object('ok',true,'message_id',m.id,'path',path,'media_type',p_type,'complete',p_type='text');
end $$;
revoke all on function public.reserve_guest_memory(uuid,uuid,text,text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_guest_memory(uuid,uuid,text,text,text,text,bigint,timestamptz) to service_role;

create or replace function public.finalize_guest_memory(p_capsule_id uuid,p_message_id uuid,p_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.messages; size_bytes bigint; actual_mime text; s jsonb;
begin
 perform 1 from public.capsules where id=p_capsule_id and status='active' for update;
 if not found then raise exception 'Cette capsule est introuvable.';end if;
 select * into m from public.messages where id=p_message_id and capsule_id=p_capsule_id for update;
 if not found or m.upload_path is distinct from p_path then raise exception 'Envoi invalide.';end if;
 if m.media_path=p_path then return jsonb_build_object('ok',true);end if;
 s:=la_suite_internal.capsule_state(p_capsule_id);
 if m.reservation_until<=now() or now()>=(s->>'expires_at')::timestamptz then raise exception 'Cet envoi a expiré.';end if;
 select case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else null end,split_part(metadata->>'mimetype',';',1)
 into size_bytes,actual_mime from storage.objects where bucket_id='capsule-media' and name=p_path;
 if size_bytes is null then raise exception 'Le fichier n’est pas encore reçu. Réessayez.';end if;
 if size_bytes<>m.reserved_bytes or actual_mime is distinct from m.upload_mime then raise exception 'Le fichier reçu ne correspond pas à l’envoi préparé.';end if;
 if (s->>'used_bytes')::bigint>(s->>'quota_bytes')::bigint then raise exception 'La capsule est pleine.';end if;
 update public.messages set media_path=p_path,reservation_until=null where id=m.id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.finalize_guest_memory(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_guest_memory(uuid,uuid,text) to service_role;

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
  new.guest_rules_version:=1;
 end if;
 return new;
end $$;

create or replace function public.owner_capsule_stats(p_capsule_id uuid)
returns table(message_count bigint) language sql stable security definer set search_path='' as $$
 select count(*) from public.messages m join public.capsules c on c.id=m.capsule_id
 where c.id=p_capsule_id and c.owner_id=(select auth.uid()) and (m.media_type='text' or m.media_path is not null);
$$;
create or replace function public.owner_message_manifest(p_capsule_id uuid)
returns table(id uuid,guest_name text,media_type text,delivery_at timestamptz,created_at timestamptz,is_available boolean)
language sql stable security definer set search_path='' as $$
 select m.id,m.guest_name,m.media_type,m.delivery_at,m.created_at,
 m.delivery_at<=now() and (c.guest_rules_version=0 or now()<(c.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris')
 from public.messages m join public.capsules c on c.id=m.capsule_id
 where c.id=p_capsule_id and c.owner_id=(select auth.uid()) and (m.media_type='text' or m.media_path is not null)
 order by m.delivery_at,m.created_at;
$$;
drop policy if exists owners_select_messages_after_delivery on public.messages;
create policy owners_select_messages_after_delivery on public.messages for select to authenticated using (
 delivery_at<=now() and (media_type='text' or media_path is not null) and exists(
 select 1 from public.capsules c where c.id=messages.capsule_id and c.owner_id=(select auth.uid())
 and (c.guest_rules_version=0 or now()<(c.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris')));
drop policy if exists owner_read_media_after_delivery on storage.objects;
create policy owner_read_media_after_delivery on storage.objects for select to authenticated using (
 bucket_id='capsule-media' and (
 exists(select 1 from public.capsules c where c.owner_id=(select auth.uid()) and storage.objects.name like c.id::text||'/organizer/%')
 or exists(select 1 from public.messages m join public.capsules c on c.id=m.capsule_id where c.owner_id=(select auth.uid())
 and m.delivery_at<=now() and m.media_path=storage.objects.name
 and (c.guest_rules_version=0 or now()<(c.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris'))));
-- Bucket-wide backstop; individual guest limits are verified again at finalization.
update storage.buckets set file_size_limit=50000000 where id='capsule-media';

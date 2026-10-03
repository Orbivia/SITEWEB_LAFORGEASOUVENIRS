-- Browser-scoped guest limits. No authenticated guest account is required.
alter table public.messages add column guest_id uuid;
create index messages_guest_usage on public.messages(capsule_id,guest_id) where guest_id is not null;
-- Retire the old server entry point: missing identity must never bypass quotas.
drop function public.reserve_guest_memory(uuid,uuid,text,text,text,text,bigint,timestamptz);
create or replace function public.reserve_guest_memory(p_capsule_id uuid,p_request_id uuid,p_name text,p_text text,p_type text,p_mime text,p_bytes bigint,p_delivery timestamptz,p_guest_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.capsules; s jsonb; m public.messages; path text; limit_bytes bigint; suffix text; guest_bytes bigint; guest_files bigint; guest_texts bigint;
begin
 if p_guest_id is null then raise exception 'Rechargez cette page avant de réessayer.';end if;
 select * into c from public.capsules where id=p_capsule_id and status='active' for update;
 if not found then raise exception 'Cette capsule est introuvable.';end if;
 select * into m from public.messages where capsule_id=c.id and request_id=p_request_id;
 if found then
  if m.guest_id is distinct from p_guest_id then raise exception 'Envoi invalide.';end if;
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
 select coalesce(sum(greatest(msg.reserved_bytes,coalesce((o.metadata->>'size')::bigint,0))) filter(where msg.media_type<>'text'),0),
 count(*) filter(where msg.media_type<>'text'),count(*) filter(where msg.media_type='text')
 into guest_bytes,guest_files,guest_texts from public.messages msg
 left join storage.objects o on o.bucket_id='capsule-media' and o.name=coalesce(msg.media_path,msg.upload_path,msg.video_path)
 where msg.capsule_id=c.id and msg.guest_id=p_guest_id
 and (msg.media_type='text' or msg.media_path is not null or msg.reservation_until>now() or o.id is not null);
 if p_type<>'text' and (guest_bytes+p_bytes>200000000 or guest_files>=20) then
  raise exception 'Vous avez atteint la limite de 200 Mo ou 20 fichiers pour cette capsule. Vous pouvez encore laisser un petit mot.';
 end if;
 if p_type='text' and guest_texts>=20 then raise exception 'Vous avez déjà envoyé 20 petits mots dans cette capsule.';end if;
 if length(coalesce(p_text,''))>4000 or length(coalesce(p_name,''))>80 then raise exception 'Votre texte est trop long.';end if;
 suffix:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif'
 when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' when 'video/webm' then 'webm'
 when 'audio/mpeg' then 'mp3' when 'audio/wav' then 'wav' when 'audio/x-wav' then 'wav' when 'audio/webm' then 'webm' when 'audio/mp4' then 'm4a' when 'audio/ogg' then 'ogg' else null end;
 if p_type<>'text' and (suffix is null or split_part(p_mime,'/',1)<>case p_type when 'image' then 'image' else p_type end) then raise exception 'Format non pris en charge.';end if;
 m.id:=gen_random_uuid(); path:=case when p_type='text' then null else c.id::text||'/'||m.id::text||'/media.'||suffix end;
 insert into public.messages(id,capsule_id,request_id,guest_name,message_text,media_type,delivery_at,reserved_bytes,upload_path,upload_mime,reservation_until,guest_id)
 values(m.id,c.id,p_request_id,coalesce(nullif(trim(p_name),''),'Un invité'),nullif(trim(p_text),''),p_type,greatest(p_delivery,now()),p_bytes,path,p_mime,case when p_type='text' then null else now()+interval '25 hours' end,p_guest_id);
 return jsonb_build_object('ok',true,'message_id',m.id,'path',path,'media_type',p_type,'complete',p_type='text');
end $$;
revoke all on function public.reserve_guest_memory(uuid,uuid,text,text,text,text,bigint,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.reserve_guest_memory(uuid,uuid,text,text,text,text,bigint,timestamptz,uuid) to service_role;


-- Only the worker may select and acknowledge deletion candidates.
create table la_suite_internal.media_cleanup_queue(path text primary key, marked_at timestamptz not null default now());
alter table la_suite_internal.media_cleanup_queue enable row level security;
revoke all on la_suite_internal.media_cleanup_queue from public,anon,authenticated;
create function la_suite_internal.block_reclaimed_intro() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.intro_path is not null and exists(select 1 from la_suite_internal.media_cleanup_queue where path=new.intro_path) then
  raise exception 'Ce fichier d’accueil a expiré. Choisissez un nouveau fichier.';
 end if;return new;
end $$;
revoke all on function la_suite_internal.block_reclaimed_intro() from public,anon,authenticated;
create trigger capsules_block_reclaimed_intro before insert or update of intro_path on public.capsules for each row execute function la_suite_internal.block_reclaimed_intro();

create function public.media_cleanup_backend(p_action text,p_paths jsonb default '[]') returns jsonb
language plpgsql security definer set search_path='' as $$
declare obj record; cap public.capsules; expired boolean; garbage jsonb;
begin
 if p_action='ack' then
  -- An API failure leaves the queue intact for a later retry.
  delete from la_suite_internal.media_cleanup_queue q where q.path in(select jsonb_array_elements_text(p_paths))
   and not exists(select 1 from storage.objects o where o.bucket_id='capsule-media' and o.name=q.path);
  delete from public.messages m where m.media_path is null and m.media_type<>'text' and m.reservation_until<now()
   and not exists(select 1 from storage.objects o where o.bucket_id='capsule-media' and o.name=m.upload_path);
  return jsonb_build_object('ok',true);
 elsif p_action<>'candidates' then raise exception 'Action invalide.';end if;
 -- Older than all upload tokens/reservations (25 h), with an additional 1 h grace.
 -- Pre-filtering excludes normal current files so bounded work can advance.
 for obj in select o.name from storage.objects o where o.bucket_id='capsule-media' and o.created_at<now()-interval '26 hours'
  and not exists(select 1 from la_suite_internal.media_cleanup_queue q where q.path=o.name)
  and not exists(select 1 from la_suite_internal.backups b where
   (b.expires_at>now() or b.lease_until>now()) and exists(select 1 from jsonb_array_elements(b.files) f where f->>'path'=o.name))
  and (not exists(select 1 from public.capsules c where c.id::text=split_part(o.name,'/',1))
   or exists(select 1 from public.capsules c where c.id::text=split_part(o.name,'/',1)
    and (c.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris'<=now())
   or (not exists(select 1 from public.capsules c where c.intro_path=o.name)
    and not exists(select 1 from public.messages m where m.media_path=o.name or m.video_path=o.name or (m.upload_path=o.name and m.reservation_until>now()))
    and not exists(select 1 from la_suite_internal.intro_uploads r where r.path=o.name and r.expires_at>now())))
  order by o.created_at,o.name limit 100
 loop
  select * into cap from public.capsules where id::text=split_part(obj.name,'/',1) for update;
  expired:=not found or ((cap.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris'<=now());
  -- Recheck after the same capsule lock used by reservation/finalization.
  if not exists(select 1 from la_suite_internal.backups b where (b.expires_at>now() or b.lease_until>now())
    and exists(select 1 from jsonb_array_elements(b.files) f where f->>'path'=obj.name))
   and (expired or (not exists(select 1 from public.capsules c where c.intro_path=obj.name)
    and not exists(select 1 from public.messages m where m.media_path=obj.name or m.video_path=obj.name or (m.upload_path=obj.name and m.reservation_until>now()))
    and not exists(select 1 from la_suite_internal.intro_uploads r where r.path=obj.name and r.expires_at>now()))) then
   insert into la_suite_internal.media_cleanup_queue(path) values(obj.name) on conflict do nothing;
  end if;
 end loop;
 select coalesce(jsonb_agg(path),'[]') into garbage from (select path from la_suite_internal.media_cleanup_queue order by marked_at,path limit 100) q;
 return jsonb_build_object('garbage',garbage);
end $$;
revoke all on function public.media_cleanup_backend(text,jsonb) from public,anon,authenticated;
grant execute on function public.media_cleanup_backend(text,jsonb) to service_role;

-- Private administration. No role can be claimed through editable user metadata.
alter table public.capsules add column admin_suspended boolean not null default false;
alter table public.capsules add column quota_override_bytes bigint check (quota_override_bytes between 100000000 and 50000000000);
create table la_suite_internal.admins(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
create table la_suite_internal.admin_invites(token_hash text primary key,expires_at timestamptz not null,claimed_at timestamptz);
create table la_suite_internal.backups(
 id uuid primary key default gen_random_uuid(),scope_id uuid,label text not null,state text not null default 'queued' check(state in ('queued','running','ready','failed','restoring','restored','importing')),
 snapshot jsonb,files jsonb not null default '[]',cursor integer not null default 0,lease uuid,lease_until timestamptz,manifest_path text,
 manifest_aad text,expires_at timestamptz,error text,automatic boolean not null default false,created_at timestamptz not null default now(),finished_at timestamptz,restore_cursor integer not null default 0
);
create index backup_queue on la_suite_internal.backups(state,created_at);
create table la_suite_internal.backup_assets(path text primary key,created_at timestamptz not null default now());
create table la_suite_internal.admin_events(id bigint generated always as identity primary key,actor uuid,action text not null,target uuid,created_at timestamptz not null default now());
alter table la_suite_internal.admins enable row level security;
alter table la_suite_internal.admin_invites enable row level security;
alter table la_suite_internal.backups enable row level security;
alter table la_suite_internal.backup_assets enable row level security;
alter table la_suite_internal.admin_events enable row level security;
revoke all on all tables in schema la_suite_internal from public,anon,authenticated;
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'la_suite_backup_key');
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'la_suite_worker_token');
insert into storage.buckets(id,name,public,file_size_limit) values('capsule-backups','capsule-backups',false,60000000) on conflict(id) do nothing;

create function public.admin_status() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from la_suite_internal.admins where user_id=(select auth.uid()));
$$;
revoke all on function public.admin_status() from public,anon;grant execute on function public.admin_status() to authenticated;
create function public.admin_claim(p_token text) returns boolean language plpgsql security definer set search_path='' as $$
declare matched text;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirmez votre adresse e-mail.';end if;
 if length(p_token)<>64 then raise exception 'Invitation invalide ou expirée.';end if;
 update la_suite_internal.admin_invites set claimed_at=now() where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and claimed_at is null and expires_at>now() returning token_hash into matched;
 if matched is null then raise exception 'Invitation invalide ou expirée.';end if;
 insert into la_suite_internal.admins(user_id) values(auth.uid()) on conflict do nothing;
 return true;
end $$;
revoke all on function public.admin_claim(text) from public,anon;grant execute on function public.admin_claim(text) to authenticated;

create function la_suite_internal.guard_admin_fields() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and ((TG_OP='INSERT' and (new.admin_suspended or new.quota_override_bytes is not null)) or (TG_OP='UPDATE' and (new.admin_suspended is distinct from old.admin_suspended or new.quota_override_bytes is distinct from old.quota_override_bytes))) then raise exception 'Réglage réservé à l’administration.';end if;
 return new;
end $$;
create trigger capsules_admin_fields before insert or update on public.capsules for each row execute function la_suite_internal.guard_admin_fields();

-- Service-only gateway: private schema and Vault never exposed to the browser.
create function public.admin_backend(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare bid uuid;cid uuid;job la_suite_internal.backups;out jsonb;snap jsonb;fl jsonb;rowdata jsonb;c public.capsules;m public.messages;
begin
 if p_action='runtime' then
  return jsonb_build_object('key',(select decrypted_secret from vault.decrypted_secrets where name='la_suite_backup_key'),'worker',(select decrypted_secret from vault.decrypted_secrets where name='la_suite_worker_token'));
 elsif p_action='member' then return to_jsonb(exists(select 1 from la_suite_internal.admins where user_id=(p_payload->>'user_id')::uuid));
 elsif p_action='overview' then
  return jsonb_build_object('clients',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'confirmed',u.email_confirmed_at is not null,'created_at',u.created_at) order by u.created_at desc),'[]') from auth.users u),
   'capsules',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'owner_id',c.owner_id,'name',c.couple_name,'date',c.wedding_date,'plan',c.plan,'activation',c.activation_source,'suspended',c.admin_suspended,'quota_override',c.quota_override_bytes,'created_at',c.created_at,'usage',la_suite_internal.capsule_state(c.id),'messages',(select count(*) from public.messages m where m.capsule_id=c.id and (m.media_type='text' or m.media_path is not null or m.video_path is not null))) order by c.created_at desc),'[]') from public.capsules c),
   'backups',(select coalesce(jsonb_agg(x),'[]') from (select id,label,state,cursor,jsonb_array_length(files) total,error,automatic,created_at,finished_at,restore_cursor from la_suite_internal.backups order by created_at desc limit 50)x));
 elsif p_action='manage' then
  cid:=(p_payload->>'id')::uuid;
  update public.capsules set admin_suspended=(p_payload->>'suspended')::boolean,quota_override_bytes=(p_payload->>'quota')::bigint where id=cid;
  if not found then raise exception 'Capsule introuvable.';end if;
  insert into la_suite_internal.admin_events(actor,action,target) values((p_payload->>'actor')::uuid,'manage',cid);return 'true';
 elsif p_action='queue' then
  cid:=(p_payload->>'id')::uuid;
  if exists(select 1 from la_suite_internal.backups where scope_id is not distinct from cid and state in ('queued','running','restoring')) then raise exception 'Une opération est déjà en cours.';end if;
  select jsonb_build_object('version',1,'created_at',now(),'capsules',coalesce(jsonb_agg(to_jsonb(c)),'[]'),'owners',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email)) from auth.users u where exists(select 1 from public.capsules c2 where c2.owner_id=u.id and (cid is null or c2.id=cid))),'[]'),'messages',coalesce((select jsonb_agg(to_jsonb(m)) from public.messages m join public.capsules mc on mc.id=m.capsule_id where (cid is null or mc.id=cid) and (m.media_type='text' or m.media_path is not null or m.video_path is not null) and (la_suite_internal.capsule_state(mc.id)->>'state')<>'expired'),'[]')) into snap from public.capsules c where (cid is null or c.id=cid) and (la_suite_internal.capsule_state(c.id)->>'state')<>'expired';
  if jsonb_array_length(snap->'capsules')=0 then raise exception 'Aucune capsule à sauvegarder.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('path',o.name,'key','assets/'||encode(extensions.digest(o.name||':'||o.updated_at::text||':'||coalesce(o.metadata->>'size','0'),'sha256'),'hex'),'size',coalesce((o.metadata->>'size')::bigint,0),'mime',coalesce(o.metadata->>'mimetype','application/octet-stream')) order by o.name),'[]') into fl from storage.objects o where o.bucket_id='capsule-media' and (exists(select 1 from jsonb_array_elements(snap->'capsules')x where x->>'intro_path'=o.name) or exists(select 1 from jsonb_array_elements(snap->'messages')x where coalesce(x->>'media_path',x->>'video_path')=o.name));
  -- A missing media object must never yield an apparently complete backup.
  if exists(select 1 from (select x->>'intro_path' path from jsonb_array_elements(snap->'capsules') x union select coalesce(x->>'media_path',x->>'video_path') from jsonb_array_elements(snap->'messages')x)refs where path is not null and not exists(select 1 from jsonb_array_elements(fl)f where f->>'path'=refs.path)) then raise exception 'Un fichier manque dans une capsule. Vérifiez les fichiers avant de sauvegarder.';end if;
  insert into la_suite_internal.backups(scope_id,label,snapshot,files,automatic,expires_at) values(cid,case when cid is null then 'Toutes les capsules' else (select couple_name from public.capsules where id=cid) end,snap,fl,coalesce((p_payload->>'automatic')::boolean,false),(select min((x->>'wedding_date')::date+interval '3 years') from jsonb_array_elements(snap->'capsules')x)) returning id into bid;
  return jsonb_build_object('id',bid);
 elsif p_action='lease' then
  select * into job from la_suite_internal.backups where state in ('queued','running','restoring') and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 1;
  if not found then return null;end if;
  update la_suite_internal.backups set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',state=case when state='queued' then 'running' else state end where id=job.id returning * into job;return to_jsonb(job);
 elsif p_action='progress' then
  update la_suite_internal.backups set cursor=coalesce((p_payload->>'cursor')::int,cursor),restore_cursor=coalesce((p_payload->>'restore_cursor')::int,restore_cursor),state=coalesce(p_payload->>'state',state),manifest_path=coalesce(p_payload->>'manifest',manifest_path),snapshot=case when p_payload->>'state'='ready' then null else snapshot end,finished_at=case when p_payload->>'state' in ('ready','restored','failed') then now() else finished_at end,error=p_payload->>'error',lease_until=null,lease=null where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid;
  if not found then raise exception 'Opération reprise par un autre processus.';end if;return 'true';
 elsif p_action='asset_exists' then return to_jsonb(exists(select 1 from storage.objects where bucket_id='capsule-backups' and name=p_payload->>'path'));
 elsif p_action='retry' then
  update la_suite_internal.backups set state=case when manifest_path is null then 'queued' else 'restoring' end,error=null,lease=null,lease_until=null where id=(p_payload->>'id')::uuid and state='failed';if not found then raise exception 'Opération indisponible.';end if;return 'true';
 elsif p_action='restore_check' then
  for rowdata in select value from jsonb_array_elements(p_payload->'snapshot'->'capsules') loop
   c:=jsonb_populate_record(null::public.capsules,rowdata);
   if not exists(select 1 from auth.users where id=c.owner_id) then raise exception 'Le compte organisateur manque. La restauration nécessite le compte d’origine.';end if;
   if c.wedding_date+interval '3 years'<=now() then raise exception 'La période de conservation est terminée.';end if;
  end loop;return 'true';
 elsif p_action='import' then
  perform public.admin_backend('restore_check',jsonb_build_object('snapshot',p_payload->'snapshot'));
  bid:=gen_random_uuid();
  select coalesce(jsonb_agg(value||jsonb_build_object('stored_key',bid::text||'/import/'||ordinality::text)),'[]') into fl from jsonb_array_elements(p_payload->'files') with ordinality;
  if exists(select 1 from jsonb_array_elements(fl)f where f->>'key' !~ '^assets/[a-f0-9]{64}$' or (f->>'size')::bigint>50000000 or (f->>'size')::bigint<0 or f->>'path' !~ '^[a-f0-9-]{36}/') then raise exception 'Format de sauvegarde invalide.';end if;
  insert into la_suite_internal.backups(id,label,state,files,manifest_path,manifest_aad,expires_at) values(bid,'Sauvegarde importée','importing',fl,bid::text||'/manifest',p_payload->>'aad',(select min((x->>'wedding_date')::date+interval '3 years') from jsonb_array_elements(p_payload->'snapshot'->'capsules')x));
  return jsonb_build_object('id',bid,'manifest_path',bid::text||'/manifest','files',fl);
 elsif p_action='import_get' then
  select * into job from la_suite_internal.backups where id=(p_payload->>'id')::uuid and state='importing';if not found then raise exception 'Import indisponible.';end if;return to_jsonb(job);
 elsif p_action='import_finish' then
  select * into job from la_suite_internal.backups where id=(p_payload->>'id')::uuid and state='importing' for update;
  if not found then raise exception 'Import indisponible.';end if;
  if exists(select 1 from jsonb_array_elements(job.files)f where not exists(select 1 from storage.objects o where o.bucket_id='capsule-backups' and o.name=f->>'stored_key' and (o.metadata->>'size')::bigint=(f->>'size')::bigint+28)) then raise exception 'Import incomplet : des fichiers manquent.';end if;
  update la_suite_internal.backups set state='restoring' where id=job.id;return 'true';
 elsif p_action='asset' then insert into la_suite_internal.backup_assets(path) values(p_payload->>'path') on conflict do nothing;return 'true';
 elsif p_action='get' then
  select * into job from la_suite_internal.backups where id=(p_payload->>'id')::uuid and state in ('ready','restoring','restored');if not found then raise exception 'Sauvegarde indisponible.';end if;return to_jsonb(job);
 elsif p_action='restore' then
  update la_suite_internal.backups set state='restoring',restore_cursor=0,lease=null,lease_until=null,error=null where id=(p_payload->>'id')::uuid and state in ('ready','restored');if not found then raise exception 'Sauvegarde indisponible.';end if;return 'true';
 elsif p_action='restore_metadata' then
  -- Add missing rows only. New memories and subsequent client edits are preserved.
  for rowdata in select value from jsonb_array_elements(p_payload->'snapshot'->'capsules') loop
   c:=jsonb_populate_record(null::public.capsules,rowdata);
   if not exists(select 1 from auth.users where id=c.owner_id) then raise exception 'Le compte organisateur manque. Restauration impossible.';end if;
   if (la_suite_internal.capsule_state(c.id)->>'state')='expired' or c.wedding_date+interval '3 years'<=now() then raise exception 'La période de conservation est terminée.';end if;
   insert into public.capsules select (c).* on conflict(id) do nothing;
  end loop;
  for rowdata in select value from jsonb_array_elements(p_payload->'snapshot'->'messages') loop
   m:=jsonb_populate_record(null::public.messages,rowdata);insert into public.messages select (m).* on conflict(id) do nothing;
  end loop;return 'true';
 elsif p_action='cleanup' then
  delete from la_suite_internal.backups where (created_at<now()-interval '7 days' or expires_at<now()) and (lease_until is null or lease_until<now());
  select jsonb_build_object('garbage',coalesce(jsonb_agg(o.name),'[]')) into out from storage.objects o where o.bucket_id='capsule-backups' and o.created_at<now()-interval '1 day' and not exists(select 1 from la_suite_internal.backups b where b.manifest_path=o.name or b.id::text||'/manifest'=o.name or exists(select 1 from jsonb_array_elements(b.files)f where f->>'key'=o.name));
  delete from la_suite_internal.admin_events where created_at<now()-interval '90 days';return out;
 end if;
 raise exception 'Action inconnue.';
end $$;
revoke all on function public.admin_backend(text,jsonb) from public,anon,authenticated;grant execute on function public.admin_backend(text,jsonb) to service_role;
CREATE OR REPLACE FUNCTION la_suite_internal.capsule_state(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.capsules; effective_plan text; capacity bigint; used bigint; start_at timestamptz; close_at timestamptz; end_at timestamptz; reveal_at timestamptz;
begin
 select * into c from public.capsules where id=p_id;
 if not found then return null; end if;
 effective_plan:=case when c.activation_source in ('legacy','free_beta') then 'premium' else c.plan end;
 capacity:=coalesce(c.quota_override_bytes,case effective_plan when 'photo' then 1000000000 when 'audio' then 2000000000 else 5000000000 end);
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
 when now()>=end_at then 'expired' when c.admin_suspended then 'suspended' when now()<start_at then 'scheduled'
 when now()>=close_at then 'closed' when used>=capacity then 'full' else 'open' end);
end $function$;

-- Only PostgreSQL can enqueue scheduled work; the worker token lives in Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create function la_suite_internal.run_backup_worker() returns bigint language sql security definer set search_path='' as $$
 select net.http_post(url:='https://yejzxsrmqudhvaikaitb.supabase.co/functions/v1/suite-admin',headers:=jsonb_build_object('Content-Type','application/json','x-suite-worker',(select decrypted_secret from vault.decrypted_secrets where name='la_suite_worker_token')),body:='{"action":"tick"}'::jsonb,timeout_milliseconds:=45000);
$$;
revoke all on function la_suite_internal.run_backup_worker() from public,anon,authenticated;
create function la_suite_internal.daily_backup() returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.capsules where (la_suite_internal.capsule_state(id)->>'state')<>'expired') and not exists(select 1 from la_suite_internal.backups where automatic and created_at>now()-interval '20 hours') then
  perform public.admin_backend('queue','{"automatic":true}'::jsonb);
 end if;
end $$;
revoke all on function la_suite_internal.daily_backup() from public,anon,authenticated;
select cron.schedule('la-suite-daily-backup','0 2 * * *','select la_suite_internal.daily_backup();');
select cron.schedule('la-suite-backup-worker','* * * * *','select la_suite_internal.run_backup_worker() where exists(select 1 from la_suite_internal.backups where state in (''queued'',''running'',''restoring'') and (lease_until is null or lease_until<now()));');
select cron.schedule('la-suite-backup-cleanup','15 * * * *','select la_suite_internal.run_backup_worker();');

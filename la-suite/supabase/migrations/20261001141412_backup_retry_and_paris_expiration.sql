create or replace function public.admin_backend(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare bid uuid;cid uuid;job la_suite_internal.backups;out jsonb;snap jsonb;fl jsonb;rowdata jsonb;caprow public.capsules;msgrow public.messages;
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
  insert into la_suite_internal.backups(scope_id,label,snapshot,files,automatic,expires_at) values(cid,case when cid is null then 'Toutes les capsules' else (select couple_name from public.capsules where id=cid) end,snap,fl,coalesce((p_payload->>'automatic')::boolean,false),(select min(((x->>'wedding_date')::timestamp+interval '3 years') at time zone 'Europe/Paris') from jsonb_array_elements(snap->'capsules')x)) returning id into bid;
  return jsonb_build_object('id',bid);
 elsif p_action='lease' then
  select * into job from la_suite_internal.backups where state in ('queued','running','restoring') and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 1;
  if not found then return null;end if;
  update la_suite_internal.backups set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',state=case when state='queued' then 'running' else state end where id=job.id returning * into job;return to_jsonb(job);
 elsif p_action='progress' then
  update la_suite_internal.backups set cursor=coalesce((p_payload->>'cursor')::int,cursor),restore_cursor=coalesce((p_payload->>'restore_cursor')::int,restore_cursor),state=coalesce(p_payload->>'state',state),manifest_path=coalesce(p_payload->>'manifest',manifest_path),snapshot=case when p_payload->>'state'='ready' then null else snapshot end,finished_at=case when p_payload->>'state' in ('ready','restored','failed') then now() else finished_at end,error=p_payload->>'error',lease_until=null,lease=null where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid;
  if not found then raise exception 'Opération reprise par un autre processus.';end if;return 'true';
 elsif p_action='source_unchanged' then return to_jsonb(exists(select 1 from storage.objects o where o.bucket_id='capsule-media' and o.name=p_payload->>'path' and 'assets/'||encode(extensions.digest(o.name||':'||o.updated_at::text||':'||coalesce(o.metadata->>'size','0'),'sha256'),'hex')=p_payload->>'key'));
 elsif p_action='asset_exists' then return to_jsonb(exists(select 1 from storage.objects where bucket_id='capsule-backups' and name=p_payload->>'path'));
 elsif p_action='retry' then
  select * into job from la_suite_internal.backups where id=(p_payload->>'id')::uuid and state='failed' for update;
  if not found then raise exception 'Opération indisponible.';end if;
  if job.manifest_path is null then
   out:=public.admin_backend('queue',jsonb_build_object('id',job.scope_id));
   delete from la_suite_internal.backups where id=job.id;
   return out;
  end if;
  update la_suite_internal.backups set state='restoring',error=null,lease=null,lease_until=null where id=job.id;return 'true';
 elsif p_action='restore_check' then
  for rowdata in select value from jsonb_array_elements(p_payload->'snapshot'->'capsules') loop
   caprow:=jsonb_populate_record(null::public.capsules,rowdata);
   if not exists(select 1 from auth.users where id=caprow.owner_id) then raise exception 'Le compte organisateur manque. La restauration nécessite le compte d’origine.';end if;
   if ((caprow.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris')<=now() then raise exception 'La période de conservation est terminée.';end if;
  end loop;return 'true';
 elsif p_action='import' then
  perform public.admin_backend('restore_check',jsonb_build_object('snapshot',p_payload->'snapshot'));
  bid:=gen_random_uuid();
  select coalesce(jsonb_agg(value||jsonb_build_object('stored_key',bid::text||'/import/'||ordinality::text)),'[]') into fl from jsonb_array_elements(p_payload->'files') with ordinality;
  if exists(select 1 from jsonb_array_elements(fl)f where f->>'key' !~ '^assets/[a-f0-9]{64}$' or (f->>'size')::bigint>50000000 or (f->>'size')::bigint<0 or f->>'path' !~ '^[a-f0-9-]{36}/') then raise exception 'Format de sauvegarde invalide.';end if;
  insert into la_suite_internal.backups(id,label,state,files,manifest_path,manifest_aad,expires_at) values(bid,'Sauvegarde importée','importing',fl,bid::text||'/manifest',p_payload->>'aad',(select min(((x->>'wedding_date')::timestamp+interval '3 years') at time zone 'Europe/Paris') from jsonb_array_elements(p_payload->'snapshot'->'capsules')x));
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
   caprow:=jsonb_populate_record(null::public.capsules,rowdata);
   if not exists(select 1 from auth.users where id=caprow.owner_id) then raise exception 'Le compte organisateur manque. Restauration impossible.';end if;
   if (la_suite_internal.capsule_state(caprow.id)->>'state')='expired' or ((caprow.wedding_date::timestamp+interval '3 years') at time zone 'Europe/Paris')<=now() then raise exception 'La période de conservation est terminée.';end if;
   insert into public.capsules select (caprow).* on conflict(id) do nothing;
  end loop;
  for rowdata in select value from jsonb_array_elements(p_payload->'snapshot'->'messages') loop
   msgrow:=jsonb_populate_record(null::public.messages,rowdata);insert into public.messages select (msgrow).* on conflict(id) do nothing;
  end loop;return 'true';
 elsif p_action='cleanup' then
  delete from la_suite_internal.backups where (created_at<now()-interval '7 days' or expires_at<now()) and (lease_until is null or lease_until<now());
  select jsonb_build_object('garbage',coalesce(jsonb_agg(o.name),'[]')) into out from storage.objects o where o.bucket_id='capsule-backups' and o.created_at<now()-interval '1 day' and not exists(select 1 from la_suite_internal.backups b where b.manifest_path=o.name or b.id::text||'/manifest'=o.name or exists(select 1 from jsonb_array_elements(b.files)f where f->>'key'=o.name));
  delete from la_suite_internal.admin_events where created_at<now()-interval '90 days';return out;
 end if;
 raise exception 'Action inconnue.';
end $$;

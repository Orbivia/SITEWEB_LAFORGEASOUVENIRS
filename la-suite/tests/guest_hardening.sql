begin;
do $$
declare owner uuid;c uuid:=gen_random_uuid();dead uuid:=gen_random_uuid();guest uuid:=gen_random_uuid();other uuid:=gen_random_uuid();req uuid:=gen_random_uuid();r jsonb;again jsonb;garbage jsonb;path text;i int;denied boolean;bid uuid:=gen_random_uuid();
begin
 select id into owner from auth.users limit 1;
 insert into public.capsules(id,owner_id,slug,couple_name,wedding_date,status,plan,activation_source)
 values(c,owner,'qa-'||c,'QA guest limits',(now() at time zone 'Europe/Paris')::date,'active','premium','free_beta'),
 (dead,owner,'qa-'||dead,'QA expired',(now() at time zone 'Europe/Paris')::date-interval '4 years','active','premium','free_beta');
 for i in 1..4 loop r:=public.reserve_guest_memory(c,case when i=4 then req else gen_random_uuid() end,'','','video','video/mp4',50000000,now(),guest);end loop;
 again:=public.reserve_guest_memory(c,req,'','','video','video/mp4',50000000,now(),guest);
 if again->>'message_id'<>r->>'message_id' then raise exception 'Retry at quota must be idempotent';end if;
 denied:=false;begin perform public.reserve_guest_memory(c,gen_random_uuid(),'','','image','image/jpeg',1,now(),guest);exception when others then if SQLERRM not like '%200 Mo%' then raise;end if;denied:=true;end;if not denied then raise exception 'Guest byte overflow';end if;
 perform public.reserve_guest_memory(c,gen_random_uuid(),'','','image','image/jpeg',1,now(),other);
 denied:=false;begin perform public.reserve_guest_memory(c,req,'','','video','video/mp4',50000000,now(),other);exception when others then if SQLERRM<>'Envoi invalide.' then raise;end if;denied:=true;end;if not denied then raise exception 'Identity mismatch retry';end if;
 -- Expired reservations with no object free the guest budget.
 update public.messages set reservation_until=now()-interval '1 hour' where capsule_id=c and guest_id=guest;
 for i in 1..20 loop perform public.reserve_guest_memory(c,gen_random_uuid(),'','','image','image/jpeg',1,now(),guest);end loop;
 denied:=false;begin perform public.reserve_guest_memory(c,gen_random_uuid(),'','','image','image/jpeg',1,now(),guest);exception when others then if SQLERRM not like '%20 fichiers%' then raise;end if;denied:=true;end;if not denied then raise exception 'Guest file count overflow';end if;
 for i in 1..20 loop perform public.reserve_guest_memory(c,gen_random_uuid(),'','A text','text',null,0,now(),guest);end loop;
 denied:=false;begin perform public.reserve_guest_memory(c,gen_random_uuid(),'','Too many','text',null,0,now(),guest);exception when others then if SQLERRM not like '%20 petits mots%' then raise;end if;denied:=true;end;if not denied then raise exception 'Guest text count overflow';end if;
 denied:=false;begin perform public.reserve_guest_memory(c,gen_random_uuid(),'','Missing id','text',null,0,now(),null);exception when others then if SQLERRM not like '%Rechargez%' then raise;end if;denied:=true;end;if not denied then raise exception 'Missing identity bypass';end if;
 -- Old upload still under reservation must be protected; finalize stays counted.
 r:=public.reserve_guest_memory(c,gen_random_uuid(),'','','image','image/jpeg',10,now(),other);path:=r->>'path';
 insert into storage.objects(bucket_id,name,created_at,metadata) values('capsule-media',path,now()-interval '2 days','{"size":10,"mimetype":"image/jpeg"}');
 insert into storage.objects(bucket_id,name,created_at,metadata) values
 ('capsule-media',c||'/organizer/current.jpg',now()-interval '2 days','{"size":10,"mimetype":"image/jpeg"}'),
 ('capsule-media',c||'/organizer/replaced.jpg',now()-interval '2 days','{"size":10,"mimetype":"image/jpeg"}'),
 ('capsule-media',c||'/orphan',now()-interval '2 days','{"size":1}'),
 ('capsule-media',c||'/recent',now(),'{}'),
 ('capsule-media',c||'/backup-source',now()-interval '2 days','{}'),
 ('capsule-media',dead||'/expired',now()-interval '2 days','{}');
 update public.capsules set intro_path=c||'/organizer/current.jpg' where id=c;
 insert into la_suite_internal.backups(id,label,state,files,expires_at) values(bid,'QA protect cleanup','ready',jsonb_build_array(jsonb_build_object('path',c||'/backup-source','key','qa-asset')),now()+interval '1 day');
 garbage:=public.media_cleanup_backend('candidates')->'garbage';
 if not garbage ? (c||'/orphan') or not garbage ? (c||'/organizer/replaced.jpg') or not garbage ? (dead||'/expired') then raise exception 'Missing cleanup candidate: %',garbage;end if;
 if garbage ? path or garbage ? (c||'/recent') or garbage ? (c||'/backup-source') or garbage ? (c||'/organizer/current.jpg') then raise exception 'Live data selected for cleanup: %',garbage;end if;
 perform public.finalize_guest_memory(c,(r->>'message_id')::uuid,path);
 garbage:=public.media_cleanup_backend('candidates')->'garbage';if garbage ? path then raise exception 'Finalized media not protected';end if;
 denied:=false;begin update public.capsules set intro_path=c||'/organizer/replaced.jpg' where id=c;exception when others then if SQLERRM not like '%expiré%' then raise;end if;denied:=true;end;if not denied then raise exception 'Marked orphan republished';end if;
 perform public.media_cleanup_backend('ack',garbage);
 if not exists(select 1 from la_suite_internal.media_cleanup_queue q where q.path=c||'/orphan') then raise exception 'Unremoved object acknowledged';end if;
 -- Rolled-back Storage metadata fixture only; production deletion is via the API.
 update storage.objects set name=c||'/removed-fixture' where bucket_id='capsule-media' and name=c||'/orphan';
 perform public.media_cleanup_backend('ack',jsonb_build_array(c||'/orphan'));
 if exists(select 1 from la_suite_internal.media_cleanup_queue q where q.path=c||'/orphan') then raise exception 'Successful cleanup not acknowledged';end if;
 if exists(select 1 from public.messages where capsule_id=c and media_type<>'text' and media_path is null and reservation_until<now()) then raise exception 'Abandoned metadata not pruned';end if;
 if has_function_privilege('anon','public.media_cleanup_backend(text,jsonb)','execute') or has_function_privilege('authenticated','public.reserve_guest_memory(uuid,uuid,text,text,text,text,bigint,timestamptz,uuid)','execute') then raise exception 'Private backend publicly callable';end if;
 raise notice 'PASS: guest limits/identities/idempotency/expired reservations, cleanup protects live/uploads/backups/recent files, expiry and API acknowledgements';
end $$;
rollback;

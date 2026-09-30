begin;
do $$
declare owner uuid; c uuid:=gen_random_uuid(); photo uuid:=gen_random_uuid(); winter uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); r jsonb; s jsonb; again jsonb; mid uuid; path text; i int; denied boolean;
begin
 select id into owner from auth.users limit 1;
 if owner is null then raise exception 'A fixture owner is required';end if;
 insert into public.capsules(id,owner_id,slug,couple_name,wedding_date,status,plan,activation_source,guest_rules_version)
 values(c,owner,'qa-'||c,'QA rollback',(now() at time zone 'Europe/Paris')::date,'active','premium','free_beta',1),
 (photo,owner,'qa-'||photo,'QA rollback',(now() at time zone 'Europe/Paris')::date,'active','photo','payment',1),
 (winter,owner,'qa-'||winter,'QA rollback','2026-03-29','active','premium','free_beta',1);
 s:=public.guest_capsule_state(winter);
 if s->>'opens_at'<>'2026-03-28T23:00:00+00:00' or s->>'closes_at'<>'2026-03-30T22:00:00+00:00' then raise exception 'Paris DST dates failed: %',s;end if;
 s:=public.guest_capsule_state(photo);
 if s->>'state'<>'open' or (s->>'quota_bytes')::bigint<>1000000000 then raise exception 'State/quota failed';end if;
 denied:=false;begin perform public.reserve_guest_memory(photo,gen_random_uuid(),'','','audio','audio/webm',10,now());exception when others then denied:=true;end;if not denied then raise exception 'Plan bypass';end if;
 denied:=false;begin perform public.reserve_guest_memory(c,gen_random_uuid(),'','','image','image/jpeg',10000001,now());exception when others then denied:=true;end;if not denied then raise exception 'Per file limit bypass';end if;
 denied:=false;begin perform public.reserve_guest_memory(c,gen_random_uuid(),'','','text',null,0,now()+interval '31 months');exception when others then denied:=true;end;if not denied then raise exception 'Delivery boundary bypass';end if;
 r:=public.reserve_guest_memory(c,req,'','Petit mot','text',null,0,now());
 again:=public.reserve_guest_memory(c,req,'','Petit mot','text',null,0,now());
 if r->>'message_id'<>again->>'message_id' or (select count(*) from public.messages where capsule_id=c)<>1 then raise exception 'Text retry duplicated';end if;
 if (select guest_name from public.messages where id=(r->>'message_id')::uuid)<>'Un invité' then raise exception 'Optional name failed';end if;
 r:=public.reserve_guest_memory(c,gen_random_uuid(),'','','image','image/jpeg',100,now());mid:=(r->>'message_id')::uuid;path:=r->>'path';
 perform set_config('request.jwt.claim.sub',owner::text,true);
 if (select message_count from public.owner_capsule_stats(c))<>1 then raise exception 'Pending file visible';end if;
 denied:=false;begin perform public.finalize_guest_memory(c,mid,c::text||'/other/media.jpg');exception when others then denied:=true;end;if not denied then raise exception 'Foreign path accepted';end if;
 insert into storage.objects(bucket_id,name,metadata) values('capsule-media',path,'{"size":101,"mimetype":"image/jpeg"}');
 denied:=false;begin perform public.finalize_guest_memory(c,mid,path);exception when others then denied:=true;end;if not denied then raise exception 'Actual size mismatch accepted';end if;
 update storage.objects set metadata='{"size":100,"mimetype":"image/jpeg"}' where bucket_id='capsule-media' and name=path;
 perform public.finalize_guest_memory(c,mid,path);perform public.finalize_guest_memory(c,mid,path);
 if (select message_count from public.owner_capsule_stats(c))<>2 then raise exception 'Finalized file missing';end if;
 if (public.guest_capsule_state(c)->>'used_bytes')::bigint<>100 then raise exception 'Double counted actual bytes';end if;
 for i in 1..100 loop perform public.reserve_guest_memory(c,gen_random_uuid(),'','','video','video/mp4',case when i=100 then 49999900 else 50000000 end,now());end loop;
 denied:=false;begin perform public.reserve_guest_memory(c,gen_random_uuid(),'','','image','image/jpeg',1,now());exception when others then denied:=true;end;if not denied then raise exception 'Quota overflow';end if;
 perform public.reserve_guest_memory(c,gen_random_uuid(),'','Still a text','text',null,0,now());
 update public.capsules set wedding_date=(now() at time zone 'Europe/Paris')::date-3 where id=photo;
 denied:=false;begin perform public.reserve_guest_memory(photo,gen_random_uuid(),'','Closed','text',null,0,now());exception when others then denied:=true;end;if not denied then raise exception 'Closed capsule accepts new message';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 denied:=false;begin update public.capsules set guest_rules_version=0 where id=c;exception when others then denied:=true;end;
 if not denied then raise exception 'Lifecycle version mutable';end if;
 denied:=false;begin update public.capsules set wedding_date=wedding_date+1 where id=c;exception when others then denied:=true;end;
 if not denied then raise exception 'Active event date mutable';end if;
 denied:=false;begin perform public.guest_capsule_state(c);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Server-only state exposed';end if;
 execute 'reset role';
 raise notice 'PASS: Paris DST, quotas, concurrent reservation serialization, plans, optional name, idempotency, actual file checks, pending visibility, calendar and role guards';
end $$;
rollback;
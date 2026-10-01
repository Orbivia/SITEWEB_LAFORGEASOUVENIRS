begin;
insert into auth.users(id,email,email_confirmed_at) values('66666666-6666-4666-8666-666666666666','audit@example.invalid',now()),('77777777-7777-4777-8777-777777777777','other-audit@example.invalid',now());
insert into public.capsules(id,owner_id,slug,guest_token,couple_name,wedding_date,quota_override_bytes)
values('66666666-6666-4666-8666-666666666666','66666666-6666-4666-8666-666666666666','audit-test',repeat('6',36),'Audit test',current_date+1,100000000);
do $$declare r jsonb;p text;u uuid:='66666666-6666-4666-8666-666666666666';used bigint;
begin
 begin perform public.organizer_intro_backend('reserve','77777777-7777-4777-8777-777777777777',u,'{"mime":"image/png","bytes":100}');raise exception 'Other owner accepted';exception when raise_exception then if SQLERRM='Other owner accepted' then raise;end if;end;
 begin perform public.organizer_intro_backend('reserve',u,u,'{"mime":"image/png","bytes":10000001}');raise exception 'Oversized image accepted';exception when raise_exception then if SQLERRM='Oversized image accepted' then raise;end if;end;
 r:=public.organizer_intro_backend('reserve',u,u,'{"mime":"video/mp4","bytes":50000000}');p:=r->>'path';
 if (la_suite_internal.capsule_state(u)->>'used_bytes')::bigint<>50000000 then raise exception 'Intro reservation not counted';end if;
 perform public.organizer_intro_backend('reserve',u,u,'{"mime":"video/mp4","bytes":50000000}');
 begin perform public.organizer_intro_backend('reserve',u,u,'{"mime":"image/png","bytes":1}');raise exception 'Quota exceeded';exception when raise_exception then if SQLERRM='Quota exceeded' then raise;end if;end;
 -- Metadata exists only inside this rolled-back test; no physical object is written.
 insert into storage.objects(bucket_id,name,metadata) values('capsule-media',p,'{"size":49999999,"mimetype":"video/mp4"}');
 begin perform public.organizer_intro_backend('finalize',u,u,jsonb_build_object('path',p));raise exception 'Size mismatch accepted';exception when raise_exception then if SQLERRM='Size mismatch accepted' then raise;end if;end;
 update storage.objects set metadata='{"size":50000000,"mimetype":"video/mp4"}' where bucket_id='capsule-media' and name=p;
 if (la_suite_internal.capsule_state(u)->>'used_bytes')::bigint<>100000000 then raise exception 'Intro counted twice';end if;
 perform public.organizer_intro_backend('finalize',u,u,jsonb_build_object('path',p));
 if (select intro_path from public.capsules where id=u) is distinct from p then raise exception 'Intro not published';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform public.organizer_intro_backend('reserve','66666666-6666-4666-8666-666666666666','66666666-6666-4666-8666-666666666666','{}');raise exception 'Backend exposed';exception when insufficient_privilege then null;end;
 begin update public.capsules set intro_path='66666666-6666-4666-8666-666666666666/private-memory.mp4' where slug='audit-test';raise exception 'Private memory exposed as intro';exception when raise_exception then if SQLERRM='Private memory exposed as intro' then raise;end if;end;
 begin update public.capsules set intro_path='77777777-7777-4777-8777-777777777777/organizer/intro.mp4' where slug='audit-test';raise exception 'Other capsule exposed as intro';exception when raise_exception then if SQLERRM='Other capsule exposed as intro' then raise;end if;end;
 begin insert into storage.objects(bucket_id,name) values('capsule-media','66666666-6666-4666-8666-666666666666/organizer/bypass.mp4');raise exception 'Direct upload accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.capsules set wedding_date=current_date-interval '4 years' where slug='audit-test';
do $$begin
 if la_suite_internal.capsule_state('66666666-6666-4666-8666-666666666666')->>'state'<>'expired' then raise exception 'Expired draft not expired';end if;
 begin perform public.organizer_intro_backend('reserve','66666666-6666-4666-8666-666666666666','66666666-6666-4666-8666-666666666666','{"mime":"image/png","bytes":1}');raise exception 'Expired intro accepted';exception when raise_exception then if SQLERRM='Expired intro accepted' then raise;end if;end;
end $$;
-- Imported encrypted objects must survive cleanup for an unexpired job.
insert into la_suite_internal.backups(id,label,state,files,manifest_path,expires_at) values('88888888-8888-4888-8888-888888888888','Audit import','importing','[{"key":"assets/test-original","stored_key":"88888888-8888-4888-8888-888888888888/import/1"}]','88888888-8888-4888-8888-888888888888/manifest',now()+interval '1 day');
insert into storage.objects(bucket_id,name,created_at) values('capsule-backups','88888888-8888-4888-8888-888888888888/import/1',now()-interval '2 days'),('capsule-backups','audit-unreferenced',now()-interval '2 days');
do $$declare result jsonb;begin
 result:=public.admin_backend('cleanup');
 if result->'garbage' ? '88888888-8888-4888-8888-888888888888/import/1' then raise exception 'Active import removed';end if;
 if not result->'garbage' ? 'audit-unreferenced' then raise exception 'Garbage not cleaned';end if;
end $$;
rollback;

begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('33333333-3333-4333-8333-333333333333','admin-test@example.invalid',now(),'{"admin":true}');
insert into public.capsules(id,owner_id,slug,guest_token,couple_name,wedding_date) values('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','admin-test','333333333333333333333333333333333333','Administration test',current_date+1);
insert into la_suite_internal.admin_invites(token_hash,expires_at) values(encode(extensions.digest(repeat('a',64),'sha256'),'hex'),now()+interval '1 hour');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 if public.admin_status() then raise exception 'Editable metadata granted administration';end if;
 begin perform public.admin_backend('runtime');raise exception 'Private backend exposed';exception when insufficient_privilege then null;end;
 begin update public.capsules set admin_suspended=true where id='44444444-4444-4444-8444-444444444444';raise exception 'Client changed protected field';exception when raise_exception then if SQLERRM='Client changed protected field' then raise;end if;end;
 if not public.admin_claim(repeat('a',64)) then raise exception 'Admin invitation failed';end if;
end $$;
do $$begin
 if not public.admin_status() then raise exception 'Admin role not saved';end if;
 begin perform public.admin_claim(repeat('a',64));raise exception 'Invitation reusable';exception when raise_exception then if SQLERRM='Invitation reusable' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.capsules set status='active',activation_source='payment',activated_at=now(),admin_suspended=true,quota_override_bytes=1000000000 where id='44444444-4444-4444-8444-444444444444';
do $$declare queued jsonb;leased jsonb;
begin
 if la_suite_internal.capsule_state('44444444-4444-4444-8444-444444444444')->>'state'<>'suspended' then raise exception 'Pause not enforced';end if;
 if (la_suite_internal.capsule_state('44444444-4444-4444-8444-444444444444')->>'quota_bytes')::bigint<>1000000000 then raise exception 'Quota override failed';end if;
 queued:=public.admin_backend('queue','{"id":"44444444-4444-4444-8444-444444444444"}');
 leased:=public.admin_backend('lease');
 if leased->>'id'<>queued->>'id' or leased->>'state'<>'running' then raise exception 'Queue lease failed';end if;
 if public.admin_backend('lease') is not null then raise exception 'Job leased twice';end if;
 perform public.admin_backend('progress',jsonb_build_object('id',leased->>'id','lease',leased->>'lease','state','ready','manifest',leased->>'id'||'/manifest'));
 if (public.admin_backend('get',jsonb_build_object('id',leased->>'id'))->>'snapshot') is not null then raise exception 'Snapshot not scrubbed';end if;
end $$;
rollback;

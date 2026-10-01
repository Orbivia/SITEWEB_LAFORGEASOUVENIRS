-- Private account state serializes concurrent requests and remembers a used free activation.
create table la_suite_internal.capsule_account_guard (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 free_capsule_id uuid,
 creations timestamptz[] not null default '{}'
);
alter table la_suite_internal.capsule_account_guard enable row level security;
revoke all on la_suite_internal.capsule_account_guard from public,anon,authenticated;

-- Preserve all existing capsules; existing free activations consume the free allowance.
insert into la_suite_internal.capsule_account_guard(owner_id,free_capsule_id)
select distinct on (owner_id) owner_id,id from public.capsules
where status='active' and activation_source in ('legacy','free_beta')
order by owner_id,created_at,id;

create function la_suite_internal.guard_account_capsule() returns trigger
language plpgsql security definer set search_path='' as $$
declare account_id uuid:=auth.uid(); state la_suite_internal.capsule_account_guard; free_launch boolean;
begin
 -- Service administration is trusted; client requests must act on their own account.
 if account_id is null then return new;end if;
 if account_id<>new.owner_id then raise exception 'Cette capsule appartient à un autre compte.';end if;
 insert into la_suite_internal.capsule_account_guard(owner_id) values(account_id) on conflict do nothing;
 select * into state from la_suite_internal.capsule_account_guard where owner_id=account_id for update;
 select free_activation_enabled into free_launch from public.capsule_billing_settings where singleton;
 if TG_OP='INSERT' then
  if free_launch and (state.free_capsule_id is not null or exists(select 1 from public.capsules where owner_id=account_id and activation_source is distinct from 'payment')) then
   raise exception 'Une seule capsule gratuite est disponible par compte. Retrouvez votre capsule dans votre espace organisateur.';
  end if;
  state.creations:=array(select t from unnest(state.creations) t where t>now()-interval '24 hours');
  if cardinality(state.creations)>=5 then raise exception 'Trop de créations en 24 heures. Retrouvez votre capsule ou réessayez plus tard.';end if;
  update la_suite_internal.capsule_account_guard set creations=array_append(state.creations,now()) where owner_id=account_id;
 elsif new.status='active' and new.activation_source='free_beta' and (old.status is distinct from new.status or old.activation_source is distinct from new.activation_source) then
  if state.free_capsule_id is not null and state.free_capsule_id<>new.id or exists(select 1 from public.capsules where owner_id=account_id and id<>new.id and status='active' and activation_source in ('legacy','free_beta')) then
   raise exception 'Votre compte a déjà utilisé sa capsule gratuite.';
  end if;
  update la_suite_internal.capsule_account_guard set free_capsule_id=new.id where owner_id=account_id;
 end if;
 return new;
end $$;
revoke all on function la_suite_internal.guard_account_capsule() from public,anon,authenticated;
create trigger capsules_account_limit before insert or update of status,activation_source on public.capsules
for each row execute function la_suite_internal.guard_account_capsule();

create function public.owner_capsule_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare account_id uuid:=auth.uid(); free_launch boolean; used_free boolean; existing_slug text; recent_creations integer;
begin
 if account_id is null then raise exception 'Connexion requise';end if;
 select free_activation_enabled into free_launch from public.capsule_billing_settings where singleton;
 select c.slug into existing_slug from public.capsules c where c.owner_id=account_id and c.activation_source is distinct from 'payment'
 order by case when c.status='draft' then 0 else 1 end,c.created_at desc,c.id limit 1;
 select g.free_capsule_id is not null,(select count(*) from unnest(g.creations) t where t>now()-interval '24 hours')
 into used_free,recent_creations from la_suite_internal.capsule_account_guard g where g.owner_id=account_id;
 return jsonb_build_object('free_launch',coalesce(free_launch,false),'can_create',
 not(coalesce(free_launch,false) and (existing_slug is not null or coalesce(used_free,false))) and coalesce(recent_creations,0)<5,
 'existing_slug',existing_slug,'reason',case
 when free_launch and (existing_slug is not null or coalesce(used_free,false)) then 'Le lancement gratuit comprend une seule capsule par compte.'
 when coalesce(recent_creations,0)>=5 then 'Trop de créations en 24 heures. Réessayez plus tard.' else '' end);
end $$;
revoke all on function public.owner_capsule_access() from public,anon;
grant execute on function public.owner_capsule_access() to authenticated;

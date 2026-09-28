-- Existing capsules remain accessible; new capsules start as private drafts.
alter table public.capsules add column status text not null default 'active' check (status in ('draft','active'));
alter table public.capsules add column plan text not null default 'premium' check (plan in ('photo','audio','premium'));
alter table public.capsules add column activated_at timestamptz;
alter table public.capsules add column activation_source text check (activation_source in ('legacy','free_beta','payment'));
update public.capsules set activated_at=created_at, activation_source='legacy';
alter table public.capsules alter column status set default 'draft';

-- Server-only switch. A future checkout must first disable free activation here.
create table public.capsule_billing_settings (
 singleton boolean primary key default true check(singleton),
 free_activation_enabled boolean not null default true
);
insert into public.capsule_billing_settings values (true,true);
alter table public.capsule_billing_settings enable row level security;
revoke all on public.capsule_billing_settings from anon, authenticated;

-- Do not let an owner mark a draft active/paid by editing the REST payload.
create function public.guard_capsule_activation() returns trigger
language plpgsql set search_path=public as $$
begin
 if current_user in ('anon','authenticated') then
  if TG_OP='INSERT' then
   if new.status <> 'draft' or new.activation_source is not null or new.activated_at is not null then
    raise exception 'Activation requires the activation service';
   end if;
  elsif new.status is distinct from old.status or new.activation_source is distinct from old.activation_source or new.activated_at is distinct from old.activated_at then
   raise exception 'Activation requires the activation service';
  end if;
 end if;
 return new;
end;
$$;
create trigger capsules_guard_activation before insert or update on public.capsules
for each row execute function public.guard_capsule_activation();
revoke all on function public.guard_capsule_activation() from public,anon,authenticated;

create function public.activate_capsule(p_capsule_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target public.capsules%rowtype;
begin
 if auth.uid() is null then raise exception 'Connexion requise'; end if;
 select * into target from public.capsules where id=p_capsule_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Capsule introuvable'; end if;
 if target.status='active' then return; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Confirmez votre adresse e-mail avant l’activation';
 end if;
 if not exists(select 1 from public.capsule_billing_settings where singleton and free_activation_enabled) then
  raise exception 'L’activation gratuite est terminée. Le paiement sera proposé prochainement';
 end if;
 update public.capsules set status='active',activated_at=now(),activation_source='free_beta' where id=target.id;
end;
$$;
revoke all on function public.activate_capsule(uuid) from public,anon;
grant execute on function public.activate_capsule(uuid) to authenticated;

create or replace function public.get_capsule_public(p_guest_token text)
returns table(id uuid,couple_name text,wedding_date date,welcome_message text,has_intro boolean)
language sql security definer set search_path=public stable as $$
 select c.id,c.couple_name,c.wedding_date,c.welcome_message,(c.intro_path is not null)
 from public.capsules c where c.guest_token=p_guest_token and c.status='active' limit 1;
$$;
revoke all on function public.get_capsule_public(text) from public;
grant execute on function public.get_capsule_public(text) to anon,authenticated;

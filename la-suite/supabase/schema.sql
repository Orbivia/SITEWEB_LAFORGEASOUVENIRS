-- La Suite — schéma MVP Supabase
-- À exécuter dans le SQL Editor d'un projet Supabase dédié.

create extension if not exists pgcrypto;

create table if not exists public.capsules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text unique not null,
  guest_token text unique not null default encode(gen_random_bytes(18), 'hex'),
  couple_name text not null,
  wedding_date date,
  unlock_date timestamptz not null,
  welcome_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  guest_name text,
  message_text text,
  video_path text,
  created_at timestamptz not null default now()
);

create index if not exists messages_capsule_id_idx on public.messages(capsule_id);
create index if not exists capsules_owner_id_idx on public.capsules(owner_id);
create unique index if not exists capsules_guest_token_idx on public.capsules(guest_token);

alter table public.capsules enable row level security;
alter table public.messages enable row level security;

drop policy if exists "owners_select_capsules" on public.capsules;
create policy "owners_select_capsules"
on public.capsules for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "owners_insert_capsules" on public.capsules;
create policy "owners_insert_capsules"
on public.capsules for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "owners_update_capsules" on public.capsules;
create policy "owners_update_capsules"
on public.capsules for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "owners_delete_capsules" on public.capsules;
create policy "owners_delete_capsules"
on public.capsules for delete
to authenticated
using (auth.uid() = owner_id);

-- Le contenu n'est lisible par le propriétaire qu'à partir de la date d'ouverture.
drop policy if exists "owners_select_messages_after_unlock" on public.messages;
create policy "owners_select_messages_after_unlock"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.capsules c
    where c.id = messages.capsule_id
      and c.owner_id = auth.uid()
      and c.unlock_date <= now()
  )
);

-- Informations minimales nécessaires à la page publique, récupérées avec un token non devinable.
create or replace function public.get_capsule_public(p_guest_token text)
returns table (
  id uuid,
  couple_name text,
  wedding_date date,
  unlock_date timestamptz,
  welcome_message text
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.couple_name, c.wedding_date, c.unlock_date, c.welcome_message
  from public.capsules c
  where c.guest_token = p_guest_token
  limit 1;
$$;

revoke all on function public.get_capsule_public(text) from public;
grant execute on function public.get_capsule_public(text) to anon, authenticated;

-- Le propriétaire peut connaître le nombre de participations sans lire leur contenu.
create or replace function public.owner_capsule_stats(p_capsule_id uuid)
returns table (message_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select count(*)
  from public.messages m
  join public.capsules c on c.id = m.capsule_id
  where m.capsule_id = p_capsule_id
    and c.owner_id = auth.uid();
$$;

revoke all on function public.owner_capsule_stats(uuid) from public;
grant execute on function public.owner_capsule_stats(uuid) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'capsule-media',
  'capsule-media',
  false,
  104857600,
  array['video/mp4','video/quicktime','video/webm']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Lecture des fichiers uniquement par le propriétaire après ouverture.
drop policy if exists "owner_read_media_after_unlock" on storage.objects;
create policy "owner_read_media_after_unlock"
on storage.objects for select
to authenticated
using (
  bucket_id = 'capsule-media'
  and exists (
    select 1
    from public.capsules c
    where c.owner_id = auth.uid()
      and c.unlock_date <= now()
      and storage.objects.name like c.id::text || '/%'
  )
);

-- Pas de policy INSERT publique : les uploads invités passent par une URL signée
-- créée par l'Edge Function guest-upload avec la service role.

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

alter table public.capsules enable row level security;
alter table public.messages enable row level security;

drop policy if exists "owners_select_capsules" on public.capsules;
create policy "owners_select_capsules"
on public.capsules for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "owners_insert_capsules" on public.capsules;
create policy "owners_insert_capsules"
on public.capsules for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "owners_update_capsules" on public.capsules;
create policy "owners_update_capsules"
on public.capsules for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "owners_delete_capsules" on public.capsules;
create policy "owners_delete_capsules"
on public.capsules for delete
to authenticated
using ((select auth.uid()) = owner_id);

-- Le contenu n'est lisible par le propriétaire qu'à partir de la date d'ouverture.
drop policy if exists "owners_select_messages_after_unlock" on public.messages;
create policy "owners_select_messages_after_unlock"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.capsules c
    where c.id = messages.capsule_id
      and c.owner_id = (select auth.uid())
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
    and c.owner_id = (select auth.uid());
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
    where c.owner_id = (select auth.uid())
      and c.unlock_date <= now()
      and storage.objects.name like c.id::text || '/%'
  )
);

-- Pas de policy INSERT publique : les uploads invités passent par une URL signée
-- créée par l'Edge Function guest-upload avec la service role.


-- Explicit RPC exposure hardening
revoke execute on function public.owner_capsule_stats(uuid) from anon;
grant execute on function public.owner_capsule_stats(uuid) to authenticated;

-- This function is created by the project's automatic-RLS setting and should not be callable through the API.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- Public capsule lookup is intentionally anonymous; signed-in owners do not need this RPC.
revoke execute on function public.get_capsule_public(text) from authenticated;
grant execute on function public.get_capsule_public(text) to anon;


-- ============================================================
-- V2 — Livraison choisie par chaque invité + médias génériques
-- ============================================================

alter table public.capsules alter column unlock_date drop not null;
alter table public.capsules add column if not exists intro_path text;

alter table public.messages
  add column if not exists media_type text,
  add column if not exists media_path text,
  add column if not exists delivery_at timestamptz not null default now();

update public.messages
set media_path = coalesce(media_path, video_path),
    media_type = coalesce(media_type, case when video_path is not null then 'video' else 'text' end)
where media_path is null or media_type is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_media_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_media_type_check
      check (media_type in ('video','audio','image','text'));
  end if;
end $$;

drop policy if exists "owners_select_messages_after_unlock" on public.messages;
drop policy if exists "owners_select_messages_after_delivery" on public.messages;
create policy "owners_select_messages_after_delivery"
on public.messages for select
to authenticated
using (
  delivery_at <= now()
  and exists (
    select 1 from public.capsules c
    where c.id = messages.capsule_id
      and c.owner_id = (select auth.uid())
  )
);

drop policy if exists "owner_upload_intro" on storage.objects;
create policy "owner_upload_intro"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'capsule-media'
  and exists (
    select 1 from public.capsules c
    where c.owner_id = (select auth.uid())
      and storage.objects.name like c.id::text || '/organizer/%'
  )
);

drop policy if exists "owner_update_intro" on storage.objects;
create policy "owner_update_intro"
on storage.objects for update
to authenticated
using (
  bucket_id = 'capsule-media'
  and exists (
    select 1 from public.capsules c
    where c.owner_id = (select auth.uid())
      and storage.objects.name like c.id::text || '/organizer/%'
  )
)
with check (
  bucket_id = 'capsule-media'
  and exists (
    select 1 from public.capsules c
    where c.owner_id = (select auth.uid())
      and storage.objects.name like c.id::text || '/organizer/%'
  )
);

drop policy if exists "owner_read_media_after_unlock" on storage.objects;
drop policy if exists "owner_read_media_after_delivery" on storage.objects;
create policy "owner_read_media_after_delivery"
on storage.objects for select
to authenticated
using (
  bucket_id = 'capsule-media'
  and (
    exists (
      select 1 from public.capsules c
      where c.owner_id = (select auth.uid())
        and storage.objects.name like c.id::text || '/organizer/%'
    )
    or exists (
      select 1 from public.messages m
      join public.capsules c on c.id = m.capsule_id
      where c.owner_id = (select auth.uid())
        and m.delivery_at <= now()
        and m.media_path = storage.objects.name
    )
  )
);

drop function if exists public.get_capsule_public(text);
create function public.get_capsule_public(p_guest_token text)
returns table (
  id uuid,
  couple_name text,
  wedding_date date,
  welcome_message text,
  has_intro boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.couple_name, c.wedding_date, c.welcome_message, (c.intro_path is not null)
  from public.capsules c
  where c.guest_token = p_guest_token
  limit 1;
$$;
revoke all on function public.get_capsule_public(text) from public, authenticated;
grant execute on function public.get_capsule_public(text) to anon;

create or replace function public.owner_message_manifest(p_capsule_id uuid)
returns table (
  id uuid,
  guest_name text,
  media_type text,
  delivery_at timestamptz,
  created_at timestamptz,
  is_available boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.guest_name, m.media_type, m.delivery_at, m.created_at,
         (m.delivery_at <= now()) as is_available
  from public.messages m
  join public.capsules c on c.id = m.capsule_id
  where m.capsule_id = p_capsule_id
    and c.owner_id = (select auth.uid())
  order by m.delivery_at asc, m.created_at asc;
$$;
revoke all on function public.owner_message_manifest(uuid) from public, anon;
grant execute on function public.owner_message_manifest(uuid) to authenticated;

update storage.buckets
set public = false,
    file_size_limit = 104857600,
    allowed_mime_types = array[
      'video/mp4','video/quicktime','video/webm',
      'audio/webm','audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg',
      'image/jpeg','image/png','image/webp','image/heic','image/heif'
    ]
where id = 'capsule-media';


-- ============================================================
-- V3 — Personnalisation de la carte QR code
-- ============================================================

alter table public.capsules
  add column if not exists qr_initials text,
  add column if not exists qr_color text default '#c10d0d',
  add column if not exists print_title text default 'Laissez-nous un souvenir',
  add column if not exists print_note text,
  add column if not exists print_explanation text,
  add column if not exists qr_font text default 'elegant',
  add column if not exists qr_style text default 'romantic',
  add column if not exists qr_size integer default 245,
  add column if not exists qr_show_initials boolean default true,
  add column if not exists qr_show_brand boolean default true;

alter table public.capsules
  drop constraint if exists capsules_qr_font_check,
  add constraint capsules_qr_font_check
    check (qr_font in ('elegant','classic','modern','romantic','editorial','refined','contemporary','signature')),
  drop constraint if exists capsules_qr_style_check,
  add constraint capsules_qr_style_check
    check (qr_style in ('minimal','editorial','signature','chic','palace','arch','botanical','olive','pressed','romantic','boho','riviera','dolce','seaside','celestial','pearl','retro','confetti')),
  drop constraint if exists capsules_qr_size_check,
  add constraint capsules_qr_size_check
    check (qr_size between 180 and 280);


-- ============================================================
-- V4 — Lecture des messages dans l'espace organisateur
-- ============================================================

alter table public.capsules
  add column if not exists owner_messages_seen_at timestamptz;


-- ============================================================
-- V5 — Typographies supplémentaires de la carte QR
-- ============================================================

alter table public.capsules
  drop constraint if exists capsules_qr_font_check;

alter table public.capsules
  add constraint capsules_qr_font_check
  check (qr_font in (
    'elegant','classic','modern','romantic',
    'editorial','refined','contemporary','signature'
  ));

-- QR cards use the fixed large size; historical rows remain compatible.
alter table public.capsules alter column qr_size set default 245;

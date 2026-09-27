-- La Suite — schéma MVP Supabase
-- À exécuter dans le SQL Editor d'un projet Supabase dédié.

create extension if not exists pgcrypto;

create table if not exists public.capsules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  slug text unique not null,
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

alter table public.capsules enable row level security;
alter table public.messages enable row level security;

-- Le propriétaire connecté gère ses propres capsules.
create policy "owners_select_capsules"
on public.capsules for select
to authenticated
using (auth.uid() = owner_id);

create policy "owners_insert_capsules"
on public.capsules for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "owners_update_capsules"
on public.capsules for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- Lecture publique volontairement limitée : on passera par une fonction/RPC
-- pour ne renvoyer que les champs nécessaires à la page invité.

-- Un propriétaire peut lire les messages de ses capsules.
create policy "owners_select_messages"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.capsules c
    where c.id = messages.capsule_id and c.owner_id = auth.uid()
  )
);

-- L'insertion anonyme sera sécurisée par une Edge Function dans l'étape suivante.
-- Ne pas ajouter de policy INSERT anon large avant d'avoir le contrôle anti-abus.

insert into storage.buckets (id,name,public)
values ('capsule-media','capsule-media',false)
on conflict (id) do update set public=false;

-- NovelNotes · Supabase schema
-- Usage: Supabase dashboard → SQL Editor → New query → paste everything → Run

-- 1) Notes
create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null,
  author        text not null default '',
  protagonists  text[] not null default '{}',
  content       text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);

-- 2) Per-user settings (watermark ID, default image style)
create table if not exists public.profiles (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  watermark_id  text not null default '',
  image_mode    text not null default 'portrait',   -- portrait = paginated 3:4, long = single long image
  theme         text not null default 'paper',      -- paper / ink / celadon
  indent        boolean not null default true,      -- indent first line of each paragraph by two characters
  updated_at    timestamptz not null default now()
);

-- 3) Bump updated_at on every update (used for multi-device conflict detection)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 4) Row-level security: each user can only read/write their own rows
alter table public.notes    enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

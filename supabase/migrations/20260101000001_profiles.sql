-- ===========================================================================
-- ArenaX · Phase 1 · 01 profiles
-- One row per auth user. Created automatically by a trigger so the app never
-- has to insert profiles itself (defence in depth).
-- ===========================================================================

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique
                check (length(btrim(username)) between 3 and 20),
  display_name  text check (char_length(display_name) <= 40),
  avatar_url    text,
  language      text not null default 'en' check (language in ('en', 'hi')),
  phone         text,
  role          text not null default 'player'
                check (role in ('player', 'team_captain', 'organizer', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Player/organizer profile. Role changes are admin-only (service role in Phase 4).';

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever a user signs up (phone OTP or Google).
-- Username is derived from auth metadata or a safe fallback; the app asks the
-- player to personalise it during onboarding.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, phone, language)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
      'player_' || left(new.id::text, 8)
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    new.phone,
    case
      when new.raw_user_meta_data ->> 'language' = 'hi' then 'hi'
      else 'en'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: a player can only read/update their own profile.
-- Public usernames/leaderboards are exposed later through views (Phase 3),
-- not by opening this table.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Only admins (service role / checked server-side) can change roles.
-- Guard against a player escalating their own role through the update policy.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> old.role and auth.uid() = old.id and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- ===========================================================================
-- ArenaX · Phase 1 · 06 tournaments
-- Free-entry tournaments. Prize info is sponsor-funded (Phase 5).
-- Time-sensitive fields are validated by DB constraints + edge functions.
-- ===========================================================================

create table if not exists public.tournaments (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null references public.profiles (id) on delete cascade,
  game_id       text not null references public.games (id) on delete restrict,
  title         text not null check (char_length(btrim(title)) between 3 and 90),
  mode          text not null default 'squad'
                check (mode in ('solo', 'duo', 'squad', 'five')),
  status        text not null default 'upcoming'
                check (status in ('upcoming', 'live', 'completed', 'cancelled')),
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  slots_total   integer not null default 8 check (slots_total between 1 and 256),
  slots_left    integer not null default 8 check (slots_left >= 0),
  rules         text check (char_length(rules) <= 8000),
  map           text check (char_length(map) <= 60),
  prize_info    text check (char_length(prize_info) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tournaments_time_order check (end_time > start_time),
  constraint tournaments_slots_bounds check (slots_left <= slots_total)
);

create index if not exists tournaments_game_start_idx
  on public.tournaments (game_id, start_time desc);
create index if not exists tournaments_status_idx on public.tournaments (status);
create index if not exists tournaments_organizer_idx on public.tournaments (organizer_id);

drop trigger if exists tournaments_touch_updated_at on public.tournaments;
create trigger tournaments_touch_updated_at
  before update on public.tournaments
  for each row execute function public.touch_updated_at();

-- Registration closes automatically: join_tournament() rejects late joins and
-- this helper documents the rule for the client (UI countdown only).
create or replace function public.is_registration_open(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id
      and t.status = 'upcoming'
      and t.slots_left > 0
      and now() < t.start_time - interval '15 minutes'
  );
$$;

alter table public.tournaments enable row level security;

-- Browse: any signed-in player can see tournaments.
drop policy if exists "tournaments_select_authenticated" on public.tournaments;
create policy "tournaments_select_authenticated"
  on public.tournaments for select
  to authenticated
  using (true);

-- Only the organizer who owns the row may create/edit/delete.
drop policy if exists "tournaments_insert_own" on public.tournaments;
create policy "tournaments_insert_own"
  on public.tournaments for insert
  to authenticated
  with check (auth.uid() = organizer_id);

drop policy if exists "tournaments_update_own" on public.tournaments;
create policy "tournaments_update_own"
  on public.tournaments for update
  to authenticated
  using (auth.uid() = organizer_id)
  with check (auth.uid() = organizer_id);

drop policy if exists "tournaments_delete_own" on public.tournaments;
create policy "tournaments_delete_own"
  on public.tournaments for delete
  to authenticated
  using (auth.uid() = organizer_id);

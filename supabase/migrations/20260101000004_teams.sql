-- ===========================================================================
-- ArenaX · Phase 1 · 04 teams
-- Team captain creates a team; squad/duo tournaments are registered as a team.
-- ===========================================================================

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  captain_id  uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null references public.games (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 2 and 32),
  logo_url    text,
  created_at  timestamptz not null default now()
);

create index if not exists teams_captain_idx on public.teams (captain_id);
create index if not exists teams_game_idx on public.teams (game_id);

alter table public.teams enable row level security;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
  on public.teams for select
  using (
    auth.uid() = captain_id
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = teams.id and tm.player_id = auth.uid()
    )
  );

drop policy if exists "teams_insert_captain" on public.teams;
create policy "teams_insert_captain"
  on public.teams for insert
  with check (auth.uid() = captain_id);

drop policy if exists "teams_update_captain" on public.teams;
create policy "teams_update_captain"
  on public.teams for update
  using (auth.uid() = captain_id)
  with check (auth.uid() = captain_id);

drop policy if exists "teams_delete_captain" on public.teams;
create policy "teams_delete_captain"
  on public.teams for delete
  using (auth.uid() = captain_id);

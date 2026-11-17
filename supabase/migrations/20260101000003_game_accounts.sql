-- ===========================================================================
-- ArenaX · Phase 1 · 03 game_accounts
-- In-game IDs (BGMI ID, FF UID, Riot ID, CODM UID) — one per game per player.
-- Used to build custom rooms and to validate registrations.
-- ===========================================================================

create table if not exists public.game_accounts (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null references public.games (id) on delete cascade,
  game_uid    text not null check (char_length(btrim(game_uid)) between 3 and 32),
  region      text not null default 'IN',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (player_id, game_id)
);

create index if not exists game_accounts_player_idx on public.game_accounts (player_id);
create index if not exists game_accounts_game_idx on public.game_accounts (game_id);

alter table public.game_accounts enable row level security;

drop policy if exists "game_accounts_own_all" on public.game_accounts;
create policy "game_accounts_own_all"
  on public.game_accounts
  for all
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

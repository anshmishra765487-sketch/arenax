-- ===========================================================================
-- ArenaX · Phase 1 · 02 games
-- Static catalogue of supported publishers/games. Read-only for clients.
-- ===========================================================================

create table if not exists public.games (
  id          text primary key,
  name        text not null,
  publisher   text not null,
  short_name  text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.games (id, name, publisher, short_name)
values
  ('bgmi',      'Battlegrounds Mobile India', 'Krafton',    'BGMI'),
  ('freefire',  'Free Fire',                  'Garena',     'Free Fire'),
  ('valorant',  'Valorant',                   'Riot Games', 'Valorant'),
  ('cod_mobile','Call of Duty: Mobile',       'Activision', 'CODM')
on conflict (id) do nothing;

alter table public.games enable row level security;

drop policy if exists "games_select_authenticated" on public.games;
create policy "games_select_authenticated"
  on public.games for select
  to authenticated
  using (true);

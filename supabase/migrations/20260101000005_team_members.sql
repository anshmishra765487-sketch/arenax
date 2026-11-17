-- ===========================================================================
-- ArenaX · Phase 1 · 05 team_members
-- Invite links/codes are added in Phase 2; the table already supports roles.
--
-- NOTE: RLS policies must not query the same table recursively. Membership
-- checks therefore go through SECURITY DEFINER helpers below.
-- ===========================================================================

create table if not exists public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('captain', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (team_id, player_id)
);

create index if not exists team_members_player_idx on public.team_members (player_id);

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.player_id = auth.uid()
  );
$$;

create or replace function public.is_team_captain(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id
      and tm.player_id = auth.uid()
      and tm.role = 'captain'
  );
$$;

-- Keep the helper functions callable by signed-in users only (they leak
-- nothing beyond a boolean for the caller's own membership).
revoke all on function public.is_team_member(uuid) from anon;
revoke all on function public.is_team_captain(uuid) from anon;

alter table public.team_members enable row level security;

drop policy if exists "team_members_select_member" on public.team_members;
create policy "team_members_select_member"
  on public.team_members for select
  using (public.is_team_member(team_id));

-- Only captains can add players directly. Phase 2 adds an invite-code RPC
-- (`join_team_by_code`) so players can join without captain privileges.
drop policy if exists "team_members_insert_captain" on public.team_members;
create policy "team_members_insert_captain"
  on public.team_members for insert
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id and t.captain_id = auth.uid()
    )
  );

drop policy if exists "team_members_delete_captain" on public.team_members;
create policy "team_members_delete_captain"
  on public.team_members for delete
  using (public.is_team_captain(team_id));

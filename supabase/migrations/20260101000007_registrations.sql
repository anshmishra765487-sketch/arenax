-- ===========================================================================
-- ArenaX · Phase 1 · 07 registrations
-- Registration is server-side only:
--   * join_tournament()   — validates status/time/slot/duplicate/game account
--   * cancel_registration() — releases the slot
-- There is deliberately NO insert/update policy on the table, so a client
-- cannot bypass slot limits or write fake registrations.
-- ===========================================================================

create table if not exists public.registrations (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  player_id      uuid not null references public.profiles (id) on delete cascade,
  team_id        uuid references public.teams (id) on delete set null,
  status         text not null default 'confirmed'
                 check (status in ('confirmed', 'waitlisted', 'cancelled')),
  in_game_id     text not null,
  created_at     timestamptz not null default now(),
  unique (tournament_id, player_id)
);

create index if not exists registrations_tournament_idx
  on public.registrations (tournament_id, status);
create index if not exists registrations_player_idx
  on public.registrations (player_id, created_at desc);

alter table public.registrations enable row level security;

drop policy if exists "registrations_select_own" on public.registrations;
create policy "registrations_select_own"
  on public.registrations for select
  using (auth.uid() = player_id);

-- Teammates can see the whole roster entry for a team registration.
drop policy if exists "registrations_select_team" on public.registrations;
create policy "registrations_select_team"
  on public.registrations for select
  using (team_id is not null and public.is_team_member(team_id));

-- Organizers can see registrations for their own tournaments (Phase 4 console).
drop policy if exists "registrations_select_organizer" on public.registrations;
create policy "registrations_select_organizer"
  on public.registrations for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = registrations.tournament_id
        and t.organizer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- join_tournament: the single write path for registration.
-- Returns jsonb { ok: boolean, error: text|null, registration_id?: uuid }
-- ---------------------------------------------------------------------------
create or replace function public.join_tournament(
  p_tournament_id uuid,
  p_team_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_uid   text;
  v_reg   public.registrations%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;                       -- lock the row: no double-booking slots

  if not found then
    return jsonb_build_object('ok', false, 'error', 'tournament_not_found');
  end if;

  if v_tournament.status <> 'upcoming' then
    return jsonb_build_object('ok', false, 'error', 'tournament_not_open');
  end if;

  if now() >= v_tournament.start_time - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'error', 'registration_closed');
  end if;

  if v_tournament.slots_left < 1 then
    return jsonb_build_object('ok', false, 'error', 'no_slots');
  end if;

  -- One active registration per player per tournament.
  if exists (
    select 1 from public.registrations r
    where r.tournament_id = p_tournament_id
      and r.player_id = auth.uid()
      and r.status <> 'cancelled'
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;

  -- The in-game ID used for the custom room comes from the player's verified
  -- game account, never from client input.
  select ga.game_uid into v_uid
  from public.game_accounts ga
  where ga.player_id = auth.uid()
    and ga.game_id = v_tournament.game_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'missing_game_account');
  end if;

  -- Team registration: caller must be the captain of a team for this game.
  if p_team_id is not null then
    if not exists (
      select 1 from public.teams t
      where t.id = p_team_id
        and t.captain_id = auth.uid()
        and t.game_id = v_tournament.game_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'invalid_team');
    end if;
  end if;

  insert into public.registrations (tournament_id, player_id, team_id, status, in_game_id)
  values (p_tournament_id, auth.uid(), p_team_id, 'confirmed', v_uid)
  returning * into v_reg;

  update public.tournaments
  set slots_left = slots_left - 1
  where id = p_tournament_id;

  -- Best-effort in-app notification (push fan-out happens in the edge function
  -- / Phase 2 worker). Never let notification failure break registration.
  begin
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      auth.uid(),
      'registration_confirmed',
      'Registration confirmed',
      'Your free slot is booked. Room details unlock 10 minutes before start.',
      jsonb_build_object('tournament_id', p_tournament_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'error', null, 'registration_id', v_reg.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_registration: releases the slot only before the registration cutoff.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_registration(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_reg public.registrations%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'tournament_not_found');
  end if;

  if now() >= v_tournament.start_time - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'error', 'registration_closed');
  end if;

  select * into v_reg
  from public.registrations
  where tournament_id = p_tournament_id
    and player_id = auth.uid()
    and status = 'confirmed'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_registered');
  end if;

  update public.registrations
  set status = 'cancelled'
  where id = v_reg.id;

  update public.tournaments
  set slots_left = slots_left + 1
  where id = p_tournament_id;

  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

revoke all on function public.join_tournament(uuid, uuid) from anon;
revoke all on function public.cancel_registration(uuid) from anon;
grant execute on function public.join_tournament(uuid, uuid) to authenticated;
grant execute on function public.cancel_registration(uuid) to authenticated;

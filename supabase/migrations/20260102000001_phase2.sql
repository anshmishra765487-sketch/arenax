-- ===========================================================================
-- ArenaX · Phase 2 · registration lifecycle, waitlist, room publishing,
-- push tokens and announcements.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Push tokens (Expo / FCM). One player may have multiple devices.
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('android', 'ios', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_own_all" on public.push_tokens;
create policy "push_tokens_own_all"
  on public.push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Room reveal: revealed_at is derived on the server from the tournament start
-- time. Organizers cannot backdate it to leak rooms early.
-- ---------------------------------------------------------------------------
create or replace function public.set_room_reveal_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
begin
  select start_time into v_start from public.tournaments where id = new.tournament_id;

  if new.room_id is null or length(btrim(new.room_id)) = 0 then
    new.revealed_at := null;
    return new;
  end if;

  -- 10 minutes before start, computed from the tournament row (server clock).
  new.revealed_at := v_start - interval '10 minutes';
  return new;
end;
$$;

drop trigger if exists room_details_set_reveal on public.room_details;
create trigger room_details_set_reveal
  before insert or update on public.room_details
  for each row execute function public.set_room_reveal_time();

-- Cron marker: set once the reveal push/notification fan-out has run.
alter table public.room_details
  add column if not exists reveal_notified_at timestamptz;

-- ---------------------------------------------------------------------------
-- Waitlist-aware registration.
-- * free slot    -> confirmed
-- * tournament full -> waitlisted (never rejected silently)
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
  v_uid text;
  v_reg public.registrations%rowtype;
  v_status text;
  v_position integer;
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

  if v_tournament.status <> 'upcoming' then
    return jsonb_build_object('ok', false, 'error', 'tournament_not_open');
  end if;

  if now() >= v_tournament.start_time - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'error', 'registration_closed');
  end if;

  if exists (
    select 1 from public.registrations r
    where r.tournament_id = p_tournament_id
      and r.player_id = auth.uid()
      and r.status <> 'cancelled'
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;

  select ga.game_uid into v_uid
  from public.game_accounts ga
  where ga.player_id = auth.uid()
    and ga.game_id = v_tournament.game_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'missing_game_account');
  end if;

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

  if v_tournament.slots_left < 1 then
    v_status := 'waitlisted';
  else
    v_status := 'confirmed';
  end if;

  insert into public.registrations (tournament_id, player_id, team_id, status, in_game_id)
  values (p_tournament_id, auth.uid(), p_team_id, v_status, v_uid)
  returning * into v_reg;

  if v_status = 'confirmed' then
    update public.tournaments
    set slots_left = slots_left - 1
    where id = p_tournament_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      auth.uid(),
      'registration_confirmed',
      case when v_status = 'confirmed' then 'Registration confirmed' else 'Added to waitlist' end,
      case
        when v_status = 'confirmed'
          then 'Your free slot is booked. Room details unlock 10 minutes before start.'
        else 'All slots are full. You will be promoted automatically if someone cancels.'
      end,
      jsonb_build_object('tournament_id', p_tournament_id, 'status', v_status)
    );
  exception when others then
    null;
  end;

  if v_status = 'confirmed' then
    v_position := null;
  else
    select count(*) into v_position
    from public.registrations r
    where r.tournament_id = p_tournament_id and r.status = 'waitlisted'
      and r.created_at <= v_reg.created_at;
  end if;

  return jsonb_build_object(
    'ok', true,
    'error', null,
    'status', v_status,
    'waitlist_position', v_position,
    'registration_id', v_reg.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation releases the slot to the first waitlisted player.
-- ---------------------------------------------------------------------------
create or replace function public.promote_waitlisted(p_tournament_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg public.registrations%rowtype;
begin
  select * into v_reg
  from public.registrations
  where tournament_id = p_tournament_id
    and status = 'waitlisted'
  order by created_at asc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  update public.registrations
  set status = 'confirmed'
  where id = v_reg.id;

  begin
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      v_reg.player_id,
      'registration_confirmed',
      'You are in!',
      'A slot opened up and you have been promoted from the waitlist.',
      jsonb_build_object('tournament_id', p_tournament_id)
    );
  exception when others then
    null;
  end;

  return v_reg.id;
end;
$$;

create or replace function public.cancel_registration(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_reg public.registrations%rowtype;
  v_promoted uuid;
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
    and status in ('confirmed', 'waitlisted')
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_registered');
  end if;

  update public.registrations set status = 'cancelled' where id = v_reg.id;

  if v_reg.status = 'confirmed' then
    v_promoted := public.promote_waitlisted(p_tournament_id);
    if v_promoted is null then
      update public.tournaments
      set slots_left = slots_left + 1
      where id = p_tournament_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'error', null, 'promoted', v_promoted);
end;
$$;

-- ---------------------------------------------------------------------------
-- Announcements (organizer broadcast, shown in the tournament lobby).
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 1000),
  created_at     timestamptz not null default now()
);

create index if not exists announcements_tournament_idx
  on public.announcements (tournament_id, created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_registered" on public.announcements;
create policy "announcements_select_registered"
  on public.announcements for select
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = announcements.tournament_id
        and t.organizer_id = auth.uid()
    )
    or exists (
      select 1 from public.registrations r
      where r.tournament_id = announcements.tournament_id
        and r.player_id = auth.uid()
        and r.status in ('confirmed', 'waitlisted')
    )
  );

drop policy if exists "announcements_insert_organizer" on public.announcements;
create policy "announcements_insert_organizer"
  on public.announcements for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.tournaments t
      where t.id = announcements.tournament_id
        and t.organizer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Fan-out helper used by edge functions (service role) when a room is
-- published, a match starts, or a result is published.
-- ---------------------------------------------------------------------------
create or replace function public.notify_tournament_players(
  p_tournament_id uuid,
  p_type text,
  p_title text,
  p_body text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_type not in (
    'registration_confirmed', 'registration_cancelled', 'room_revealed',
    'match_starting', 'result_published', 'dispute_update', 'system'
  ) then
    raise exception 'invalid notification type';
  end if;

  insert into public.notifications (user_id, type, title, body, payload)
  select r.player_id, p_type, p_title, p_body,
         jsonb_build_object('tournament_id', p_tournament_id)
  from public.registrations r
  where r.tournament_id = p_tournament_id
    and r.status = 'confirmed';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_tournament_players(uuid, text, text, text) from anon;
revoke all on function public.promote_waitlisted(uuid) from anon;

-- ===========================================================================
-- ArenaX · Phase 3 · brackets, results, disputes, trust, leaderboards, XP
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Profile columns used by fair play, gamification and registration gates.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists xp integer not null default 0,
  add column if not exists level integer not null default 1,
  add column if not exists trust_score integer not null default 80
    check (trust_score between 0 and 100),
  add column if not exists streak_days integer not null default 0,
  add column if not exists last_login_on date,
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_until timestamptz,
  add column if not exists ban_reason text,
  add column if not exists device_hash text,
  add column if not exists referral_code text unique,
  add column if not exists referred_by uuid references public.profiles (id) on delete set null;

create index if not exists profiles_device_hash_idx on public.profiles (device_hash);
create index if not exists profiles_referral_code_idx on public.profiles (referral_code);

-- ---------------------------------------------------------------------------
-- Tournament format + configurable battle-royale points.
-- ---------------------------------------------------------------------------
alter table public.tournaments
  add column if not exists format text not null default 'battle_royale'
    check (format in ('single_elim', 'double_elim', 'round_robin', 'battle_royale')),
  add column if not exists placement_points jsonb not null default
    '{"1":15,"2":12,"3":10,"4":8,"5":6,"6":5,"7":4,"8":3,"9":2,"10":1}'::jsonb,
  add column if not exists kill_points integer not null default 1
    check (kill_points between 0 and 10),
  add column if not exists bracket_generated_at timestamptz;

-- ---------------------------------------------------------------------------
-- Rounds and matches
-- ---------------------------------------------------------------------------
create table if not exists public.tournament_rounds (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  round_number   integer not null check (round_number > 0),
  name           text not null,
  format         text not null default 'single_elim'
                 check (format in ('single_elim', 'double_elim', 'round_robin', 'battle_royale')),
  status         text not null default 'pending'
                 check (status in ('pending', 'live', 'completed')),
  created_at     timestamptz not null default now(),
  unique (tournament_id, round_number)
);

create table if not exists public.matches (
  id                     uuid primary key default gen_random_uuid(),
  tournament_id          uuid not null references public.tournaments (id) on delete cascade,
  round_id               uuid references public.tournament_rounds (id) on delete cascade,
  match_number           integer not null default 1,
  bracket                text not null default 'winners'
                         check (bracket in ('winners', 'losers', 'grand_final', 'round_robin', 'battle_royale')),
  home_registration_id   uuid references public.registrations (id) on delete set null,
  away_registration_id   uuid references public.registrations (id) on delete set null,
  home_score             integer,
  away_score             integer,
  winner_registration_id uuid references public.registrations (id) on delete set null,
  next_match_id          uuid references public.matches (id) on delete set null,
  next_slot              text check (next_slot in ('home', 'away')),
  loser_goes_to          uuid references public.matches (id) on delete set null,
  status                 text not null default 'pending'
                         check (status in ('pending', 'ready', 'live', 'completed', 'bye', 'disputed')),
  scheduled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists matches_tournament_idx on public.matches (tournament_id, status);
create index if not exists matches_round_idx on public.matches (round_id, match_number);

alter table public.tournament_rounds enable row level security;
alter table public.matches enable row level security;

-- is_tournament_organizer: used by several policies below.
create or replace function public.is_tournament_organizer(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id
      and (t.organizer_id = auth.uid() or public.is_admin())
  );
$$;

drop policy if exists "rounds_select_authenticated" on public.tournament_rounds;
create policy "rounds_select_authenticated"
  on public.tournament_rounds for select to authenticated using (true);

drop policy if exists "rounds_write_organizer" on public.tournament_rounds;
create policy "rounds_write_organizer"
  on public.tournament_rounds for all to authenticated
  using (public.is_tournament_organizer(tournament_id))
  with check (public.is_tournament_organizer(tournament_id));

drop policy if exists "matches_select_authenticated" on public.matches;
create policy "matches_select_authenticated"
  on public.matches for select to authenticated using (true);

drop policy if exists "matches_write_organizer" on public.matches;
create policy "matches_write_organizer"
  on public.matches for all to authenticated
  using (public.is_tournament_organizer(tournament_id))
  with check (public.is_tournament_organizer(tournament_id));

-- ---------------------------------------------------------------------------
-- Result submissions (screenshot evidence; SHA-256 used for reuse detection)
-- ---------------------------------------------------------------------------
create table if not exists public.result_submissions (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments (id) on delete cascade,
  match_id        uuid references public.matches (id) on delete set null,
  submitted_by    uuid not null references public.profiles (id) on delete cascade,
  screenshot_url  text not null,
  screenshot_path text,
  screenshot_hash text,
  claimed_winner  uuid references public.registrations (id) on delete set null,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'flagged')),
  review_notes    text,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists result_submissions_tournament_idx
  on public.result_submissions (tournament_id, status);

alter table public.result_submissions enable row level security;

drop policy if exists "results_select_own_or_organizer" on public.result_submissions;
create policy "results_select_own_or_organizer"
  on public.result_submissions for select to authenticated
  using (
    submitted_by = auth.uid()
    or public.is_tournament_organizer(tournament_id)
  );

drop policy if exists "results_insert_participant" on public.result_submissions;
create policy "results_insert_participant"
  on public.result_submissions for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.registrations r
      where r.tournament_id = result_submissions.tournament_id
        and r.player_id = auth.uid()
        and r.status = 'confirmed'
    )
  );

-- No direct update policy: review goes through review_result().

-- ---------------------------------------------------------------------------
-- Duplicate screenshots are auto-flagged and reported. Reusing another
-- player's evidence is a fair-play violation.
-- ---------------------------------------------------------------------------
create or replace function public.flag_duplicate_screenshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.screenshot_hash is not null and exists (
    select 1 from public.result_submissions rs
    where rs.tournament_id = new.tournament_id
      and rs.screenshot_hash = new.screenshot_hash
      and rs.id <> new.id
  ) then
    new.status := 'flagged';
    new.review_notes := 'Auto-flagged: screenshot hash reused in this tournament.';

    insert into public.reports (reporter_id, reported_id, tournament_id, category, description, status)
    values (
      new.submitted_by,
      new.submitted_by,
      new.tournament_id,
      'duplicate_evidence',
      'Duplicate screenshot hash detected automatically.',
      'open'
    );

    update public.profiles
    set trust_score = greatest(0, trust_score - 5)
    where id = new.submitted_by;
  end if;
  return new;
end;
$$;

drop trigger if exists result_submissions_flag_duplicate on public.result_submissions;
create trigger result_submissions_flag_duplicate
  before insert on public.result_submissions
  for each row execute function public.flag_duplicate_screenshot();

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------create table if not exists public.disputes (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  submission_id  uuid references public.result_submissions (id) on delete set null,
  opened_by      uuid not null references public.profiles (id) on delete cascade,
  reason         text not null check (char_length(reason) between 10 and 2000),
  evidence_url   text,
  status         text not null default 'open'
                 check (status in ('open', 'under_review', 'resolved', 'rejected')),
  resolution     text,
  resolved_by    uuid references public.profiles (id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.disputes enable row level security;

drop policy if exists "disputes_select_participant" on public.disputes;
create policy "disputes_select_participant"
  on public.disputes for select to authenticated
  using (
    opened_by = auth.uid()
    or public.is_tournament_organizer(tournament_id)
    or public.is_admin()
  );

drop policy if exists "disputes_insert_participant" on public.disputes;
create policy "disputes_insert_participant"
  on public.disputes for insert to authenticated
  with check (
    opened_by = auth.uid()
    and exists (
      select 1 from public.registrations r
      where r.tournament_id = disputes.tournament_id
        and r.player_id = auth.uid()
        and r.status = 'confirmed'
    )
  );

-- ---------------------------------------------------------------------------
-- Reports & strikes (anti-cheat)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references public.profiles (id) on delete cascade,
  reported_id    uuid references public.profiles (id) on delete cascade,
  tournament_id  uuid references public.tournaments (id) on delete set null,
  category       text not null
                 check (category in ('cheating', 'teaming', 'harassment', 'duplicate_evidence', 'fake_result', 'other')),
  description    text not null check (char_length(description) between 10 and 2000),
  evidence_url   text,
  status         text not null default 'open'
                 check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  reviewed_by    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "reports_insert_authenticated" on public.reports;
create policy "reports_insert_authenticated"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
  on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.strikes (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  reason      text not null,
  severity    integer not null default 1 check (severity between 1 and 3),
  issued_by   uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.strikes enable row level security;

drop policy if exists "strikes_select_own_or_admin" on public.strikes;
create policy "strikes_select_own_or_admin"
  on public.strikes for select to authenticated
  using (player_id = auth.uid() or public.is_admin());

drop policy if exists "strikes_insert_admin" on public.strikes;
create policy "strikes_insert_admin"
  on public.strikes for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------
create table if not exists public.leaderboards (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('tournament', 'weekly', 'monthly', 'all_time')),
  game_id       text not null references public.games (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete cascade,
  player_id     uuid references public.profiles (id) on delete cascade,
  team_id       uuid references public.teams (id) on delete set null,
  points        integer not null default 0,
  kills         integer not null default 0,
  matches_played integer not null default 0,
  wins          integer not null default 0,
  period_start  date not null default date_trunc('week', now())::date,
  updated_at    timestamptz not null default now(),
  unique (scope, game_id, tournament_id, player_id, period_start)
);

create index if not exists leaderboards_scope_idx
  on public.leaderboards (scope, game_id, points desc);

alter table public.leaderboards enable row level security;

drop policy if exists "leaderboards_select_authenticated" on public.leaderboards;
create policy "leaderboards_select_authenticated"
  on public.leaderboards for select to authenticated using (true);

drop policy if exists "leaderboards_write_service" on public.leaderboards;
create policy "leaderboards_write_service"
  on public.leaderboards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------
create table if not exists public.achievements (
  id           text primary key,
  name         text not null,
  description  text not null,
  icon         text not null default '🏅',
  xp_reward    integer not null default 50,
  created_at   timestamptz not null default now()
);

insert into public.achievements (id, name, description, icon, xp_reward) values
  ('first_win', 'First Win', 'Win your first ArenaX tournament.', '🏆', 100),
  ('ten_matches', '10 Matches', 'Play 10 verified matches.', '🎮', 150),
  ('mvp', 'MVP', 'Top the scoreboard in a tournament.', '⭐', 200),
  ('fair_play', 'Fair Player', 'Complete 20 matches with no strikes.', '🛡️', 150),
  ('daily_3', 'On a Roll', 'Log in 3 days in a row.', '🔥', 50)
on conflict (id) do nothing;

create table if not exists public.user_achievements (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

drop policy if exists "achievements_select_authenticated" on public.achievements;
create policy "achievements_select_authenticated"
  on public.achievements for select to authenticated using (true);

drop policy if exists "achievements_write_admin" on public.achievements;
create policy "achievements_write_admin"
  on public.achievements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user_achievements_select_authenticated" on public.user_achievements;
create policy "user_achievements_select_authenticated"
  on public.user_achievements for select to authenticated using (true);

create or replace function public.grant_achievement(p_user_id uuid, p_achievement_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp integer;
begin
  insert into public.user_achievements (user_id, achievement_id)
  values (p_user_id, p_achievement_id)
  on conflict do nothing;

  if found then
    select xp_reward into v_xp from public.achievements where id = p_achievement_id;
    update public.profiles
    set xp = xp + coalesce(v_xp, 0),
        level = greatest(1, floor((xp + coalesce(v_xp, 0)) / 500) + 1)
    where id = p_user_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reward XP / trust helpers
-- ---------------------------------------------------------------------------
create or replace function public.award_xp(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set xp = greatest(0, xp + p_amount),
      level = greatest(1, floor(greatest(0, xp + p_amount) / 500) + 1)
  where id = p_user_id;
end;
$$;

create or replace function public.adjust_trust(p_user_id uuid, p_delta integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set trust_score = least(100, greatest(0, trust_score + p_delta))
  where id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Daily login (cosmetic XP + streak only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_daily_login()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_streak integer;
  v_reward integer := 10;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_profile from public.profiles where id = auth.uid() for update;

  if v_profile.last_login_on = current_date then
    return jsonb_build_object('ok', true, 'already_claimed', true, 'xp', v_profile.xp);
  end if;

  if v_profile.last_login_on = current_date - 1 then
    v_streak := v_profile.streak_days + 1;
  else
    v_streak := 1;
  end if;

  update public.profiles
  set streak_days = v_streak,
      last_login_on = current_date,
      xp = xp + v_reward,
      level = greatest(1, floor((xp + v_reward) / 500) + 1)
  where id = auth.uid();

  if v_streak >= 3 then
    perform public.grant_achievement(auth.uid(), 'daily_3');
  end if;

  return jsonb_build_object('ok', true, 'already_claimed', false, 'streak', v_streak, 'xp', v_profile.xp + v_reward);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trust gate + ban gate on registration (replaces Phase 2 function).
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
  v_profile public.profiles%rowtype;
  v_uid text;
  v_reg public.registrations%rowtype;
  v_status text;
  v_position integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.is_banned or (v_profile.banned_until is not null and v_profile.banned_until > now()) then
    return jsonb_build_object('ok', false, 'error', 'banned');
  end if;

  if v_profile.trust_score < 60 then
    return jsonb_build_object('ok', false, 'error', 'low_trust');
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

  v_status := case when v_tournament.slots_left < 1 then 'waitlisted' else 'confirmed' end;

  insert into public.registrations (tournament_id, player_id, team_id, status, in_game_id)
  values (p_tournament_id, auth.uid(), p_team_id, v_status, v_uid)
  returning * into v_reg;

  if v_status = 'confirmed' then
    update public.tournaments set slots_left = slots_left - 1 where id = p_tournament_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      auth.uid(),
      'registration_confirmed',
      case when v_status = 'confirmed' then 'Registration confirmed' else 'Added to waitlist' end,
      case when v_status = 'confirmed'
        then 'Your free slot is booked. Room details unlock 10 minutes before start.'
        else 'All slots are full. You will be promoted automatically if someone cancels.'
      end,
      jsonb_build_object('tournament_id', p_tournament_id, 'status', v_status)
    );
  exception when others then null;
  end;

  if v_status = 'waitlisted' then
    select count(*) into v_position
    from public.registrations r
    where r.tournament_id = p_tournament_id
      and r.status = 'waitlisted'
      and r.created_at <= v_reg.created_at;
  end if;

  return jsonb_build_object(
    'ok', true, 'error', null, 'status', v_status,
    'waitlist_position', v_position, 'registration_id', v_reg.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Auto-advance bracket after a match result.
-- ---------------------------------------------------------------------------
create or replace function public.advance_bracket(
  p_match_id uuid,
  p_winner_registration_id uuid,
  p_home_score integer default null,
  p_away_score integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_loser uuid;
  v_next public.matches%rowtype;
begin
  if not public.is_tournament_organizer((select tournament_id from public.matches where id = p_match_id)) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'match_not_found');
  end if;

  if p_winner_registration_id not in (v_match.home_registration_id, v_match.away_registration_id) then
    return jsonb_build_object('ok', false, 'error', 'winner_not_in_match');
  end if;

  v_loser := case
    when p_winner_registration_id = v_match.home_registration_id then v_match.away_registration_id
    else v_match.home_registration_id
  end;

  update public.matches
  set winner_registration_id = p_winner_registration_id,
      home_score = coalesce(p_home_score, home_score),
      away_score = coalesce(p_away_score, away_score),
      status = 'completed',
      updated_at = now()
  where id = p_match_id;

  if v_match.next_match_id is not null then
    update public.matches
    set home_registration_id = case when v_match.next_slot = 'home' then p_winner_registration_id else home_registration_id end,
        away_registration_id = case when v_match.next_slot = 'away' then p_winner_registration_id else away_registration_id end,
        status = 'ready',
        updated_at = now()
    where id = v_match.next_match_id;
  end if;

  if v_match.loser_goes_to is not null and v_loser is not null then
    update public.matches
    set home_registration_id = coalesce(home_registration_id, v_loser),
        away_registration_id = case when home_registration_id is not null then v_loser else away_registration_id end,
        status = 'ready',
        updated_at = now()
    where id = v_match.loser_goes_to;
  end if;

  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Publish a battle-royale result and update leaderboards + XP.
-- p_entries: [{"registration_id": "...", "placement": 1, "kills": 5}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.publish_br_result(
  p_tournament_id uuid,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_entry jsonb;
  v_points integer;
  v_kills integer;
  v_placement integer;
  v_player uuid;
  v_count integer := 0;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_placement := coalesce((v_entry ->> 'placement')::integer, 999);
    v_kills := greatest(0, coalesce((v_entry ->> 'kills')::integer, 0));

    select r.player_id into v_player
    from public.registrations r
    where r.id = (v_entry ->> 'registration_id')::uuid
      and r.status = 'confirmed';

    if v_player is null then
      continue;
    end if;

    v_points := coalesce((v_tournament.placement_points ->> v_placement::text)::integer, 0)
                + v_kills * v_tournament.kill_points;

    insert into public.leaderboards
      (scope, game_id, tournament_id, player_id, points, kills, matches_played, wins, period_start)
    values
      ('tournament', v_tournament.game_id, p_tournament_id, v_player, v_points, v_kills, 1,
       case when v_placement = 1 then 1 else 0 end, current_date)
    on conflict (scope, game_id, tournament_id, player_id, period_start)
    do update set
      points = public.leaderboards.points + excluded.points,
      kills = public.leaderboards.kills + excluded.kills,
      matches_played = public.leaderboards.matches_played + 1,
      wins = public.leaderboards.wins + excluded.wins,
      updated_at = now();

    perform public.award_xp(v_player, 25 + case when v_placement <= 3 then 50 else 0 end);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'error', null, 'entries', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizer reviews a submitted screenshot.
-- ---------------------------------------------------------------------------
create or replace function public.review_result(
  p_submission_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.result_submissions%rowtype;
begin
  select * into v_sub from public.result_submissions where id = p_submission_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'submission_not_found');
  end if;

  if not public.is_tournament_organizer(v_sub.tournament_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.result_submissions
  set status = case when p_approve then 'approved' else 'rejected' end,
      review_notes = p_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  if p_approve then
    perform public.award_xp(v_sub.submitted_by, 40);
    perform public.grant_achievement(v_sub.submitted_by, 'fair_play');
  else
    perform public.adjust_trust(v_sub.submitted_by, -3);
  end if;

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    v_sub.submitted_by,
    'result_published',
    case when p_approve then 'Result approved' else 'Result rejected' end,
    coalesce(p_notes, 'Your submitted result was reviewed by the organizer.'),
    jsonb_build_object('submission_id', p_submission_id, 'tournament_id', v_sub.tournament_id)
  );

  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

revoke all on function public.advance_bracket(uuid, uuid, integer, integer) from anon;
revoke all on function public.publish_br_result(uuid, jsonb) from anon;
revoke all on function public.review_result(uuid, boolean, text) from anon;
revoke all on function public.claim_daily_login() from anon;

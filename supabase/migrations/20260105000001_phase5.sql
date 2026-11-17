-- ===========================================================================
-- ArenaX · Phase 5 · sponsors, rewarded ads, VIP subscriptions, rate limits
-- Prizes are sponsor-funded. No wallet, no entry fee, no cash-out.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Sponsors
-- ---------------------------------------------------------------------------
create table if not exists public.sponsors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 2 and 80),
  logo_url       text,
  website_url    text,
  description    text check (char_length(description) <= 500),
  contact_email  text,
  active         boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.sponsor_tournaments (
  sponsor_id      uuid not null references public.sponsors (id) on delete cascade,
  tournament_id   uuid not null references public.tournaments (id) on delete cascade,
  banner_url      text,
  contribution_note text check (char_length(contribution_note) <= 300),
  impressions     integer not null default 0,
  clicks          integer not null default 0,
  registrations   integer not null default 0,
  created_at      timestamptz not null default now(),
  primary key (sponsor_id, tournament_id)
);

create table if not exists public.sponsor_events (
  id             uuid primary key default gen_random_uuid(),
  sponsor_id     uuid not null references public.sponsors (id) on delete cascade,
  tournament_id  uuid references public.tournaments (id) on delete cascade,
  event_type     text not null check (event_type in ('impression', 'click', 'registration')),
  user_id        uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists sponsor_events_sponsor_idx
  on public.sponsor_events (sponsor_id, created_at desc);

alter table public.sponsors enable row level security;
alter table public.sponsor_tournaments enable row level security;
alter table public.sponsor_events enable row level security;

drop policy if exists "sponsors_select_active" on public.sponsors;
create policy "sponsors_select_active"
  on public.sponsors for select to authenticated using (true);

drop policy if exists "sponsors_admin_write" on public.sponsors;
create policy "sponsors_admin_write"
  on public.sponsors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sponsor_tournaments_select" on public.sponsor_tournaments;
create policy "sponsor_tournaments_select"
  on public.sponsor_tournaments for select to authenticated using (true);

drop policy if exists "sponsor_tournaments_admin_write" on public.sponsor_tournaments;
create policy "sponsor_tournaments_admin_write"
  on public.sponsor_tournaments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sponsor_events_select_admin" on public.sponsor_events;
create policy "sponsor_events_select_admin"
  on public.sponsor_events for select to authenticated using (public.is_admin());

drop policy if exists "sponsor_events_insert_authenticated" on public.sponsor_events;
create policy "sponsor_events_insert_authenticated"
  on public.sponsor_events for insert to authenticated
  with check (auth.uid() is not null);

create or replace function public.track_sponsor_event(
  p_sponsor_id uuid,
  p_tournament_id uuid,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event not in ('impression', 'click', 'registration') then
    raise exception 'invalid event type';
  end if;

  insert into public.sponsor_events (sponsor_id, tournament_id, event_type, user_id)
  values (p_sponsor_id, p_tournament_id, p_event, auth.uid());

  if p_event = 'impression' then
    update public.sponsor_tournaments
    set impressions = impressions + 1
    where sponsor_id = p_sponsor_id and tournament_id = p_tournament_id;
  elsif p_event = 'click' then
    update public.sponsor_tournaments
    set clicks = clicks + 1
    where sponsor_id = p_sponsor_id and tournament_id = p_tournament_id;
  elsif p_event = 'registration' then
    update public.sponsor_tournaments
    set registrations = registrations + 1
    where sponsor_id = p_sponsor_id and tournament_id = p_tournament_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rewarded ad claims. Rewards are verified server-side by the AdMob SSV
-- callback; the client can never mark a claim as rewarded.
-- ---------------------------------------------------------------------------
create table if not exists public.ad_reward_claims (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  tournament_id   uuid not null references public.tournaments (id) on delete cascade,
  provider        text not null default 'admob' check (provider in ('admob', 'test')),
  transaction_id  text unique,
  status          text not null default 'requested'
                  check (status in ('requested', 'rewarded', 'redeemed', 'expired', 'rejected')),
  reward_amount   integer,
  created_at      timestamptz not null default now(),
  rewarded_at     timestamptz,
  redeemed_at     timestamptz
);

create index if not exists ad_reward_claims_user_idx
  on public.ad_reward_claims (user_id, created_at desc);

alter table public.ad_reward_claims enable row level security;

drop policy if exists "ad_claims_select_own" on public.ad_reward_claims;
create policy "ad_claims_select_own"
  on public.ad_reward_claims for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Inserts/updates happen through edge functions with the service role.

create or replace function public.redeem_ad_reward(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.ad_reward_claims%rowtype;
  v_tournament public.tournaments%rowtype;
  v_profile public.profiles%rowtype;
  v_uid text;
  v_reg public.registrations%rowtype;
  v_today integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_claim from public.ad_reward_claims
  where id = p_claim_id and user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'claim_not_found');
  end if;
  if v_claim.status <> 'rewarded' then
    return jsonb_build_object('ok', false, 'error', 'reward_not_verified');
  end if;
  if v_claim.created_at < now() - interval '30 minutes' then
    update public.ad_reward_claims set status = 'expired' where id = p_claim_id;
    return jsonb_build_object('ok', false, 'error', 'claim_expired');
  end if;

  select count(*) into v_today
  from public.ad_reward_claims
  where user_id = auth.uid()
    and status = 'redeemed'
    and redeemed_at >= current_date;

  if v_today >= 3 then
    return jsonb_build_object('ok', false, 'error', 'daily_limit_reached');
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.is_banned then
    return jsonb_build_object('ok', false, 'error', 'banned');
  end if;

  select * into v_tournament from public.tournaments
  where id = v_claim.tournament_id
  for update;

  if v_tournament.status <> 'upcoming'
     or now() >= v_tournament.start_time - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'error', 'registration_closed');
  end if;

  if v_tournament.slots_left < 1 then
    return jsonb_build_object('ok', false, 'error', 'no_slots');
  end if;

  if exists (
    select 1 from public.registrations r
    where r.tournament_id = v_tournament.id
      and r.player_id = auth.uid()
      and r.status <> 'cancelled'
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;

  select ga.game_uid into v_uid
  from public.game_accounts ga
  where ga.player_id = auth.uid() and ga.game_id = v_tournament.game_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'missing_game_account');
  end if;

  insert into public.registrations (tournament_id, player_id, status, in_game_id)
  values (v_tournament.id, auth.uid(), 'confirmed', v_uid)
  returning * into v_reg;

  update public.tournaments set slots_left = slots_left - 1 where id = v_tournament.id;
  update public.ad_reward_claims
  set status = 'redeemed', redeemed_at = now()
  where id = p_claim_id;

  return jsonb_build_object('ok', true, 'error', null, 'registration_id', v_reg.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- VIP subscriptions (Google Play Billing). Cosmetic/convenience only.
-- No payment instrument data is ever stored — only Play's purchase token.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  plan            text not null check (plan in ('vip_monthly', 'vip_yearly')),
  provider        text not null default 'google_play' check (provider in ('google_play', 'test')),
  purchase_token  text not null,
  order_id        text,
  status          text not null default 'pending'
                  check (status in ('pending', 'active', 'expired', 'cancelled')),
  auto_renewing   boolean not null default true,
  started_at      timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, purchase_token)
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.is_vip(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and s.status = 'active'
      and (s.expires_at is null or s.expires_at > now())
  );
$$;

-- ---------------------------------------------------------------------------
-- Simple persistent rate limiter for edge functions (service role calls it).
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key           text primary key,
  count         integer not null default 0,
  window_start  timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limits%rowtype;
begin
  select * into v_row from public.rate_limits where key = p_key for update;

  if not found then
    insert into public.rate_limits (key, count, window_start) values (p_key, 1, now());
    return true;
  end if;

  if v_row.window_start < now() - make_interval(secs => p_window_seconds) then
    update public.rate_limits set count = 1, window_start = now() where key = p_key;
    return true;
  end if;

  if v_row.count >= p_max then
    return false;
  end if;

  update public.rate_limits set count = count + 1 where key = p_key;
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from anon, authenticated;

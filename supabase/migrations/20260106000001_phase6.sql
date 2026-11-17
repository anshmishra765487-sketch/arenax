-- ===========================================================================
-- ArenaX · Phase 6 · chat, clips, scrims, referrals, live streams
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- In-app match chat with moderation
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 500),
  is_announcement boolean not null default false,
  is_deleted     boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists chat_messages_tournament_idx
  on public.chat_messages (tournament_id, created_at desc);

create table if not exists public.chat_mutes (
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  muted_until    timestamptz not null,
  muted_by       uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

alter table public.chat_messages enable row level security;
alter table public.chat_mutes enable row level security;

drop policy if exists "chat_select_participants" on public.chat_messages;
create policy "chat_select_participants"
  on public.chat_messages for select to authenticated
  using (
    not is_deleted
    and (
      public.is_tournament_organizer(tournament_id)
      or exists (
        select 1 from public.registrations r
        where r.tournament_id = chat_messages.tournament_id
          and r.player_id = auth.uid()
          and r.status in ('confirmed', 'waitlisted')
      )
    )
  );

drop policy if exists "chat_mutes_select_own" on public.chat_mutes;
create policy "chat_mutes_select_own"
  on public.chat_mutes for select to authenticated
  using (user_id = auth.uid() or public.is_tournament_organizer(tournament_id));

-- Server-side filter (the client also filters for UX).
create or replace function public.chat_filter(p_body text)
returns text
language plpgsql
immutable
as $$
declare
  v_body text := p_body;
  v_word text;
  v_blocked text[] := array[
    'idiot', 'stupid', 'noob', 'trash', 'hacker', 'cheat', 'scam',
    'madarchod', 'bhosdi', 'gandu', 'chutiya'
  ];
begin
  foreach v_word in array v_blocked loop
    v_body := regexp_replace(v_body, '\m' || v_word || '\M', repeat('*', length(v_word)), 'gi');
  end loop;
  return v_body;
end;
$$;

create or replace function public.send_chat_message(
  p_tournament_id uuid,
  p_body text,
  p_is_announcement boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_organizer boolean;
  v_is_registered boolean;
  v_muted boolean;
  v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if length(btrim(p_body)) < 1 or length(p_body) > 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid_message');
  end if;

  v_is_organizer := public.is_tournament_organizer(p_tournament_id);
  v_is_registered := exists (
    select 1 from public.registrations r
    where r.tournament_id = p_tournament_id
      and r.player_id = auth.uid()
      and r.status in ('confirmed', 'waitlisted')
  );

  if not v_is_organizer and not v_is_registered then
    return jsonb_build_object('ok', false, 'error', 'not_a_participant');
  end if;

  if p_is_announcement and not v_is_organizer then
    return jsonb_build_object('ok', false, 'error', 'announcement_forbidden');
  end if;

  select exists (
    select 1 from public.chat_mutes m
    where m.tournament_id = p_tournament_id
      and m.user_id = auth.uid()
      and m.muted_until > now()
  ) into v_muted;

  if v_muted then
    return jsonb_build_object('ok', false, 'error', 'muted');
  end if;

  insert into public.chat_messages (tournament_id, user_id, body, is_announcement)
  values (p_tournament_id, auth.uid(), public.chat_filter(p_body), p_is_announcement)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'error', null, 'message_id', v_id);
end;
$$;

create or replace function public.mute_chat_user(
  p_tournament_id uuid,
  p_user_id uuid,
  p_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.chat_mutes (tournament_id, user_id, muted_until, muted_by)
  values (p_tournament_id, p_user_id, now() + make_interval(mins => p_minutes), auth.uid())
  on conflict (tournament_id, user_id)
  do update set muted_until = now() + make_interval(mins => p_minutes), muted_by = auth.uid();

  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Highlights & clips
-- ---------------------------------------------------------------------------
create table if not exists public.clips (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments (id) on delete set null,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  video_url     text not null,
  thumbnail_url text,
  caption       text check (char_length(caption) <= 200),
  likes_count   integer not null default 0,
  status        text not null default 'approved'
                check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now()
);

create table if not exists public.clip_likes (
  clip_id    uuid not null references public.clips (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);

alter table public.clips enable row level security;
alter table public.clip_likes enable row level security;

drop policy if exists "clips_select_approved" on public.clips;
create policy "clips_select_approved"
  on public.clips for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());

drop policy if exists "clips_insert_own" on public.clips;
create policy "clips_insert_own"
  on public.clips for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "clips_admin_moderate" on public.clips;
create policy "clips_admin_moderate"
  on public.clips for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "clip_likes_select" on public.clip_likes;
create policy "clip_likes_select"
  on public.clip_likes for select to authenticated using (true);

create or replace function public.toggle_clip_like(p_clip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liked boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select exists (
    select 1 from public.clip_likes where clip_id = p_clip_id and user_id = auth.uid()
  ) into v_liked;

  if v_liked then
    delete from public.clip_likes where clip_id = p_clip_id and user_id = auth.uid();
    update public.clips set likes_count = greatest(0, likes_count - 1) where id = p_clip_id;
  else
    insert into public.clip_likes (clip_id, user_id) values (p_clip_id, auth.uid())
    on conflict do nothing;
    update public.clips set likes_count = likes_count + 1 where id = p_clip_id;
  end if;

  return jsonb_build_object('ok', true, 'error', null, 'liked', not v_liked);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scrim finder (practice matches between teams)
-- ---------------------------------------------------------------------------
create table if not exists public.scrims (
  id            uuid primary key default gen_random_uuid(),
  posted_by     uuid not null references public.profiles (id) on delete cascade,
  game_id       text not null references public.games (id) on delete cascade,
  team_name     text not null check (char_length(team_name) between 2 and 40),
  description   text check (char_length(description) <= 500),
  scheduled_at  timestamptz not null,
  slots         integer not null default 1 check (slots between 1 and 10),
  status        text not null default 'open'
                check (status in ('open', 'matched', 'cancelled', 'completed')),
  created_at    timestamptz not null default now()
);

create table if not exists public.scrim_applications (
  scrim_id   uuid not null references public.scrims (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  message    text check (char_length(message) <= 300),
  status     text not null default 'pending'
             check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (scrim_id, applicant_id)
);

alter table public.scrims enable row level security;
alter table public.scrim_applications enable row level security;

drop policy if exists "scrims_select_authenticated" on public.scrims;
create policy "scrims_select_authenticated"
  on public.scrims for select to authenticated using (true);

drop policy if exists "scrims_write_own" on public.scrims;
create policy "scrims_write_own"
  on public.scrims for all to authenticated
  using (posted_by = auth.uid()) with check (posted_by = auth.uid());

drop policy if exists "scrim_apps_select_involved" on public.scrim_applications;
create policy "scrim_apps_select_involved"
  on public.scrim_applications for select to authenticated
  using (
    applicant_id = auth.uid()
    or exists (
      select 1 from public.scrims s
      where s.id = scrim_applications.scrim_id and s.posted_by = auth.uid()
    )
  );

drop policy if exists "scrim_apps_insert_own" on public.scrim_applications;
create policy "scrim_apps_insert_own"
  on public.scrim_applications for insert to authenticated
  with check (applicant_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Referrals (cosmetic XP only — no cash value)
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references public.profiles (id) on delete cascade,
  referred_id  uuid not null unique references public.profiles (id) on delete cascade,
  code         text not null,
  status       text not null default 'completed' check (status in ('pending', 'completed')),
  rewarded_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (referrer_id <> referred_id)
);

alter table public.referrals enable row level security;

drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own"
  on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());

-- Auto-generate a referral code for every new profile.
create or replace function public.assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := 'AX' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_referral on public.profiles;
create trigger profiles_assign_referral
  before insert on public.profiles
  for each row execute function public.assign_referral_code();

create or replace function public.redeem_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer public.profiles%rowtype;
  v_me public.profiles%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_me from public.profiles where id = auth.uid();

  if v_me.referred_by is not null then
    return jsonb_build_object('ok', false, 'error', 'already_referred');
  end if;

  select * into v_referrer from public.profiles where referral_code = upper(btrim(p_code));

  if not found or v_referrer.id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.profiles set referred_by = v_referrer.id where id = auth.uid();

  insert into public.referrals (referrer_id, referred_id, code, status, rewarded_at)
  values (v_referrer.id, auth.uid(), upper(btrim(p_code)), 'completed', now())
  on conflict (referred_id) do nothing;

  perform public.award_xp(v_referrer.id, 75);
  perform public.award_xp(auth.uid(), 75);

  return jsonb_build_object('ok', true, 'error', null, 'xp', 75);
end;
$$;

-- ---------------------------------------------------------------------------
-- Live stream hub
-- ---------------------------------------------------------------------------
create table if not exists public.streams (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  title          text not null,
  platform       text not null default 'youtube' check (platform in ('youtube', 'loco', 'twitch', 'other')),
  url            text not null,
  starts_at      timestamptz,
  is_live        boolean not null default false,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.streams enable row level security;

drop policy if exists "streams_select_authenticated" on public.streams;
create policy "streams_select_authenticated"
  on public.streams for select to authenticated using (true);

drop policy if exists "streams_write_organizer" on public.streams;
create policy "streams_write_organizer"
  on public.streams for all to authenticated
  using (public.is_tournament_organizer(tournament_id))
  with check (public.is_tournament_organizer(tournament_id));

revoke all on function public.send_chat_message(uuid, text, boolean) from anon;
revoke all on function public.toggle_clip_like(uuid) from anon;
revoke all on function public.redeem_referral(text) from anon;

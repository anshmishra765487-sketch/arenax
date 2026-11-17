-- ===========================================================================
-- ArenaX · Phase 4 · admin & organizer console policies + moderation RPCs
-- Admins hold the only keys to bans, role approvals and final dispute rulings.
-- ===========================================================================

create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

drop policy if exists "audit_select_admin" on public.admin_audit_log;
create policy "audit_select_admin"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Admin read/write policies
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select to authenticated
  using (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tournaments_select_admin" on public.tournaments;
create policy "tournaments_select_admin"
  on public.tournaments for select to authenticated
  using (public.is_admin());

drop policy if exists "tournaments_update_admin" on public.tournaments;
create policy "tournaments_update_admin"
  on public.tournaments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "registrations_select_admin" on public.registrations;
create policy "registrations_select_admin"
  on public.registrations for select to authenticated
  using (public.is_admin());

drop policy if exists "results_select_admin" on public.result_submissions;
create policy "results_select_admin"
  on public.result_submissions for select to authenticated
  using (public.is_admin());

drop policy if exists "disputes_update_reviewer" on public.disputes;
create policy "disputes_update_reviewer"
  on public.disputes for update to authenticated
  using (public.is_tournament_organizer(tournament_id) or public.is_admin())
  with check (public.is_tournament_organizer(tournament_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Moderation RPCs
-- ---------------------------------------------------------------------------
create or replace function public.log_admin_action(
  p_action text,
  p_target uuid,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit_log (admin_id, action, target_id, detail)
  values (auth.uid(), p_action, p_target, p_detail);
$$;

create or replace function public.ban_user(
  p_user_id uuid,
  p_reason text,
  p_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'cannot_ban_self');
  end if;

  update public.profiles
  set is_banned = case when p_days is null then true else false end,
      banned_until = case when p_days is null then null else now() + make_interval(days => p_days) end,
      ban_reason = p_reason,
      trust_score = 0
  where id = p_user_id;

  perform public.log_admin_action(
    case when p_days is null then 'ban_user' else 'suspend_user' end,
    p_user_id,
    jsonb_build_object('reason', p_reason, 'days', p_days)
  );

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    p_user_id,
    'system',
    case when p_days is null then 'Account permanently banned' else 'Account suspended' end,
    p_reason,
    jsonb_build_object('days', p_days)
  );

  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

create or replace function public.unban_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.profiles
  set is_banned = false,
      banned_until = null,
      ban_reason = null,
      trust_score = 80
  where id = p_user_id;

  perform public.log_admin_action('unban_user', p_user_id);
  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

create or replace function public.issue_strike(
  p_player_id uuid,
  p_reason text,
  p_severity integer default 1,
  p_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.strikes (player_id, reason, severity, issued_by, expires_at)
  values (
    p_player_id,
    p_reason,
    least(3, greatest(1, p_severity)),
    auth.uid(),
    case when p_days is null then null else now() + make_interval(days => p_days) end
  );

  perform public.adjust_trust(p_player_id, -10 * least(3, greatest(1, p_severity)));

  select count(*) into v_active
  from public.strikes
  where player_id = p_player_id
    and (expires_at is null or expires_at > now());

  if v_active >= 3 then
    perform public.ban_user(p_player_id, 'Automatic ban after 3 active strikes', null);
  end if;

  perform public.log_admin_action(
    'issue_strike',
    p_player_id,
    jsonb_build_object('reason', p_reason, 'severity', p_severity)
  );

  return jsonb_build_object('ok', true, 'error', null, 'active_strikes', v_active);
end;
$$;

create or replace function public.approve_organizer(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.profiles set role = 'organizer' where id = p_user_id;

  perform public.log_admin_action('approve_organizer', p_user_id);
  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

create or replace function public.resolve_dispute(
  p_dispute_id uuid,
  p_status text,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.disputes%rowtype;
begin
  if p_status not in ('resolved', 'rejected', 'under_review') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'dispute_not_found');
  end if;

  if not public.is_admin() and not public.is_tournament_organizer(v_dispute.tournament_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.disputes
  set status = p_status,
      resolution = p_resolution,
      resolved_by = auth.uid(),
      resolved_at = now()
  where id = p_dispute_id;

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    v_dispute.opened_by,
    'dispute_update',
    'Dispute updated',
    p_resolution,
    jsonb_build_object('dispute_id', p_dispute_id, 'status', p_status)
  );

  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

create or replace function public.resolve_report(
  p_report_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_status not in ('resolved', 'dismissed', 'under_review') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  update public.reports
  set status = p_status, reviewed_by = auth.uid()
  where id = p_report_id;

  perform public.log_admin_action('resolve_report', p_report_id, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'banned_users', (select count(*) from public.profiles where is_banned),
    'organizers', (select count(*) from public.profiles where role = 'organizer'),
    'tournaments', (select count(*) from public.tournaments),
    'live_tournaments', (select count(*) from public.tournaments where status = 'live'),
    'registrations', (select count(*) from public.registrations where status = 'confirmed'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'open_disputes', (select count(*) from public.disputes where status = 'open'),
    'pending_results', (select count(*) from public.result_submissions where status = 'pending'),
    'active_vip', (
      select count(*) from public.subscriptions
      where status = 'active' and (expires_at is null or expires_at > now())
    )
  );
$$;

revoke all on function public.ban_user(uuid, text, integer) from anon;
revoke all on function public.issue_strike(uuid, text, integer, integer) from anon;
revoke all on function public.approve_organizer(uuid) from anon;
revoke all on function public.resolve_dispute(uuid, text, text) from anon;
revoke all on function public.resolve_report(uuid, text) from anon;
revoke all on function public.admin_dashboard_stats() from anon;

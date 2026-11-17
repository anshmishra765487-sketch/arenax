-- ===========================================================================
-- ArenaX · Phase 6 · privilege hardening
-- Postgres grants EXECUTE to PUBLIC by default. Lock down server-only RPCs so
-- they cannot be called from the anon/authenticated PostgREST roles.
-- ===========================================================================

-- Server/trigger-only functions
revoke all on function public.promote_waitlisted(uuid) from public, anon, authenticated;
revoke all on function public.notify_tournament_players(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.award_xp(uuid, integer) from public, anon, authenticated;
revoke all on function public.adjust_trust(uuid, integer) from public, anon, authenticated;
revoke all on function public.grant_achievement(uuid, text) from public, anon, authenticated;
revoke all on function public.log_admin_action(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.flag_duplicate_screenshot() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_room_reveal_time() from public, anon, authenticated;
revoke all on function public.assign_referral_code() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

grant execute on function public.promote_waitlisted(uuid) to service_role;
grant execute on function public.notify_tournament_players(uuid, text, text, text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.award_xp(uuid, integer) to service_role;
grant execute on function public.adjust_trust(uuid, integer) to service_role;
grant execute on function public.grant_achievement(uuid, text) to service_role;
grant execute on function public.log_admin_action(text, uuid, jsonb) to service_role;

-- Player-facing functions: authenticated only.
do $$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'join_tournament', 'cancel_registration', 'redeem_ad_reward',
        'claim_daily_login', 'send_chat_message', 'mute_chat_user',
        'toggle_clip_like', 'redeem_referral', 'review_result',
        'publish_br_result', 'advance_bracket', 'resolve_dispute',
        'resolve_report', 'ban_user', 'unban_user', 'issue_strike',
        'approve_organizer', 'admin_dashboard_stats', 'is_vip',
        'is_tournament_organizer', 'is_admin', 'is_team_member',
        'is_team_captain', 'is_registration_open'
      )
  loop
    execute format('revoke all on function %s from public, anon', v_fn.signature);
    execute format('grant execute on function %s to authenticated', v_fn.signature);
  end loop;
end $$;

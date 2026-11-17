-- ===========================================================================
-- ArenaX · Phase 6 · public profile view
-- Profiles remain private (own row only). This view intentionally exposes a
-- safe subset for leaderboards, teams, chat and clip authorship.
-- ===========================================================================

create or replace view public.public_profiles as
select
  id,
  username,
  display_name,
  avatar_url,
  level,
  xp,
  trust_score,
  role,
  created_at
from public.profiles;

comment on view public.public_profiles is
  'Public-safe profile projection (no phone, no ban reason, no device hash).';

grant select on public.public_profiles to authenticated;

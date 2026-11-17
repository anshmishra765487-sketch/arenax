-- ===========================================================================
-- ArenaX · Phase 1 · 08 room_details
-- The room ID/password is the most sensitive data in the app.
-- Visibility rule (enforced by RLS on the SERVER clock, not client time):
--   * registered (confirmed) players
--   * only when revealed_at is set AND now() >= revealed_at
--   * the tournament organizer can always see/manage their own room
-- Organizers publish via an edge function (Phase 2) which stamps revealed_at
-- at start_time - 10 minutes and fans out a push notification.
-- ===========================================================================

create table if not exists public.room_details (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null unique references public.tournaments (id) on delete cascade,
  room_id        text check (char_length(room_id) <= 64),
  room_password  text check (char_length(room_password) <= 64),
  revealed_at    timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.room_details enable row level security;

drop policy if exists "room_details_select_revealed" on public.room_details;
create policy "room_details_select_revealed"
  on public.room_details for select
  to authenticated
  using (
    revealed_at is not null
    and now() >= revealed_at
    and exists (
      select 1
      from public.tournaments t
      join public.registrations r
        on r.tournament_id = t.id
      where t.id = room_details.tournament_id
        and r.player_id = auth.uid()
        and r.status = 'confirmed'
    )
  );

drop policy if exists "room_details_select_organizer" on public.room_details;
create policy "room_details_select_organizer"
  on public.room_details for select
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = room_details.tournament_id
        and t.organizer_id = auth.uid()
    )
  );

drop policy if exists "room_details_insert_organizer" on public.room_details;
create policy "room_details_insert_organizer"
  on public.room_details for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = room_details.tournament_id
        and t.organizer_id = auth.uid()
    )
  );

drop policy if exists "room_details_update_organizer" on public.room_details;
create policy "room_details_update_organizer"
  on public.room_details for update
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = room_details.tournament_id
        and t.organizer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = room_details.tournament_id
        and t.organizer_id = auth.uid()
    )
  );

-- Admins may audit room sharing (service role already bypasses RLS; this keeps
-- the policy explicit for future admin-scoped tokens).
drop policy if exists "room_details_select_admin" on public.room_details;
create policy "room_details_select_admin"
  on public.room_details for select
  to authenticated
  using (public.is_admin());

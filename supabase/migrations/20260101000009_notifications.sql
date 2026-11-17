-- ===========================================================================
-- ArenaX · Phase 1 · 09 notifications
-- In-app inbox now; Expo push tokens + FCM fan-out arrive in Phase 2.
-- Clients may read and mark their own notifications as read, but cannot
-- create arbitrary ones (server/edge functions use the service role).
-- ===========================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (type in (
                'registration_confirmed',
                'registration_cancelled',
                'room_revealed',
                'match_starting',
                'result_published',
                'dispute_update',
                'system'
              )),
  title       text not null check (char_length(title) <= 120),
  body        text not null check (char_length(body) <= 500),
  read        boolean not null default false,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime inbox updates (Supabase Realtime respects RLS).
-- Wrapped so the migration also succeeds on a project without the default
-- `supabase_realtime` publication.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

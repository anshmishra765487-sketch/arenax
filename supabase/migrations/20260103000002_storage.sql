-- ===========================================================================
-- ArenaX · Phase 3 · Storage buckets & policies
-- Private evidence bucket (screenshots) and public media buckets.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidence', 'evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('clips', 'clips', true, 26214400, array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Evidence: uploads must live under the uploader's uid folder
-- (e.g. evidence/<uuid>/score.png). Reads are limited to the uploader,
-- organizers and admins.
drop policy if exists "evidence_insert_own" on storage.objects;
create policy "evidence_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "evidence_select_trusted" on storage.objects;
create policy "evidence_select_trusted"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('organizer', 'admin')
      )
      or public.is_admin()
    )
  );

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "clips_public_read" on storage.objects;
create policy "clips_public_read"
  on storage.objects for select
  using (bucket_id = 'clips');

drop policy if exists "clips_insert_own" on storage.objects;
create policy "clips_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'clips'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

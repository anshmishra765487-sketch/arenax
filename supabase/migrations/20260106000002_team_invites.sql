-- ===========================================================================
-- ArenaX · Phase 6 · team invite codes
-- ===========================================================================

alter table public.teams
  add column if not exists invite_code text unique,
  add column if not exists max_members integer not null default 5
    check (max_members between 1 and 10);

update public.teams
set invite_code = 'AXT' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where invite_code is null;

alter table public.teams alter column invite_code set default
  ('AXT' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)));

create or replace function public.join_team_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_count integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_team from public.teams where invite_code = upper(btrim(p_code));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select count(*) into v_count from public.team_members where team_id = v_team.id;
  if v_count >= v_team.max_members then
    return jsonb_build_object('ok', false, 'error', 'team_full');
  end if;

  if exists (
    select 1 from public.team_members w
    where w.team_id = v_team.id and w.player_id = auth.uid()
  ) then
    return jsonb_build_object('ok', true, 'error', null, 'team_id', v_team.id, 'already_member', true);
  end if;

  insert into public.team_members (team_id, player_id, role)
  values (v_team.id, auth.uid(), 'member');

  return jsonb_build_object('ok', true, 'error', null, 'team_id', v_team.id);
end;
$$;

-- The captain is automatically a member with the captain role.
create or replace function public.add_captain_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_members (team_id, player_id, role)
  values (new.id, new.captain_id, 'captain')
  on conflict (team_id, player_id) do update set role = 'captain';
  return new;
end;
$$;

drop trigger if exists teams_add_captain on public.teams;
create trigger teams_add_captain
  after insert on public.teams
  for each row execute function public.add_captain_as_member();

revoke all on function public.join_team_by_code(text) from public, anon;
grant execute on function public.join_team_by_code(text) to authenticated;

-- Upgrade an existing Thairath Poll installation to two poll sets.
-- Safe to run more than once in Supabase Dashboard > SQL Editor.

insert into public.polls (
  id, question, option_gold, option_property, votes_gold, votes_property, presentation
)
select
  '00000000-0000-0000-0000-000000000002',
  'คำถามสำหรับโพลชุดที่ 2',
  'ตัวเลือกที่ 1',
  'ตัวเลือกที่ 2',
  0,
  0,
  presentation
from public.polls
where id = '00000000-0000-0000-0000-000000000001'
on conflict (id) do nothing;

create table if not exists public.broadcast_state (
  id boolean primary key default true check (id),
  active_poll_id uuid not null references public.polls(id) on delete restrict,
  phase text not null default 'results' check (phase in ('question', 'results', 'summary')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create or replace function public.prepare_broadcast_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists broadcast_prepare_update on public.broadcast_state;
create trigger broadcast_prepare_update
before update on public.broadcast_state
for each row execute function public.prepare_broadcast_update();

insert into public.broadcast_state (id, active_poll_id, phase)
values (true, '00000000-0000-0000-0000-000000000001', 'results')
on conflict (id) do nothing;

alter table public.broadcast_state enable row level security;

drop policy if exists "Public can read broadcast state" on public.broadcast_state;
create policy "Public can read broadcast state"
on public.broadcast_state for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update broadcast state" on public.broadcast_state;
create policy "Admins can update broadcast state"
on public.broadcast_state for update
to authenticated
using (public.is_poll_admin())
with check (public.is_poll_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'broadcast_state'
  ) then
    alter publication supabase_realtime add table public.broadcast_state;
  end if;
end $$;

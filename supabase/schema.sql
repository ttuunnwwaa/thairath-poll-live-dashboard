-- Thairath Poll: schema, seed, audit history, realtime and RLS
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create or replace function public.is_poll_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create table if not exists public.polls (
  id uuid primary key,
  question text not null check (char_length(question) between 1 and 240),
  option_gold text not null check (char_length(option_gold) between 1 and 80),
  option_property text not null check (char_length(option_property) between 1 and 80),
  votes_gold bigint not null default 0 check (votes_gold >= 0),
  votes_property bigint not null default 0 check (votes_property >= 0),
  options jsonb not null default '[]'::jsonb,
  presentation jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.polls add column if not exists options jsonb not null default '[]'::jsonb;

create table if not exists public.poll_history (
  id bigint generated always as identity primary key,
  poll_id uuid not null references public.polls(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text,
  old_data jsonb not null,
  new_data jsonb not null
);

create index if not exists poll_history_poll_time_idx
  on public.poll_history (poll_id, changed_at desc);

create or replace function public.prepare_poll_update()
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

create or replace function public.audit_poll_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.poll_history (
    poll_id, changed_by, changed_by_email, old_data, new_data
  ) values (
    new.id,
    auth.uid(),
    auth.jwt() ->> 'email',
    to_jsonb(old),
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists polls_prepare_update on public.polls;
create trigger polls_prepare_update
before update on public.polls
for each row execute function public.prepare_poll_update();

drop trigger if exists polls_audit_update on public.polls;
create trigger polls_audit_update
after update on public.polls
for each row execute function public.audit_poll_update();

insert into public.polls (
  id, question, option_gold, option_property, votes_gold, votes_property, presentation
) values (
  '00000000-0000-0000-0000-000000000001',
  'คุณคิดว่าสินทรัพย์ไหนจะทำให้คุณรอดในอนาคต',
  'ทองคำ',
  'อสังหาริมทรัพย์',
  680,
  320,
  '{
    "displayMode": "combined",
    "screenAssignments": {"left": "gold", "center": "combined", "right": "property"},
    "font": {
      "name": "Noto Sans Thai",
      "url": "https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800;900&display=swap",
      "question": 48,
      "asset": 38,
      "percent": 104,
      "votes": 22,
      "secondary": 18
    },
    "colors": {
      "gold": "#8a5c12", "center": "#0b513b", "property": "#0d6348",
      "chrome": "#031f17", "textPrimary": "#ffffff", "textSecondary": "#b9cec5"
    },
    "branding": {"showLogo": true, "logoUrl": "", "logoSize": 82},
    "screens": {
      "gold": {
        "backgroundUrl": "", "backgroundFit": "cover", "backgroundX": 50,
        "backgroundY": 50, "backgroundScale": 100, "artworkUrl": "",
        "artworkSize": 42, "artworkX": 50, "artworkY": 33
      },
      "property": {
        "backgroundUrl": "", "backgroundFit": "cover", "backgroundX": 50,
        "backgroundY": 50, "backgroundScale": 100, "artworkUrl": "",
        "artworkSize": 42, "artworkX": 50, "artworkY": 33
      }
    }
  }'::jsonb
)
on conflict (id) do nothing;

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

update public.polls
set options = jsonb_build_array(
  jsonb_build_object('id', 'option-1', 'label', option_gold, 'votes', votes_gold, 'color', coalesce(presentation->'colors'->>'gold', '#8a5c12')),
  jsonb_build_object('id', 'option-2', 'label', option_property, 'votes', votes_property, 'color', coalesce(presentation->'colors'->>'property', '#0d6348'))
)
where options = '[]'::jsonb;

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

alter table public.polls enable row level security;
alter table public.poll_history enable row level security;
alter table public.broadcast_state enable row level security;

drop policy if exists "Public can read poll" on public.polls;
create policy "Public can read poll"
on public.polls for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update poll" on public.polls;
create policy "Admins can update poll"
on public.polls for update
to authenticated
using (public.is_poll_admin())
with check (public.is_poll_admin());

drop policy if exists "Admins can read poll history" on public.poll_history;
create policy "Admins can read poll history"
on public.poll_history for select
to authenticated
using (public.is_poll_admin());

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'poll-assets', 'poll-assets', true, 8388608,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read poll assets" on storage.objects;
create policy "Public can read poll assets"
on storage.objects for select
to public
using (bucket_id = 'poll-assets');

drop policy if exists "Admins can upload poll assets" on storage.objects;
create policy "Admins can upload poll assets"
on storage.objects for insert
to authenticated
with check (bucket_id = 'poll-assets' and public.is_poll_admin());

drop policy if exists "Admins can update poll assets" on storage.objects;
create policy "Admins can update poll assets"
on storage.objects for update
to authenticated
using (bucket_id = 'poll-assets' and public.is_poll_admin())
with check (bucket_id = 'poll-assets' and public.is_poll_admin());

drop policy if exists "Admins can delete poll assets" on storage.objects;
create policy "Admins can delete poll assets"
on storage.objects for delete
to authenticated
using (bucket_id = 'poll-assets' and public.is_poll_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'polls'
  ) then
    alter publication supabase_realtime add table public.polls;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'broadcast_state'
  ) then
    alter publication supabase_realtime add table public.broadcast_state;
  end if;
end $$;

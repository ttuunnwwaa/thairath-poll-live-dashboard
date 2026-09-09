-- Add flexible poll options to an existing Thairath Poll installation.
-- Safe to run more than once in Supabase Dashboard > SQL Editor.

alter table public.polls
add column if not exists options jsonb not null default '[]'::jsonb;

update public.polls
set options = jsonb_build_array(
  jsonb_build_object(
    'id', 'option-1',
    'label', option_gold,
    'votes', votes_gold,
    'color', coalesce(presentation->'colors'->>'gold', '#8a5c12')
  ),
  jsonb_build_object(
    'id', 'option-2',
    'label', option_property,
    'votes', votes_property,
    'color', coalesce(presentation->'colors'->>'property', '#0d6348')
  )
)
where options = '[]'::jsonb;

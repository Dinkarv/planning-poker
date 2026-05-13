-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

create table if not exists public.planning_poker_rooms (
  room_id text primary key,
  data jsonb not null default '{"revealed":false,"votes":{},"names":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.planning_poker_rooms enable row level security;

create policy "planning_poker_select" on public.planning_poker_rooms
  for select using (true);

create policy "planning_poker_insert" on public.planning_poker_rooms
  for insert with check (true);

create policy "planning_poker_update" on public.planning_poker_rooms
  for update using (true);

-- Realtime: Dashboard → Database → Replication → enable for planning_poker_rooms
-- If players do not see live updates, confirm this table is listed under the supabase_realtime publication.
-- Or (if your project allows it):
alter publication supabase_realtime add table public.planning_poker_rooms;

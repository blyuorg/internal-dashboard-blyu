-- Live work-timer sessions: every 30 minutes the user must confirm they're
-- still working (last_checkin_at bump); 5 minutes without confirmation and
-- the client auto-stops the session, logging hours up to the last check-in.
-- Founders (CEO/CTO/CFO) use the same mechanism for founder-pool hours, and
-- can monitor everyone's — including each other's — sessions.
create type work_session_status as enum ('active', 'completed', 'expired');

create table work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  task_id uuid not null references tasks(id),
  pool_tag pool_tag not null,
  started_at timestamptz not null default now(),
  last_checkin_at timestamptz not null default now(),
  ended_at timestamptz,
  status work_session_status not null default 'active',
  time_log_id uuid references time_logs(id)
);

alter table work_sessions enable row level security;

create policy "work_sessions_select_own" on work_sessions
  for select using (user_id = auth.uid());

-- Founders monitor everyone's sessions, including each other's
-- ("cross founder" oversight) — mirrors auth_is_founder() used elsewhere.
create policy "work_sessions_select_founders" on work_sessions
  for select using (auth_is_founder());

create policy "work_sessions_insert_own" on work_sessions
  for insert with check (user_id = auth.uid());

create policy "work_sessions_update_own" on work_sessions
  for update using (user_id = auth.uid());

-- Stores the assignee's Google OAuth refresh token so the sync-task-calendar
-- Edge Function can create/update calendar events server-side (section 5.1,
-- "Google Calendar sync"). The service role (used by the Edge Function)
-- bypasses RLS; these policies only govern client-side access.
create table user_google_tokens (
  user_id uuid primary key references users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table user_google_tokens enable row level security;

-- A user may store/refresh only their own token; nobody can read tokens
-- back out over the client API (write-only from the browser).
create policy "google_tokens_upsert_own" on user_google_tokens
  for insert with check (user_id = auth.uid());

create policy "google_tokens_update_own" on user_google_tokens
  for update using (user_id = auth.uid());

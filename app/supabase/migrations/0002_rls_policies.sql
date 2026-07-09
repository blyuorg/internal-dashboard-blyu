-- RLS policies for Blyu Internal Dashboard
-- RLS is the real access gate; frontend hiding of UI is cosmetic only.

-- ============================================================
-- HELPER FUNCTIONS (security definer, read own row safely)
-- ============================================================
create or replace function auth_base_role()
returns base_role
language sql stable security definer
set search_path = public
as $$
  select base_role from users where id = auth.uid();
$$;

create or replace function auth_has_flag(flag text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select enabled from user_capability_flags
     where user_id = auth.uid() and flag_name = flag),
    false
  );
$$;

-- is_admin_ceo / is_admin_cto / is_admin_cfo grant full access to that
-- dashboard regardless of base_role.
create or replace function auth_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select auth_base_role() = 'ceo' or auth_has_flag('is_admin_ceo');
$$;

create or replace function auth_is_cto()
returns boolean language sql stable security definer set search_path = public as $$
  select auth_base_role() = 'cto' or auth_has_flag('is_admin_cto');
$$;

create or replace function auth_is_cfo()
returns boolean language sql stable security definer set search_path = public as $$
  select auth_base_role() = 'cfo' or auth_has_flag('is_admin_cfo');
$$;

create or replace function auth_is_founder()
returns boolean language sql stable security definer set search_path = public as $$
  select auth_is_ceo() or auth_is_cto() or auth_is_cfo();
$$;

-- ============================================================
-- ENABLE RLS EVERYWHERE — no exceptions
-- ============================================================
alter table users enable row level security;
alter table user_capability_flags enable row level security;
alter table user_preferences enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table deliverables enable row level security;
alter table time_logs enable row level security;
alter table cash_ledger enable row level security;
alter table direct_costs enable row level security;
alter table finder_fee_log enable row level security;
alter table payout_config enable row level security;
alter table payout_runs enable row level security;
alter table payout_run_lines enable row level security;
alter table chat_messages enable row level security;
alter table audit_log enable row level security;

-- ============================================================
-- USERS
-- ============================================================
create policy "users_select_all_authenticated" on users
  for select using (auth.uid() is not null);

create policy "users_update_own_profile" on users
  for update using (id = auth.uid());

create policy "users_ceo_manage_all" on users
  for all using (auth_is_ceo());

-- ============================================================
-- USER_CAPABILITY_FLAGS — only CEO (or is_admin_ceo) manages; everyone
-- can read their own flags.
-- ============================================================
create policy "flags_select_own" on user_capability_flags
  for select using (user_id = auth.uid());

create policy "flags_select_ceo" on user_capability_flags
  for select using (auth_is_ceo());

create policy "flags_write_ceo" on user_capability_flags
  for insert with check (auth_is_ceo());

create policy "flags_update_ceo" on user_capability_flags
  for update using (auth_is_ceo());

-- ============================================================
-- USER_PREFERENCES — self only
-- ============================================================
create policy "prefs_select_own" on user_preferences
  for select using (user_id = auth.uid());

create policy "prefs_upsert_own" on user_preferences
  for insert with check (user_id = auth.uid());

create policy "prefs_update_own" on user_preferences
  for update using (user_id = auth.uid());

-- ============================================================
-- PROJECTS — founders (ceo/cto/cfo) see all; team sees projects they
-- have a task on. Historical/archived rows stay queryable, same policy.
-- ============================================================
create policy "projects_select_founders" on projects
  for select using (auth_is_founder());

create policy "projects_select_team_assigned" on projects
  for select using (
    exists (select 1 from tasks t where t.project_id = projects.id and t.assigned_to = auth.uid())
  );

create policy "projects_write_ceo_or_assigners" on projects
  for insert with check (auth_is_ceo() or auth_has_flag('can_assign_tasks'));

create policy "projects_update_ceo_or_assigners" on projects
  for update using (auth_is_ceo() or auth_has_flag('can_assign_tasks'));

-- ============================================================
-- TASKS
-- ============================================================
create policy "tasks_select_founders_and_monitors" on tasks
  for select using (auth_is_founder() or auth_has_flag('can_monitor_tasks'));

create policy "tasks_select_own" on tasks
  for select using (assigned_to = auth.uid() or assigned_by = auth.uid());

create policy "tasks_insert_assigners" on tasks
  for insert with check (auth_is_ceo() or auth_is_cto() or auth_has_flag('can_assign_tasks'));

create policy "tasks_update_assigners" on tasks
  for update using (auth_is_ceo() or auth_is_cto() or auth_has_flag('can_assign_tasks'));

create policy "tasks_update_own_status" on tasks
  for update using (assigned_to = auth.uid());

-- ============================================================
-- DELIVERABLES
-- ============================================================
create policy "deliverables_select_related" on deliverables
  for select using (
    auth_is_founder()
    or exists (select 1 from tasks t where t.id = deliverables.task_id and t.assigned_to = auth.uid())
  );

create policy "deliverables_insert_own_task" on deliverables
  for insert with check (
    exists (select 1 from tasks t where t.id = deliverables.task_id and t.assigned_to = auth.uid())
  );

create policy "deliverables_review_gate" on deliverables
  for update using (auth_is_cto() or auth_has_flag('can_review_deliverables'));

-- ============================================================
-- TIME_LOGS — team logs own hours; founders + can_see_team_earnings see
-- team pool hours; founder-pool hours visible to founders for cross-approval.
-- ============================================================
create policy "time_logs_select_own" on time_logs
  for select using (user_id = auth.uid());

create policy "time_logs_select_founders" on time_logs
  for select using (auth_is_founder() or auth_has_flag('can_see_team_earnings'));

create policy "time_logs_insert_own" on time_logs
  for insert with check (user_id = auth.uid());

create policy "time_logs_founder_approval_update" on time_logs
  for update using (
    pool_tag = 'founder' and (auth_is_founder() and auth_has_flag('can_approve_founder_hours'))
  );

-- ============================================================
-- CASH_LEDGER / DIRECT_COSTS / FINDER_FEE_LOG — CFO domain
-- ============================================================
create policy "cash_ledger_select_cfo" on cash_ledger
  for select using (auth_is_cfo() or auth_is_ceo() or auth_has_flag('can_see_team_earnings'));

create policy "cash_ledger_write_cfo" on cash_ledger
  for all using (auth_is_cfo());

create policy "direct_costs_select_founders" on direct_costs
  for select using (auth_is_founder());

create policy "direct_costs_write_cfo" on direct_costs
  for insert with check (auth_is_cfo() or auth_has_flag('can_log_direct_costs'));

create policy "direct_costs_update_cfo" on direct_costs
  for update using (auth_is_cfo() or auth_has_flag('can_log_direct_costs'));

create policy "finder_fee_select_all_authenticated" on finder_fee_log
  for select using (auth.uid() is not null);

create policy "finder_fee_insert_all_authenticated" on finder_fee_log
  for insert with check (logged_by = auth.uid());

-- ============================================================
-- PAYOUT_CONFIG / PAYOUT_RUNS / PAYOUT_RUN_LINES — CFO runs payouts;
-- founders cross-approve; team sees only their own line.
-- ============================================================
create policy "payout_config_select_founders" on payout_config
  for select using (auth_is_founder());

create policy "payout_config_write_ceo" on payout_config
  for insert with check (auth_is_ceo());

create policy "payout_config_update_ceo" on payout_config
  for update using (auth_is_ceo());

create policy "payout_runs_select_founders" on payout_runs
  for select using (auth_is_founder());

create policy "payout_runs_write_cfo" on payout_runs
  for insert with check (auth_is_cfo() or auth_has_flag('can_run_payouts'));

create policy "payout_runs_update_cfo_or_approvers" on payout_runs
  for update using (
    auth_is_cfo() or auth_has_flag('can_run_payouts')
    or (auth_is_founder() and auth_has_flag('can_approve_founder_hours'))
  );

create policy "payout_run_lines_select_own" on payout_run_lines
  for select using (user_id = auth.uid());

create policy "payout_run_lines_select_founders" on payout_run_lines
  for select using (auth_is_founder());

create policy "payout_run_lines_write_cfo" on payout_run_lines
  for insert with check (auth_is_cfo() or auth_has_flag('can_run_payouts'));

-- ============================================================
-- CHAT_MESSAGES — participants of the channel only. Since channel
-- membership is implicit (project/task assignment or DM pair encoded in
-- channel_id), gate broadly by authentication and rely on channel_id
-- being an unguessable uuid scoped client-side to real project/task/dm
-- ids the user already has access to; founders can see all for oversight.
-- ============================================================
create policy "chat_select_founders" on chat_messages
  for select using (auth_is_founder());

create policy "chat_select_project_participant" on chat_messages
  for select using (
    channel_type = 'project' and exists (
      select 1 from tasks t where t.project_id = chat_messages.channel_id and t.assigned_to = auth.uid()
    )
  );

create policy "chat_select_task_participant" on chat_messages
  for select using (
    channel_type = 'task' and exists (
      select 1 from tasks t where t.id = chat_messages.channel_id and t.assigned_to = auth.uid()
    )
  );

create policy "chat_select_dm_participant" on chat_messages
  for select using (channel_type = 'dm' and sender_id = auth.uid());

create policy "chat_insert_own" on chat_messages
  for insert with check (sender_id = auth.uid());

-- ============================================================
-- AUDIT_LOG — append-only, founders read, system/founders write
-- ============================================================
create policy "audit_log_select_founders" on audit_log
  for select using (auth_is_founder());

create policy "audit_log_insert_authenticated" on audit_log
  for insert with check (auth.uid() is not null);

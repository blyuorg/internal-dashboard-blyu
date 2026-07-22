-- New standalone capability flag: project creation used to be implicitly
-- bundled into can_assign_tasks via the projects RLS policy — the CEO
-- wants to grant "create a project" access independently of task
-- assignment, so it needs its own flag and its own policy.
alter table user_capability_flags drop constraint user_capability_flags_flag_name_check;
alter table user_capability_flags add constraint user_capability_flags_flag_name_check
  check (flag_name in (
    'can_assign_tasks', 'can_monitor_tasks', 'can_review_deliverables',
    'can_see_team_earnings', 'can_run_payouts', 'can_log_direct_costs',
    'can_approve_founder_hours', 'can_export_financial_data', 'can_export_task_data',
    'can_create_projects',
    'is_admin_ceo', 'is_admin_cto', 'is_admin_cfo'
  ));

drop policy if exists "projects_write_ceo_or_assigners" on projects;
create policy "projects_insert_ceo_or_creators" on projects
  for insert with check (auth_is_ceo() or auth_has_flag('can_create_projects'));

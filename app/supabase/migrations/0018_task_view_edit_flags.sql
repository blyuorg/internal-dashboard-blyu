alter table user_capability_flags drop constraint user_capability_flags_flag_name_check;
alter table user_capability_flags add constraint user_capability_flags_flag_name_check
  check (flag_name in (
    'can_assign_tasks', 'can_monitor_tasks', 'can_review_deliverables',
    'can_see_team_earnings', 'can_run_payouts', 'can_log_direct_costs',
    'can_approve_founder_hours', 'can_export_financial_data', 'can_export_task_data',
    'can_create_projects', 'can_view_tasks', 'can_edit_tasks',
    'is_admin_ceo', 'is_admin_cto', 'is_admin_cfo'
  ));

-- Founders (ceo/cto/cfo) already see every task via tasks_select_founders_and_monitors.
-- can_view_tasks extends that to anyone the CEO grants it to.
create policy "tasks_select_viewers" on tasks
  for select using (auth_has_flag('can_view_tasks') or auth_has_flag('can_edit_tasks'));

-- Reassign / status / estimate / deadline / cancel — the global editable
-- task table's actions all go through a plain task UPDATE.
create policy "tasks_update_editors" on tasks
  for update using (auth_has_flag('can_edit_tasks'));

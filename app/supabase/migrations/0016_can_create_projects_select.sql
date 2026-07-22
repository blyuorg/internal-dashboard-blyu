-- INSERT ... RETURNING also requires a matching SELECT policy to read the
-- row back — without this, a can_create_projects holder's insert succeeds
-- at the row level but fails on RETURNING with the same generic RLS error,
-- since only founders or team members with an existing task on the project
-- could see it.
create policy "projects_select_creators" on projects
  for select using (auth_has_flag('can_create_projects'));

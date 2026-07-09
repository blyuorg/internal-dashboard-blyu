-- The payout engine computes its waterfall per project, but payout_runs
-- never recorded which project a run belonged to — making historical runs
-- unreconstructable per-project and overlap detection (to prevent
-- double-paying the same logged hours across two runs) impossible.
alter table payout_runs add column project_id uuid references projects(id);

create index payout_runs_project_id_idx on payout_runs(project_id);

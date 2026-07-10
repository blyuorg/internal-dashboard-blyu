-- The CFO dashboard already warns and disables "Run payout" when a chosen
-- period overlaps an existing run for the same project (double-pay
-- prevention), but that was UI-only — nothing stopped a second run with an
-- overlapping period via direct API access. This makes it a real database
-- guarantee: no two payout_runs for the same project may cover overlapping
-- date ranges.
create extension if not exists btree_gist;

alter table payout_runs add constraint payout_runs_no_overlapping_period
  exclude using gist (
    project_id with =,
    daterange(period_start, period_end, '[]') with &&
  )
  where (project_id is not null);

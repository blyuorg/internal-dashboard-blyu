# Deploying the stale-session expiry function

Code is deployed-ready; only the actual `functions deploy` step is pending
(needs a Supabase personal access token, same limitation as
`sync-task-calendar` — see its SETUP.md).

## Already done (applied directly to the live project)

- `pg_cron`, `pg_net`, and `supabase_vault` extensions enabled
- Service role key stored in Vault as secret `service_role_key`
- Cron job `expire-stale-work-sessions` scheduled, runs every 5 minutes,
  calls `https://rvyrtwwukcswssvnqjnp.supabase.co/functions/v1/expire-stale-sessions`

Check it's running:

```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;
```

## What's left: deploy the function

```bash
export SUPABASE_ACCESS_TOKEN=<your-personal-access-token>
npx supabase link --project-ref rvyrtwwukcswssvnqjnp
npx supabase functions deploy expire-stale-sessions
```

No extra secrets needed — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically for every Edge Function.

## How it works

Every active `work_sessions` row whose `last_checkin_at` is more than 30
minutes old — strict, no grace period, since this only matters once nobody's
left to click "still working" (tab closed, browser crashed, laptop asleep,
etc.) — gets:

1. A `time_logs` row written for hours up to `last_checkin_at` (never counts
   idle time past the last real check-in)
2. `work_sessions.status` set to `expired`, `ended_at` stamped, linked to the
   new `time_logs` row via `time_log_id`

This is a pure backstop. While a tab stays open, the client-side logic in
`TimerWidget.tsx` already handles the 30-min prompt + 5-min grace + auto-stop
— this function only catches sessions the client never got to resolve.

## Verify after deploying

1. Start a timer on any dashboard, then close the tab without stopping it.
2. Wait ~35 minutes (30 min stale threshold + up to 5 min until the next cron tick).
3. Check `work_sessions` — the session should be `status = 'expired'` with a
   linked `time_logs` row.

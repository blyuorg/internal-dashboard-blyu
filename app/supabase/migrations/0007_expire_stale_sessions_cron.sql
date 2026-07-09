-- Schedules the expire-stale-sessions Edge Function every 5 minutes as the
-- server-side backstop for the live work timer (section: work_sessions).
-- The service role key used to authenticate the call is read from Vault at
-- run time, never stored in this file — see SETUP.md for the one-time
-- `select vault.create_secret(...)` step this depends on.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'expire-stale-work-sessions',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://rvyrtwwukcswssvnqjnp.supabase.co/functions/v1/expire-stale-sessions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

# Deploying Google Calendar sync

Code is complete; deploying it needs credentials this session didn't have.

## 1. Google Cloud OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project, enable the **Google Calendar API**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Note the Client ID and Client Secret.
5. In Supabase Dashboard → Authentication → Providers → Google: paste the Client ID/Secret, enable the provider.
6. Add `https://www.googleapis.com/auth/calendar.events` as an additional scope in the Google provider config (the frontend already requests it in `src/routes/Login.tsx`'s `signInWithOAuth` call).

## 2. Supabase personal access token (to deploy the function)

Get one from https://supabase.com/dashboard/account/tokens, then:

```bash
export SUPABASE_ACCESS_TOKEN=<your-token>
npx supabase link --project-ref rvyrtwwukcswssvnqjnp
npx supabase functions deploy sync-task-calendar
```

## 3. Function secrets

```bash
npx supabase secrets set GOOGLE_CLIENT_ID=<client-id> GOOGLE_CLIENT_SECRET=<client-secret>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for every Edge Function — nothing to set there.

## 4. Verify

1. Log in with Google (a user must sign in via the Google OAuth button at least once — this is what populates `user_google_tokens.refresh_token` for them, see `src/lib/auth.tsx`).
2. Assign that user a task with a deadline from the CEO dashboard.
3. Check their primary Google Calendar for a new all-day event.

## How it's wired

- `src/lib/auth.tsx` persists the OAuth `provider_refresh_token` to `user_google_tokens` on first Google sign-in.
- `src/lib/calendarSync.ts` — `syncTaskToCalendar(taskId)` invokes the Edge Function; called (fire-and-forget) after task assignment, reassignment, submit-for-review, review-gate decisions, and sign-off decisions.
- `supabase/functions/sync-task-calendar/index.ts` — refreshes the assignee's Google access token, creates or patches the calendar event, and (on first sync) writes `google_calendar_event_id` back onto the task.
- One-way only: task → calendar. Editing the calendar event directly does not flow back into Blyu.

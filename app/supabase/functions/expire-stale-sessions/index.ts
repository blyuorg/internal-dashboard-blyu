// Server-side backstop for the live work timer (see src/components/timer/TimerWidget.tsx).
// The client auto-stops a session 5 minutes after a missed 30-min check-in,
// but that only runs while a browser tab is open. If someone closes the tab
// mid-session, nothing client-side ever resolves it. This function is the
// strict fallback: any session with no check-in in the last 30 minutes,
// full stop, no grace period — since if the tab is gone there's no one left
// to click "still working" anyway. Invoked on a schedule (see
// supabase/migrations/0007_expire_stale_sessions_cron.sql), every 5 minutes.
//
// Required env (auto-provided by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "jsr:@supabase/supabase-js@2";

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  const { data: staleSessions, error: fetchErr } = await admin
    .from("work_sessions")
    .select("id, user_id, task_id, pool_tag, started_at, last_checkin_at")
    .eq("status", "active")
    .lt("last_checkin_at", cutoff);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  const results = [];
  for (const s of staleSessions ?? []) {
    const hours = Math.max(
      0,
      (new Date(s.last_checkin_at).getTime() - new Date(s.started_at).getTime()) / 3_600_000
    );

    const { data: log, error: logErr } = await admin
      .from("time_logs")
      .insert({
        task_id: s.task_id,
        user_id: s.user_id,
        hours: Number(hours.toFixed(2)),
        pool_tag: s.pool_tag,
      })
      .select("id")
      .single();

    if (logErr) {
      results.push({ session_id: s.id, error: logErr.message });
      continue;
    }

    const { error: updateErr } = await admin
      .from("work_sessions")
      .update({ status: "expired", ended_at: new Date().toISOString(), time_log_id: log.id })
      .eq("id", s.id);

    results.push({ session_id: s.id, time_log_id: log.id, error: updateErr?.message ?? null });
  }

  return new Response(JSON.stringify({ expired: results.length, results }), { status: 200 });
});

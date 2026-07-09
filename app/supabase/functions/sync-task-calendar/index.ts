// One-way sync: task deadline -> Google Calendar event on the assignee's
// connected account. Triggered from the frontend on task create/update
// (see src/lib/calendarSync.ts). Task status changes reflect in the event
// title (e.g. a "Completed:" prefix on done); two-way sync is a phase 2 option.
//
// Required secrets (set via `supabase secrets set`):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Required env (auto-provided by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface SyncRequest {
  task_id: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { task_id }: SyncRequest = await req.json();
  if (!task_id) {
    return new Response(JSON.stringify({ error: "task_id is required" }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: task, error: taskErr } = await admin
    .from("tasks")
    .select("id, assigned_to, deadline, status, google_calendar_event_id, project_id, projects(name)")
    .eq("id", task_id)
    .single();

  if (taskErr || !task) {
    return new Response(JSON.stringify({ error: "Task not found" }), { status: 404 });
  }

  if (!task.deadline || !task.assigned_to) {
    return new Response(JSON.stringify({ skipped: "No deadline or assignee" }), { status: 200 });
  }

  const { data: tokenRow } = await admin
    .from("user_google_tokens")
    .select("refresh_token")
    .eq("user_id", task.assigned_to)
    .maybeSingle();

  if (!tokenRow || !googleClientId || !googleClientSecret) {
    return new Response(JSON.stringify({ skipped: "Assignee has no connected Google account" }), {
      status: 200,
    });
  }

  // Exchange the stored refresh token for a short-lived access token.
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    return new Response(JSON.stringify({ error: "Failed to refresh Google token" }), { status: 502 });
  }

  const { access_token } = await tokenRes.json();

  const projectName = (task as unknown as { projects: { name: string } | null }).projects?.name ?? "Blyu task";
  const titlePrefix = task.status === "done" ? "Completed: " : "";
  const summary = `${titlePrefix}${projectName}`;

  const eventBody = {
    summary,
    start: { date: task.deadline.slice(0, 10) },
    end: { date: task.deadline.slice(0, 10) },
  };

  const isUpdate = !!task.google_calendar_event_id;
  const calendarRes = await fetch(
    isUpdate
      ? `${GOOGLE_CALENDAR_EVENTS_URL}/${task.google_calendar_event_id}`
      : GOOGLE_CALENDAR_EVENTS_URL,
    {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    }
  );

  if (!calendarRes.ok) {
    const errText = await calendarRes.text();
    return new Response(JSON.stringify({ error: "Google Calendar API error", details: errText }), {
      status: 502,
    });
  }

  const event = await calendarRes.json();

  if (!isUpdate) {
    await admin.from("tasks").update({ google_calendar_event_id: event.id }).eq("id", task_id);
  }

  return new Response(JSON.stringify({ ok: true, event_id: event.id }), { status: 200 });
});

import { supabase } from "./supabase";

// Fire-and-forget: task deadline -> Google Calendar event (one-way sync).
// Failures (no connected calendar, missing deadline, etc.) are expected and
// silent — the task mutation itself must never fail because of this.
export function syncTaskToCalendar(taskId: string) {
  supabase.functions.invoke("sync-task-calendar", { body: { task_id: taskId } }).catch(() => {});
}

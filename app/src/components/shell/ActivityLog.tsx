import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { WorkSessionStatus } from "@/lib/database.types";

const STATUS_STYLE: Record<WorkSessionStatus, string> = {
  active: "text-[var(--color-accent)]",
  completed: "text-[var(--color-good)]",
  expired: "text-[var(--color-critical)]",
};

// Founder monitoring of live/logged work-timer sessions across the whole
// org — including other founders' own founder-pool sessions ("cross
// founder" oversight), day by day.
export function ActivityLog() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const sessionsQuery = useQuery({
    queryKey: ["activity-log", date],
    refetchInterval: 15000,
    queryFn: async () => {
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from("work_sessions")
        .select("id, user_id, task_id, pool_tag, started_at, last_checkin_at, ended_at, status, time_log_id")
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd)
        .order("started_at", { ascending: false });
      if (error) throw error;
      // A finalized (completed/expired) session with no time_log_id means
      // the timer widget/expiry function skipped it — the session rounded
      // to ~0h and recorded no real work (see TimerWidget.tsx finalize).
      // Showing those as a green "completed" row with 0.0h was misleading,
      // so they're excluded here; active sessions always show regardless.
      return (data ?? []).filter((s) => s.status === "active" || s.time_log_id !== null);
    },
  });

  const usersQuery = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["all-tasks-for-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("id, project_id, projects(name)");
      if (error) throw error;
      return data as unknown as { id: string; projects: { name: string } | null }[];
    },
  });

  const usersById = useMemo(
    () => new Map((usersQuery.data ?? []).map((u) => [u.id, u.name])),
    [usersQuery.data]
  );
  const tasksById = useMemo(
    () => new Map((tasksQuery.data ?? []).map((t) => [t.id, t.projects?.name ?? t.id.slice(0, 8)])),
    [tasksQuery.data]
  );

  function durationLabel(startedAt: string, endedAt: string | null, lastCheckin: string) {
    const end = endedAt ?? lastCheckin;
    const ms = new Date(end).getTime() - new Date(startedAt).getTime();
    const hours = Math.max(0, ms / 3_600_000);
    return `${hours.toFixed(1)}h`;
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Daily activity log</h2>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
      </div>
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2">Person</th>
              <th className="px-3 py-2">Pool</th>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(sessionsQuery.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2">{usersById.get(s.user_id) ?? "—"}</td>
                <td className="px-3 py-2">{s.pool_tag}</td>
                <td className="px-3 py-2">{tasksById.get(s.task_id) ?? "—"}</td>
                <td className="px-3 py-2">{new Date(s.started_at).toLocaleTimeString()}</td>
                <td className="px-3 py-2">{durationLabel(s.started_at, s.ended_at, s.last_checkin_at)}</td>
                <td className={`px-3 py-2 font-medium ${STATUS_STYLE[s.status]}`}>{s.status}</td>
              </tr>
            ))}
            {sessionsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-[var(--color-text-muted)]">
                  No sessions logged this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

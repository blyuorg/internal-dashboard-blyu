import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { WorkSessionStatus } from "@/lib/database.types";

const STATUS_STYLE: Record<WorkSessionStatus, string> = {
  active: "text-[var(--color-accent)]",
  completed: "text-[var(--color-good)]",
  expired: "text-[var(--color-critical)]",
};

export function DayDetailPanel({ date, onClose }: { date: string; onClose: () => void }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const sessionsQuery = useQuery({
    queryKey: ["my-day-sessions", userId, date],
    enabled: !!userId,
    queryFn: async () => {
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from("work_sessions")
        .select("id, task_id, started_at, ended_at, last_checkin_at, status, time_log_id")
        .eq("user_id", userId!)
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd)
        .order("started_at", { ascending: true });
      if (error) throw error;
      return data as unknown as {
        id: string;
        task_id: string;
        started_at: string;
        ended_at: string | null;
        last_checkin_at: string;
        status: WorkSessionStatus;
        time_log_id: string | null;
      }[];
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["my-tasks-for-day-detail"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("id, projects(name)");
      if (error) throw error;
      return data as unknown as { id: string; projects: { name: string } | null }[];
    },
  });

  const manualLogsQuery = useQuery({
    queryKey: ["my-manual-logs", userId, date],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_logs")
        .select("id, task_id, hours")
        .eq("user_id", userId!)
        .eq("log_date", date);
      if (error) throw error;
      return data;
    },
  });

  const tasksById = useMemo(
    () => new Map((tasksQuery.data ?? []).map((t) => [t.id, t.projects?.name ?? t.id.slice(0, 8)])),
    [tasksQuery.data]
  );

  const sessionLinkedLogIds = useMemo(
    () => new Set((sessionsQuery.data ?? []).map((s) => s.time_log_id).filter(Boolean)),
    [sessionsQuery.data]
  );
  const manualOnlyLogs = (manualLogsQuery.data ?? []).filter((l) => !sessionLinkedLogIds.has(l.id));

  function durationLabel(startedAt: string, endedAt: string | null, lastCheckin: string) {
    const end = endedAt ?? lastCheckin;
    const ms = new Date(end).getTime() - new Date(startedAt).getTime();
    return `${Math.max(0, ms / 3_600_000).toFixed(2)}h`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--color-bg)]">
            <X size={16} />
          </button>
        </div>

        <p className="mb-2 text-xs font-semibold text-[var(--color-text-muted)]">Timer sessions</p>
        <div className="mb-4 flex flex-col gap-2">
          {(sessionsQuery.data ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <div>
                <p>{tasksById.get(s.task_id) ?? "—"}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {new Date(s.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                  {s.ended_at
                    ? new Date(s.ended_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "in progress"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{durationLabel(s.started_at, s.ended_at, s.last_checkin_at)}</p>
                <p className={`text-xs ${STATUS_STYLE[s.status]}`}>{s.status}</p>
              </div>
            </div>
          ))}
          {sessionsQuery.data?.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">No timer sessions this day.</p>
          )}
        </div>

        {manualOnlyLogs.length > 0 && (
          <>
            <p className="mb-2 text-xs font-semibold text-[var(--color-text-muted)]">Manual entries</p>
            <div className="flex flex-col gap-2">
              {manualOnlyLogs.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between rounded border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <span>{tasksById.get(l.task_id) ?? "—"}</span>
                  <span className="font-medium">{Number(l.hours).toFixed(2)}h</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

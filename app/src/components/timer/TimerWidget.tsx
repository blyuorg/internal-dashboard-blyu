import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { playAlarm } from "@/lib/alarmSound";
import type { PoolTag } from "@/lib/database.types";

const CHECKIN_INTERVAL_MS = 30 * 60 * 1000;
const GRACE_MS = 5 * 60 * 1000;

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function TimerWidget() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [taskId, setTaskId] = useState("");

  const poolTag: PoolTag = profile?.base_role === "team" ? "team" : "founder";

  const activeSessionQuery = useQuery({
    queryKey: ["active-work-session", userId],
    enabled: !!userId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_sessions")
        .select("id, task_id, started_at, last_checkin_at, status")
        .eq("user_id", userId!)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const myTasksQuery = useQuery({
    queryKey: ["my-open-tasks-for-timer", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, project_id, status, projects(name)")
        .eq("assigned_to", userId!)
        .neq("status", "done");
      if (error) throw error;
      return data as unknown as { id: string; projects: { name: string } | null }[];
    },
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeSession = activeSessionQuery.data;
  const msSinceCheckin = activeSession ? now - new Date(activeSession.last_checkin_at).getTime() : 0;
  const needsCheckin = !!activeSession && msSinceCheckin >= CHECKIN_INTERVAL_MS;
  const overGrace = !!activeSession && msSinceCheckin >= CHECKIN_INTERVAL_MS + GRACE_MS;

  const finalize = useMutation({
    mutationFn: async ({
      sessionId,
      taskId,
      startedAt,
      hoursEndTime,
      status,
    }: {
      sessionId: string;
      taskId: string;
      startedAt: string;
      hoursEndTime: string;
      status: "completed" | "expired";
    }) => {
      const hours = Math.max(
        0,
        (new Date(hoursEndTime).getTime() - new Date(startedAt).getTime()) / 3_600_000
      );
      const { data: log, error: logErr } = await supabase
        .from("time_logs")
        .insert({ task_id: taskId, user_id: userId!, hours: Number(hours.toFixed(2)), pool_tag: poolTag })
        .select("id")
        .single();
      if (logErr) throw logErr;

      const { error: sessErr } = await supabase
        .from("work_sessions")
        .update({ status, ended_at: new Date().toISOString(), time_log_id: log.id })
        .eq("id", sessionId);
      if (sessErr) throw sessErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-work-session", userId] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks", userId] });
    },
  });

  // Auto-stop once the grace period lapses without a check-in confirmation.
  useEffect(() => {
    if (overGrace && activeSession && !finalize.isPending) {
      finalize.mutate({
        sessionId: activeSession.id,
        taskId: activeSession.task_id,
        startedAt: activeSession.started_at,
        hoursEndTime: activeSession.last_checkin_at,
        status: "expired",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overGrace, activeSession?.id]);

  // Ring the alarm every ~20s while a check-in is pending and not yet over grace.
  useEffect(() => {
    if (!needsCheckin || overGrace) return;
    playAlarm();
    const interval = setInterval(playAlarm, 20000);
    return () => clearInterval(interval);
  }, [needsCheckin, overGrace]);

  const startSession = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("Select a task first");
      const { error } = await supabase.from("work_sessions").insert({
        user_id: userId!,
        task_id: taskId,
        pool_tag: poolTag,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-work-session", userId] });
      setTaskId("");
    },
  });

  const checkIn = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("work_sessions")
        .update({ last_checkin_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-work-session", userId] }),
  });

  const stopSession = useMutation({
    mutationFn: async () => {
      if (!activeSession) return;
      await finalize.mutateAsync({
        sessionId: activeSession.id,
        taskId: activeSession.task_id,
        startedAt: activeSession.started_at,
        hoursEndTime: new Date().toISOString(),
        status: "completed",
      });
    },
  });

  const taskOptions = useMemo(() => myTasksQuery.data ?? [], [myTasksQuery.data]);

  return (
    <>
      <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
        <Clock size={14} />
        {activeSession ? (
          <>
            <span className="tabular-nums">
              {formatElapsed(now - new Date(activeSession.started_at).getTime())}
            </span>
            <button
              onClick={() => stopSession.mutate()}
              className="rounded bg-[var(--color-critical)] px-2 py-0.5 text-xs text-white"
            >
              Stop
            </button>
          </>
        ) : (
          <>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-xs"
            >
              <option value="">Select task…</option>
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.projects?.name ?? t.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <button
              onClick={() => taskId && startSession.mutate()}
              disabled={!taskId}
              className="rounded bg-[var(--color-accent)] px-2 py-0.5 text-xs text-[var(--color-accent-fg)] disabled:opacity-50"
            >
              Start
            </button>
          </>
        )}
      </div>

      {needsCheckin && !overGrace && activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
            <p className="mb-1 text-lg font-semibold">Still working?</p>
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">
              Confirm within {Math.ceil((CHECKIN_INTERVAL_MS + GRACE_MS - msSinceCheckin) / 60000)} min or this
              session will auto-stop.
            </p>
            <button
              onClick={() => checkIn.mutate(activeSession.id)}
              className="rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)]"
            >
              Yes, I'm working
            </button>
          </div>
        </div>
      )}
    </>
  );
}

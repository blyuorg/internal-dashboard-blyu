import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth, useHasFlag } from "@/lib/auth";
import { syncTaskToCalendar } from "@/lib/calendarSync";
import { ExportButton } from "@/components/shell/ExportButton";
import type { TaskStatus, TasksRow } from "@/lib/database.types";

const STATUS_OPTIONS: TaskStatus[] = ["todo", "in_progress", "in_review", "blocked", "done", "cancelled"];

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "text-[var(--color-text-muted)]",
  in_progress: "text-[var(--color-accent)]",
  in_review: "text-[var(--color-warn)]",
  blocked: "text-[var(--color-critical)]",
  done: "text-[var(--color-good)]",
  cancelled: "text-[var(--color-text-muted)] line-through",
};

// One shared table for every dashboard: view is gated by can_view_tasks (or
// can_edit_tasks, which implies view) for anyone the CEO grants it to;
// founders (ceo/cto/cfo) already see every task via RLS regardless. Editing
// (reassign, status, estimate, deadline, cancel) needs can_edit_tasks, or
// base role ceo/cto which already had task-management rights before this
// table existed. "Delete" is a status change to 'cancelled', not a real
// DELETE — matches the never-hard-delete rule used everywhere else in this
// app (projects, payouts): history stays reconstructable.
export function GlobalTaskTable() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const hasViewFlag = useHasFlag("can_view_tasks");
  const hasEditFlag = useHasFlag("can_edit_tasks");
  const [showCancelled, setShowCancelled] = useState(false);

  const isFounder = profile?.base_role === "ceo" || profile?.base_role === "cto" || profile?.base_role === "cfo";
  const canEdit = profile?.base_role === "ceo" || profile?.base_role === "cto" || hasEditFlag;
  const canView = isFounder || hasViewFlag || hasEditFlag;

  const tasksQuery = useQuery({
    queryKey: ["global-tasks"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, project_id, assigned_to, status, estimated_hours, deadline")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["projects-all"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const usersQuery = useQuery({
    queryKey: ["all-users"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const timeLogsQuery = useQuery({
    queryKey: ["all-time-logs"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("time_logs").select("task_id, hours");
      if (error) throw error;
      return data;
    },
  });

  const projectsById = useMemo(
    () => new Map((projectsQuery.data ?? []).map((p) => [p.id, p.name])),
    [projectsQuery.data]
  );
  const usersById = useMemo(
    () => new Map((usersQuery.data ?? []).map((u) => [u.id, u.name])),
    [usersQuery.data]
  );
  const actualHoursByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of timeLogsQuery.data ?? []) {
      map.set(log.task_id, (map.get(log.task_id) ?? 0) + Number(log.hours));
    }
    return map;
  }, [timeLogsQuery.data]);

  const updateTask = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Partial<TasksRow> }) => {
      const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
      if (error) throw error;
      return taskId;
    },
    onSuccess: (taskId) => {
      queryClient.invalidateQueries({ queryKey: ["global-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      syncTaskToCalendar(taskId);
    },
  });

  if (!canView) return null;

  const visibleTasks = (tasksQuery.data ?? []).filter((t) => showCancelled || t.status !== "cancelled");

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">All tasks</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Show cancelled
          </label>
          <ExportButton
            requiresFlag="can_export_task_data"
            filename="all-tasks"
            rows={() =>
              visibleTasks.map((t) => ({
                Task: t.title,
                Project: projectsById.get(t.project_id) ?? "—",
                Assignee: usersById.get(t.assigned_to ?? "") ?? "Unassigned",
                Status: t.status,
                "Est. hours": t.estimated_hours ?? "",
                "Actual hours": actualHoursByTask.get(t.id) ?? 0,
                Deadline: t.deadline ?? "",
              }))
            }
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Est. hours</th>
              <th className="px-3 py-2">Actual hours</th>
              <th className="px-3 py-2">Deadline</th>
              {canEdit && <th className="px-3 py-2">Cancel</th>}
            </tr>
          </thead>
          <tbody>
            {visibleTasks.map((t) => (
              <tr key={t.id} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2 font-medium">{t.title}</td>
                <td className="px-3 py-2">{projectsById.get(t.project_id) ?? "—"}</td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <select
                      value={t.assigned_to ?? ""}
                      onChange={(e) =>
                        updateTask.mutate({ taskId: t.id, patch: { assigned_to: e.target.value || null } })
                      }
                      className="input"
                    >
                      <option value="">Unassigned</option>
                      {(usersQuery.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    usersById.get(t.assigned_to ?? "") ?? "Unassigned"
                  )}
                </td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <select
                      value={t.status}
                      onChange={(e) =>
                        updateTask.mutate({ taskId: t.id, patch: { status: e.target.value as TaskStatus } })
                      }
                      className={`input ${STATUS_STYLE[t.status]}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`font-medium ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      defaultValue={t.estimated_hours ?? ""}
                      onBlur={(e) => {
                        const value = e.target.value === "" ? null : Number(e.target.value);
                        if (value !== (t.estimated_hours ?? null)) {
                          updateTask.mutate({ taskId: t.id, patch: { estimated_hours: value } });
                        }
                      }}
                      className="input w-20"
                    />
                  ) : (
                    (t.estimated_hours ?? "—")
                  )}
                </td>
                <td className="px-3 py-2">{actualHoursByTask.get(t.id) ?? 0}</td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <input
                      type="date"
                      defaultValue={t.deadline ? t.deadline.slice(0, 10) : ""}
                      onBlur={(e) => {
                        const value = e.target.value || null;
                        if (value !== (t.deadline ? t.deadline.slice(0, 10) : null)) {
                          updateTask.mutate({ taskId: t.id, patch: { deadline: value } });
                        }
                      }}
                      className="input"
                    />
                  ) : t.deadline ? (
                    new Date(t.deadline).toLocaleDateString()
                  ) : (
                    "—"
                  )}
                </td>
                {canEdit && (
                  <td className="px-3 py-2">
                    {t.status !== "cancelled" && (
                      <button
                        onClick={() => {
                          if (confirm(`Cancel "${t.title}"? It stays visible under "Show cancelled" and in history.`)) {
                            updateTask.mutate({ taskId: t.id, patch: { status: "cancelled" } });
                          }
                        }}
                        className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-critical)] hover:bg-[var(--color-bg)]"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {visibleTasks.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="px-3 py-4 text-center text-[var(--color-text-muted)]">
                  No tasks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

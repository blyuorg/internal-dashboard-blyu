import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { HistoricalProjects } from "@/components/shell/HistoricalProjects";
import { ActivityLog } from "@/components/shell/ActivityLog";
import { syncTaskToCalendar } from "@/lib/calendarSync";
import type { TaskStatus } from "@/lib/database.types";

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "text-[var(--color-text-muted)]",
  in_progress: "text-[var(--color-accent)]",
  in_review: "text-[var(--color-warn)]",
  blocked: "text-[var(--color-critical)]",
  done: "text-[var(--color-good)]",
};

export default function CtoDashboard() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["projects-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["delivery-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, project_id, assigned_to, status, estimated_hours, deadline")
        .order("deadline", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const timeLogsQuery = useQuery({
    queryKey: ["all-time-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("time_logs").select("task_id, user_id, hours");
      if (error) throw error;
      return data;
    },
  });

  const deliverablesQuery = useQuery({
    queryKey: ["pending-deliverables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("id, task_id, link, review_status, review_notes")
        .eq("review_status", "pending");
      if (error) throw error;
      return data;
    },
  });

  const earningsQuery = useQuery({
    queryKey: ["my-earnings", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_run_lines")
        .select("id, hours, quality_factor, points, amount_paid")
        .eq("user_id", userId!);
      if (error) throw error;
      return data;
    },
  });

  const usersById = useMemo(
    () => new Map((usersQuery.data ?? []).map((u) => [u.id, u.name])),
    [usersQuery.data]
  );
  const projectsById = useMemo(
    () => new Map((projectsQuery.data ?? []).map((p) => [p.id, p.name])),
    [projectsQuery.data]
  );
  const taskTitleById = useMemo(
    () => new Map((tasksQuery.data ?? []).map((t) => [t.id, t.title])),
    [tasksQuery.data]
  );
  const actualHoursByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of timeLogsQuery.data ?? []) {
      map.set(log.task_id, (map.get(log.task_id) ?? 0) + Number(log.hours));
    }
    return map;
  }, [timeLogsQuery.data]);

  const reassign = useMutation({
    mutationFn: async ({ taskId, assignedTo }: { taskId: string; assignedTo: string }) => {
      const { error } = await supabase.from("tasks").update({ assigned_to: assignedTo }).eq("id", taskId);
      if (error) throw error;
      return taskId;
    },
    onSuccess: (taskId) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
      syncTaskToCalendar(taskId);
    },
  });

  const reviewDecision = useMutation({
    mutationFn: async ({
      deliverableId,
      taskId,
      approve,
      notes,
    }: {
      deliverableId: string;
      taskId: string;
      approve: boolean;
      notes: string;
    }) => {
      const { error: delErr } = await supabase
        .from("deliverables")
        .update({
          review_status: approve ? "approved" : "returned",
          reviewed_by: userId,
          review_notes: notes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", deliverableId);
      if (delErr) throw delErr;

      const { error: taskErr } = await supabase
        .from("tasks")
        .update({ status: approve ? "done" : "in_progress" })
        .eq("id", taskId);
      if (taskErr) throw taskErr;

      if (!approve) {
        const { error: auditErr } = await supabase.from("audit_log").insert({
          actor_id: userId,
          action: "rework_returned",
          entity_type: "task",
          entity_id: taskId,
          details_json: { notes },
        });
        if (auditErr) throw auditErr;
      }
      return taskId;
    },
    onSuccess: (taskId) => {
      queryClient.invalidateQueries({ queryKey: ["pending-deliverables"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
      syncTaskToCalendar(taskId);
    },
  });

  const totalPaid = (earningsQuery.data ?? []).reduce((sum, l) => sum + Number(l.amount_paid), 0);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-3 text-lg font-semibold">Delivery pipeline</h1>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Estimate vs actual</th>
                <th className="px-3 py-2">Deadline</th>
                <th className="px-3 py-2">Reassign</th>
              </tr>
            </thead>
            <tbody>
              {(tasksQuery.data ?? []).map((task) => (
                <tr key={task.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{task.title}</td>
                  <td className="px-3 py-2">{projectsById.get(task.project_id) ?? "—"}</td>
                  <td className="px-3 py-2">{usersById.get(task.assigned_to ?? "") ?? "Unassigned"}</td>
                  <td className={`px-3 py-2 font-medium ${STATUS_STYLE[task.status]}`}>{task.status}</td>
                  <td className="px-3 py-2">
                    {task.estimated_hours ?? "—"} / {actualHoursByTask.get(task.id) ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    {task.deadline ? new Date(task.deadline).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) reassign.mutate({ taskId: task.id, assignedTo: e.target.value });
                      }}
                      className="rounded border border-[var(--color-border)] bg-transparent px-1.5 py-1 text-xs"
                    >
                      <option value="">Reassign…</option>
                      {(usersQuery.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Technical review gate</h2>
        <div className="flex flex-col gap-2">
          {(deliverablesQuery.data ?? []).map((d) => (
            <ReviewRow
              key={d.id}
              deliverable={d}
              taskTitle={taskTitleById.get(d.task_id) ?? d.task_id.slice(0, 8)}
              onDecide={(approve, notes) =>
                reviewDecision.mutate({ deliverableId: d.id, taskId: d.task_id, approve, notes })
              }
            />
          ))}
          {deliverablesQuery.data?.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">Nothing pending review.</p>
          )}
        </div>
      </section>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">My earnings</h2>
        <p className="text-2xl font-semibold">₹{totalPaid.toLocaleString("en-IN")}</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Across {earningsQuery.data?.length ?? 0} payout line(s)
        </p>
      </div>

      <ProjectChat projects={projectsQuery.data ?? []} />

      <ActivityLog />

      <HistoricalProjects />
    </div>
  );
}

function ProjectChat({ projects }: { projects: { id: string; name: string }[] }) {
  const [selected, setSelected] = useState("");
  const activeId = selected || projects[0]?.id || "";

  if (projects.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Project chat</h2>
        <select value={activeId} onChange={(e) => setSelected(e.target.value)} className="input">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {activeId && <ChatPanel channelType="project" channelId={activeId} />}
    </section>
  );
}

function ReviewRow({
  deliverable,
  taskTitle,
  onDecide,
}: {
  deliverable: { id: string; task_id: string; link: string; review_notes: string | null };
  taskTitle: string;
  onDecide: (approve: boolean, notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
      <span className="w-40 shrink-0 truncate font-medium">{taskTitle}</span>
      <a href={deliverable.link} target="_blank" rel="noreferrer" className="flex-1 truncate text-[var(--color-accent)]">
        {deliverable.link}
      </a>
      <input
        type="text"
        placeholder="Notes (required to return)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-48 rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-xs"
      />
      <button
        onClick={() => onDecide(true, notes)}
        className="rounded bg-[var(--color-good)] px-2 py-1 text-xs text-white"
      >
        Approve
      </button>
      <button
        onClick={() => notes && onDecide(false, notes)}
        className="rounded bg-[var(--color-critical)] px-2 py-1 text-xs text-white"
      >
        Return
      </button>
    </div>
  );
}

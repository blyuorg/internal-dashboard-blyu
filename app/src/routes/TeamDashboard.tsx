import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MyHoursChart } from "@/components/timer/MyHoursChart";
import { syncTaskToCalendar } from "@/lib/calendarSync";
import type { TaskStatus } from "@/lib/database.types";

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "text-[var(--color-text-muted)]",
  in_progress: "text-[var(--color-accent)]",
  in_review: "text-[var(--color-warn)]",
  blocked: "text-[var(--color-critical)]",
  done: "text-[var(--color-good)]",
};

export default function TeamDashboard() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ["my-tasks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, status, deadline, estimated_hours, deliverable_link, project_id, projects(name)")
        .eq("assigned_to", userId!)
        .order("deadline", { ascending: true });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        status: TaskStatus;
        deadline: string | null;
        estimated_hours: number | null;
        deliverable_link: string | null;
        project_id: string;
        projects: { name: string } | null;
      }>;
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

  const submitForReview = useMutation({
    mutationFn: async ({ taskId, link }: { taskId: string; link: string }) => {
      const { error: taskErr } = await supabase
        .from("tasks")
        .update({ status: "in_review", deliverable_link: link })
        .eq("id", taskId);
      if (taskErr) throw taskErr;
      const { error: delErr } = await supabase.from("deliverables").insert({ task_id: taskId, link });
      if (delErr) throw delErr;
      return taskId;
    },
    onSuccess: (taskId) => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks", userId] });
      syncTaskToCalendar(taskId);
    },
  });

  const logTime = useMutation({
    mutationFn: async ({ taskId, hours }: { taskId: string; hours: number }) => {
      const { error } = await supabase
        .from("time_logs")
        .insert({ task_id: taskId, user_id: userId!, hours, pool_tag: "team" });
      if (error) throw error;
    },
  });

  const logLead = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from("finder_fee_log")
        .insert({ project_id: projectId, logged_by: userId! });
      if (error) throw error;
    },
  });

  const totalPaid = (earningsQuery.data ?? []).reduce((sum, l) => sum + Number(l.amount_paid), 0);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-3 text-lg font-semibold">My tasks</h1>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Deadline</th>
                <th className="px-3 py-2">Est. hours</th>
                <th className="px-3 py-2">Log hours</th>
                <th className="px-3 py-2">Submit</th>
              </tr>
            </thead>
            <tbody>
              {tasksQuery.data?.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onLogTime={(hours) => logTime.mutate({ taskId: task.id, hours })}
                  onSubmit={(link) => submitForReview.mutate({ taskId: task.id, link })}
                />
              ))}
              {tasksQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--color-text-muted)]">
                    No tasks assigned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">My earnings</h2>
          <p className="text-2xl font-semibold">
            ₹{totalPaid.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Across {earningsQuery.data?.length ?? 0} payout line(s)
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">Log a lead</h2>
          <LeadForm projects={projectsQuery.data ?? []} onLog={(id) => logLead.mutate(id)} />
        </div>
      </section>

      <MyHoursChart />

      <ProjectChat tasks={tasksQuery.data ?? []} />
    </div>
  );
}

function ProjectChat({
  tasks,
}: {
  tasks: { project_id: string; projects: { name: string } | null }[];
}) {
  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) map.set(t.project_id, t.projects?.name ?? t.project_id.slice(0, 8));
    return [...map.entries()];
  }, [tasks]);
  const [selected, setSelected] = useState("");
  const activeId = selected || projects[0]?.[0] || "";

  if (projects.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Project chat</h2>
        <select value={activeId} onChange={(e) => setSelected(e.target.value)} className="input">
          {projects.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {activeId && <ChatPanel channelType="project" channelId={activeId} />}
    </section>
  );
}

function TaskRow({
  task,
  onLogTime,
  onSubmit,
}: {
  task: {
    id: string;
    status: TaskStatus;
    deadline: string | null;
    estimated_hours: number | null;
    deliverable_link: string | null;
    projects: { name: string } | null;
  };
  onLogTime: (hours: number) => void;
  onSubmit: (link: string) => void;
}) {
  const [hours, setHours] = useState("");
  const [link, setLink] = useState(task.deliverable_link ?? "");

  return (
    <tr className="border-t border-[var(--color-border)]">
      <td className="px-3 py-2">{task.projects?.name ?? "—"}</td>
      <td className={`px-3 py-2 font-medium ${STATUS_STYLE[task.status]}`}>{task.status}</td>
      <td className="px-3 py-2">{task.deadline ? new Date(task.deadline).toLocaleDateString() : "—"}</td>
      <td className="px-3 py-2">{task.estimated_hours ?? "—"}</td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <input
            type="number"
            min="0"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-16 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-1 text-xs"
            placeholder="hrs"
          />
          <button
            onClick={() => {
              const h = Number(hours);
              if (h > 0) {
                onLogTime(h);
                setHours("");
              }
            }}
            className="rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-[var(--color-accent-fg)]"
          >
            Log
          </button>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="w-32 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-1 text-xs"
            placeholder="deliverable link"
          />
          <button
            onClick={() => link && onSubmit(link)}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
          >
            Submit
          </button>
        </div>
      </td>
    </tr>
  );
}

function LeadForm({
  projects,
  onLog,
}: {
  projects: { id: string; name: string }[];
  onLog: (projectId: string) => void;
}) {
  const [projectId, setProjectId] = useState("");
  return (
    <div className="flex gap-2">
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="flex-1 rounded border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
      >
        <option value="">Select project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => projectId && onLog(projectId)}
        className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent-fg)]"
      >
        Log lead
      </button>
    </div>
  );
}

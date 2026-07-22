import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth, useHasFlag } from "@/lib/auth";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MyHoursChart } from "@/components/timer/MyHoursChart";
import { AssignTaskSection } from "@/components/shell/AssignTaskSection";
import { CreateProjectSection } from "@/components/shell/CreateProjectSection";
import { GlobalTaskTable } from "@/components/shell/GlobalTaskTable";
import { syncTaskToCalendar } from "@/lib/calendarSync";
import type { TaskStatus } from "@/lib/database.types";

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "text-[var(--color-text-muted)]",
  in_progress: "text-[var(--color-accent)]",
  in_review: "text-[var(--color-warn)]",
  blocked: "text-[var(--color-critical)]",
  done: "text-[var(--color-good)]",
  cancelled: "text-[var(--color-text-muted)] line-through",
};

export default function TeamDashboard() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const canAssignTasks = useHasFlag("can_assign_tasks");
  const canCreateProjects = useHasFlag("can_create_projects");

  const tasksQuery = useQuery({
    queryKey: ["my-tasks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, deadline, estimated_hours, deliverable_link, project_id, projects(name)")
        .eq("assigned_to", userId!)
        .order("deadline", { ascending: true });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        title: string;
        status: TaskStatus;
        deadline: string | null;
        estimated_hours: number | null;
        deliverable_link: string | null;
        project_id: string;
        projects: { name: string } | null;
      }>;
    },
  });

  const submitForReview = useMutation({
    mutationFn: async ({ taskId, link, note }: { taskId: string; link: string; note: string }) => {
      const { error: taskErr } = await supabase
        .from("tasks")
        .update({ status: "in_review", deliverable_link: link || null })
        .eq("id", taskId);
      if (taskErr) throw taskErr;
      const { error: delErr } = await supabase
        .from("deliverables")
        .insert({ task_id: taskId, link: link || null, note: note || null });
      if (delErr) throw delErr;
      return taskId;
    },
    onSuccess: (taskId) => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks", userId] });
      syncTaskToCalendar(taskId);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {canCreateProjects && <CreateProjectSection />}
      {canAssignTasks && <AssignTaskSection />}
      <GlobalTaskTable />

      <section>
        <h1 className="mb-3 text-lg font-semibold">My tasks</h1>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Deadline</th>
                <th className="px-3 py-2">Est. hours</th>
                <th className="px-3 py-2">Submit</th>
              </tr>
            </thead>
            <tbody>
              {tasksQuery.data?.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onSubmit={(link, note) => submitForReview.mutate({ taskId: task.id, link, note })}
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
  onSubmit,
}: {
  task: {
    id: string;
    title: string;
    status: TaskStatus;
    deadline: string | null;
    estimated_hours: number | null;
    deliverable_link: string | null;
    projects: { name: string } | null;
  };
  onSubmit: (link: string, note: string) => void;
}) {
  const [link, setLink] = useState(task.deliverable_link ?? "");
  const [note, setNote] = useState("");

  const canSubmit = link.trim().length > 0 || note.trim().length > 0;

  return (
    <tr className="border-t border-[var(--color-border)]">
      <td className="px-3 py-2 font-medium">{task.title}</td>
      <td className="px-3 py-2">{task.projects?.name ?? "—"}</td>
      <td className={`px-3 py-2 font-medium ${STATUS_STYLE[task.status]}`}>{task.status}</td>
      <td className="px-3 py-2">{task.deadline ? new Date(task.deadline).toLocaleDateString() : "—"}</td>
      <td className="px-3 py-2">{task.estimated_hours ?? "—"}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="w-40 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-1 text-xs"
            placeholder="deliverable link (optional)"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-40 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-1 text-xs"
            placeholder="note (optional)"
          />
          <button
            onClick={() => canSubmit && onSubmit(link.trim(), note.trim())}
            disabled={!canSubmit}
            title={canSubmit ? undefined : "A link or a note is required"}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs disabled:opacity-40"
          >
            Submit
          </button>
        </div>
      </td>
    </tr>
  );
}

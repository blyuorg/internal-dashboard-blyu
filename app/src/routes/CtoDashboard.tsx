import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { HistoricalProjects } from "@/components/shell/HistoricalProjects";
import { ActivityLog } from "@/components/shell/ActivityLog";
import { GlobalTaskTable } from "@/components/shell/GlobalTaskTable";

export default function CtoDashboard() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ["projects-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const taskTitlesQuery = useQuery({
    queryKey: ["task-titles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("id, title");
      if (error) throw error;
      return data;
    },
  });

  const deliverablesQuery = useQuery({
    queryKey: ["pending-deliverables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("id, task_id, link, note, review_status, review_notes")
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

  const taskTitleById = useMemo(
    () => new Map((taskTitlesQuery.data ?? []).map((t) => [t.id, t.title])),
    [taskTitlesQuery.data]
  );

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-deliverables"] });
      queryClient.invalidateQueries({ queryKey: ["global-tasks"] });
    },
  });

  const totalPaid = (earningsQuery.data ?? []).reduce((sum, l) => sum + Number(l.amount_paid), 0);

  return (
    <div className="flex flex-col gap-6">
      <GlobalTaskTable />

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
  deliverable: {
    id: string;
    task_id: string;
    link: string | null;
    note: string | null;
    review_notes: string | null;
  };
  taskTitle: string;
  onDecide: (approve: boolean, notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
      <span className="w-40 shrink-0 truncate font-medium">{taskTitle}</span>
      <div className="flex-1 truncate">
        {deliverable.link && (
          <a href={deliverable.link} target="_blank" rel="noreferrer" className="text-[var(--color-accent)]">
            {deliverable.link}
          </a>
        )}
        {deliverable.note && (
          <p className={deliverable.link ? "text-xs text-[var(--color-text-muted)]" : ""}>
            {deliverable.note}
          </p>
        )}
      </div>
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

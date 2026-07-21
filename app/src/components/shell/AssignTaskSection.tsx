import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { syncTaskToCalendar } from "@/lib/calendarSync";

// Self-contained so any dashboard can drop it in: fetches its own
// projects/users, owns its own mutation. RLS lets anyone with
// can_assign_tasks (or base role ceo/cto) insert a task — this component is
// what actually surfaces that ability in the UI, since previously only the
// CEO dashboard had a form for it, so granting the flag to e.g. a CFO did
// nothing observable.
export function AssignTaskSection() {
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

  const usersQuery = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const assignTask = useMutation({
    mutationFn: async (input: {
      projectId: string;
      assignedTo: string;
      roleTag: string;
      estimatedHours: number;
      deadline: string;
      deliverableLink: string;
    }) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          project_id: input.projectId,
          assigned_to: input.assignedTo,
          assigned_by: userId,
          role_tag: input.roleTag || null,
          estimated_hours: input.estimatedHours,
          deadline: input.deadline || null,
          deliverable_link: input.deliverableLink || null,
          status: "todo",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      if (data?.id) syncTaskToCalendar(data.id);
    },
  });

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Assign a task</h2>
      {projectsQuery.data?.length === 0 && (
        <p className="mb-2 text-sm text-[var(--color-text-muted)]">No active projects to assign against yet.</p>
      )}
      <TaskAssignForm
        projects={projectsQuery.data ?? []}
        users={usersQuery.data ?? []}
        onAssign={(input) => assignTask.mutate(input)}
      />
    </section>
  );
}

function TaskAssignForm({
  projects,
  users,
  onAssign,
}: {
  projects: { id: string; name: string }[];
  users: { id: string; name: string }[];
  onAssign: (input: {
    projectId: string;
    assignedTo: string;
    roleTag: string;
    estimatedHours: number;
    deadline: string;
    deliverableLink: string;
  }) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [roleTag, setRoleTag] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [deadline, setDeadline] = useState("");
  const [deliverableLink, setDeliverableLink] = useState("");

  function submit() {
    if (!projectId || !assignedTo || !estimatedHours) return;
    onAssign({
      projectId,
      assignedTo,
      roleTag,
      estimatedHours: Number(estimatedHours),
      deadline,
      deliverableLink,
    });
    setRoleTag("");
    setEstimatedHours("");
    setDeadline("");
    setDeliverableLink("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <Field label="Project">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
          <option value="">Select…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Assignee">
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="input">
          <option value="">Select…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Role tag">
        <input value={roleTag} onChange={(e) => setRoleTag(e.target.value)} className="input" placeholder="e.g. frontend" />
      </Field>
      <Field label="Est. hours">
        <input
          type="number"
          min="0"
          step="0.5"
          value={estimatedHours}
          onChange={(e) => setEstimatedHours(e.target.value)}
          className="input w-20"
        />
      </Field>
      <Field label="Deadline">
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input" />
      </Field>
      <Field label="Deliverable link">
        <input value={deliverableLink} onChange={(e) => setDeliverableLink(e.target.value)} className="input" placeholder="required" />
      </Field>
      <button onClick={submit} className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm text-[var(--color-accent-fg)]">
        Assign
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
      {label}
      {children}
    </label>
  );
}

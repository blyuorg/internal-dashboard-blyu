import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ExportButton } from "@/components/shell/ExportButton";
import { HistoricalProjects } from "@/components/shell/HistoricalProjects";
import { ActivityLog } from "@/components/shell/ActivityLog";
import { AssignTaskSection } from "@/components/shell/AssignTaskSection";
import { syncTaskToCalendar } from "@/lib/calendarSync";
import type { CapabilityFlag, TaskStatus } from "@/lib/database.types";

const ALL_FLAGS: CapabilityFlag[] = [
  "can_assign_tasks",
  "can_monitor_tasks",
  "can_review_deliverables",
  "can_see_team_earnings",
  "can_run_payouts",
  "can_log_direct_costs",
  "can_approve_founder_hours",
  "can_export_financial_data",
  "can_export_task_data",
  "is_admin_ceo",
  "is_admin_cto",
  "is_admin_cfo",
];

export default function CeoDashboard() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("id, name, base_role");
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
    queryKey: ["all-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, project_id, assigned_to, status, estimated_hours, deadline");
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

  const signoffQueueQuery = useQuery({
    queryKey: ["signoff-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("id, task_id, link, review_status, review_notes")
        .eq("review_status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const flagsQuery = useQuery({
    queryKey: ["all-flags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_capability_flags").select("*");
      if (error) throw error;
      return data;
    },
  });

  const projectsById = useMemo(
    () => new Map((projectsQuery.data ?? []).map((p) => [p.id, p.name])),
    [projectsQuery.data]
  );
  const capacityByUser = useMemo(() => {
    const map = new Map<string, { assigned: number; logged: number }>();
    for (const t of tasksQuery.data ?? []) {
      if (!t.assigned_to) continue;
      const entry = map.get(t.assigned_to) ?? { assigned: 0, logged: 0 };
      entry.assigned += Number(t.estimated_hours ?? 0);
      map.set(t.assigned_to, entry);
    }
    for (const l of timeLogsQuery.data ?? []) {
      const entry = map.get(l.user_id) ?? { assigned: 0, logged: 0 };
      entry.logged += Number(l.hours);
      map.set(l.user_id, entry);
    }
    return map;
  }, [tasksQuery.data, timeLogsQuery.data]);

  const createProject = useMutation({
    mutationFn: async (input: { name: string; clientName: string; contractValue: number }) => {
      const { error } = await supabase.from("projects").insert({
        name: input.name,
        client_name: input.clientName,
        contract_value: input.contractValue,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Every dashboard's project dropdown shares this query key, so this
      // single invalidate refreshes the "Assign a task" picker immediately.
      queryClient.invalidateQueries({ queryKey: ["projects-active"] });
      queryClient.invalidateQueries({ queryKey: ["projects-all"] });
      queryClient.invalidateQueries({ queryKey: ["historical-projects"] });
    },
  });

  // Archiving (never deleting) is the only "removal" path per the
  // never-hard-delete rule — an archived project stays fully queryable
  // under Historical project lookup, just filtered out of active pickers.
  const archiveProject = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects-active"] });
      queryClient.invalidateQueries({ queryKey: ["projects-all"] });
      queryClient.invalidateQueries({ queryKey: ["historical-projects"] });
    },
  });

  const signoffDecision = useMutation({
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
      const nextTaskStatus: TaskStatus = approve ? "done" : "in_progress";
      const { error: taskErr } = await supabase
        .from("tasks")
        .update({ status: nextTaskStatus })
        .eq("id", taskId);
      if (taskErr) throw taskErr;

      const { error: delErr } = await supabase
        .from("deliverables")
        .update({
          review_status: approve ? "approved" : "returned",
          review_notes: notes || null,
        })
        .eq("id", deliverableId);
      if (delErr) throw delErr;

      if (!approve) {
        const { error: auditErr } = await supabase.from("audit_log").insert({
          actor_id: userId,
          action: "signoff_kicked_back",
          entity_type: "task",
          entity_id: taskId,
          details_json: { notes },
        });
        if (auditErr) throw auditErr;
      }
      return taskId;
    },
    onSuccess: (taskId) => {
      queryClient.invalidateQueries({ queryKey: ["signoff-queue"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      syncTaskToCalendar(taskId);
    },
  });

  const toggleFlag = useMutation({
    mutationFn: async ({
      targetUserId,
      flag,
      enabled,
    }: {
      targetUserId: string;
      flag: CapabilityFlag;
      enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("user_capability_flags")
        .upsert(
          { user_id: targetUserId, flag_name: flag, enabled, granted_by: userId, granted_at: new Date().toISOString() },
          { onConflict: "user_id,flag_name" }
        );
      if (error) throw error;

      const { error: auditErr } = await supabase.from("audit_log").insert({
        actor_id: userId,
        action: enabled ? "flag_granted" : "flag_revoked",
        entity_type: "user_capability_flags",
        entity_id: targetUserId,
        details_json: { flag },
      });
      if (auditErr) throw auditErr;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-flags"] }),
  });

  const enabledFlagSet = useMemo(() => {
    const map = new Map<string, Set<CapabilityFlag>>();
    for (const f of flagsQuery.data ?? []) {
      if (!f.enabled) continue;
      const set = map.get(f.user_id) ?? new Set<CapabilityFlag>();
      set.add(f.flag_name);
      map.set(f.user_id, set);
    }
    return map;
  }, [flagsQuery.data]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-3 text-lg font-semibold">New project</h1>
        <NewProjectForm onCreate={(input) => createProject.mutate(input)} />
        {(projectsQuery.data?.length ?? 0) > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {(projectsQuery.data ?? []).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded border border-[var(--color-border)] px-3 py-1.5"
              >
                <span>{p.name}</span>
                <button
                  onClick={() => {
                    if (confirm(`Archive "${p.name}"? It stays fully visible under Historical project lookup.`)) {
                      archiveProject.mutate(p.id);
                    }
                  }}
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
                >
                  Archive
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AssignTaskSection />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Team capacity</h2>
          <ExportButton
            requiresFlag="can_export_task_data"
            filename="team-capacity"
            rows={() =>
              (usersQuery.data ?? []).map((u) => {
                const cap = capacityByUser.get(u.id) ?? { assigned: 0, logged: 0 };
                return { Person: u.name, "Hours assigned": cap.assigned, "Hours logged": cap.logged };
              })
            }
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Hours assigned</th>
                <th className="px-3 py-2">Hours logged</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data ?? []).map((u) => {
                const cap = capacityByUser.get(u.id) ?? { assigned: 0, logged: 0 };
                return (
                  <tr key={u.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{cap.assigned}</td>
                    <td className="px-3 py-2">{cap.logged}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Final sign-off queue</h2>
        <div className="flex flex-col gap-2">
          {(signoffQueueQuery.data ?? []).map((d) => (
            <SignoffRow
              key={d.id}
              deliverable={d}
              projectName={projectsById.get(d.task_id)}
              onDecide={(approve, notes) =>
                signoffDecision.mutate({ deliverableId: d.id, taskId: d.task_id, approve, notes })
              }
            />
          ))}
          {signoffQueueQuery.data?.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">Nothing awaiting sign-off.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Role &amp; permission management</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Base role</th>
                {ALL_FLAGS.map((f) => (
                  <th key={f} className="whitespace-nowrap px-2 py-2">
                    {f.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data ?? []).map((u) => (
                <tr key={u.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{u.name}</td>
                  <td className="px-3 py-2">{u.base_role}</td>
                  {ALL_FLAGS.map((flag) => {
                    const checked = enabledFlagSet.get(u.id)?.has(flag) ?? false;
                    return (
                      <td key={flag} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            toggleFlag.mutate({ targetUserId: u.id, flag, enabled: e.target.checked })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ActivityLog />

      <HistoricalProjects />
    </div>
  );
}

function NewProjectForm({
  onCreate,
}: {
  onCreate: (input: { name: string; clientName: string; contractValue: number }) => void;
}) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [contractValue, setContractValue] = useState("");

  function submit() {
    if (!name || !clientName) return;
    onCreate({ name, clientName, contractValue: Number(contractValue || 0) });
    setName("");
    setClientName("");
    setContractValue("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <Field label="Project name">
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Acme Website Revamp" />
      </Field>
      <Field label="Client">
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="input" placeholder="e.g. Acme Corp" />
      </Field>
      <Field label="Contract value">
        <input
          type="number"
          min="0"
          value={contractValue}
          onChange={(e) => setContractValue(e.target.value)}
          className="input w-32"
          placeholder="0"
        />
      </Field>
      <button onClick={submit} className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm text-[var(--color-accent-fg)]">
        Create project
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
      {label}
      {children}
    </label>
  );
}

function SignoffRow({
  deliverable,
  projectName,
  onDecide,
}: {
  deliverable: { id: string; task_id: string; link: string };
  projectName?: string;
  onDecide: (approve: boolean, notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
      <span className="w-32 truncate text-[var(--color-text-muted)]">{projectName ?? deliverable.task_id.slice(0, 8)}</span>
      <a href={deliverable.link} target="_blank" rel="noreferrer" className="flex-1 truncate text-[var(--color-accent)]">
        {deliverable.link}
      </a>
      <input
        type="text"
        placeholder="Note (required to kick back)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-48 rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-xs"
      />
      <button onClick={() => onDecide(true, notes)} className="rounded bg-[var(--color-good)] px-2 py-1 text-xs text-white">
        Approve
      </button>
      <button
        onClick={() => notes && onDecide(false, notes)}
        className="rounded bg-[var(--color-critical)] px-2 py-1 text-xs text-white"
      >
        Kick back
      </button>
    </div>
  );
}

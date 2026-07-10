import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ExportButton } from "./ExportButton";

export function HistoricalProjects() {
  const { profile, flags } = useAuth();
  const canReactivate = profile?.base_role === "ceo" || flags.has("is_admin_ceo");
  const queryClient = useQueryClient();
  const [clientFilter, setClientFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");

  const projectsQuery = useQuery({
    queryKey: ["historical-projects"],
    queryFn: async () => {
      // Archived projects are never hard-deleted; this queries both statuses.
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client_name, contract_value, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["historical-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("id, project_id");
      if (error) throw error;
      return data;
    },
  });

  const timeLogsQuery = useQuery({
    queryKey: ["historical-time-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("time_logs").select("task_id, hours");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    return (projectsQuery.data ?? []).filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (clientFilter && !p.client_name.toLowerCase().includes(clientFilter.toLowerCase())) return false;
      if (from && p.created_at < from) return false;
      if (to && p.created_at > to) return false;
      return true;
    });
  }, [projectsQuery.data, clientFilter, from, to, statusFilter]);

  const hoursByProject = useMemo(() => {
    const projectByTask = new Map((tasksQuery.data ?? []).map((t) => [t.id, t.project_id]));
    const map = new Map<string, number>();
    for (const log of timeLogsQuery.data ?? []) {
      const projectId = projectByTask.get(log.task_id);
      if (!projectId) continue;
      map.set(projectId, (map.get(projectId) ?? 0) + Number(log.hours));
    }
    return map;
  }, [tasksQuery.data, timeLogsQuery.data]);

  const reactivate = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from("projects").update({ status: "active" }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["historical-projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects-active"] });
      queryClient.invalidateQueries({ queryKey: ["projects-all"] });
    },
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Historical project lookup</h2>
        <ExportButton
          requiresFlag="can_export_task_data"
          filename="historical-projects"
          rows={() =>
            filtered.map((p) => ({
              Project: p.name,
              Client: p.client_name,
              "Contract value": p.contract_value,
              Status: p.status,
              "Created at": p.created_at,
              "Est. hours": hoursByProject.get(p.id) ?? "",
            }))
          }
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Client…"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="input"
        />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "archived")}
          className="input"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Contract value</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Logged hours</th>
              <th className="px-3 py-2">Created</th>
              {canReactivate && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{p.client_name}</td>
                <td className="px-3 py-2">₹{Number(p.contract_value).toLocaleString("en-IN")}</td>
                <td
                  className={`px-3 py-2 font-medium ${
                    p.status === "archived" ? "text-[var(--color-text-muted)]" : "text-[var(--color-good)]"
                  }`}
                >
                  {p.status}
                </td>
                <td className="px-3 py-2">{hoursByProject.get(p.id) ?? 0}</td>
                <td className="px-3 py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                {canReactivate && (
                  <td className="px-3 py-2">
                    {p.status === "archived" && (
                      <button
                        onClick={() => reactivate.mutate(p.id)}
                        className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canReactivate ? 7 : 6} className="px-3 py-4 text-center text-[var(--color-text-muted)]">
                  No projects match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

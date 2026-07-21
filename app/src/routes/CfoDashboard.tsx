import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth, useHasFlag } from "@/lib/auth";
import { ExportButton } from "@/components/shell/ExportButton";
import { HistoricalProjects } from "@/components/shell/HistoricalProjects";
import { ActivityLog } from "@/components/shell/ActivityLog";
import { AssignTaskSection } from "@/components/shell/AssignTaskSection";

export default function CfoDashboard() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const canAssignTasks = useHasFlag("can_assign_tasks");

  const projectsQuery = useQuery({
    queryKey: ["projects-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const cashLedgerQuery = useQuery({
    queryKey: ["cash-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("id, project_id, invoice_amount, amount_collected, collected_date, payment_type")
        .order("collected_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const directCostsQuery = useQuery({
    queryKey: ["direct-costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_costs")
        .select("id, project_id, description, amount, logged_at")
        .order("logged_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const configQuery = useQuery({
    queryKey: ["payout-config-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_config")
        .select("*")
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const payoutRunsQuery = useQuery({
    queryKey: ["payout-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_runs")
        .select("id, project_id, period_start, period_end, status, total_distributed, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Includes archived projects too, so payout run history for a since-closed
  // project still shows its name — nothing about past pay data should look
  // blank just because the project itself was archived later.
  const allProjectsQuery = useQuery({
    queryKey: ["projects-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const projectsById = useMemo(
    () => new Map((projectsQuery.data ?? []).map((p) => [p.id, p.name])),
    [projectsQuery.data]
  );

  const allProjectsById = useMemo(
    () => new Map((allProjectsQuery.data ?? []).map((p) => [p.id, p.name])),
    [allProjectsQuery.data]
  );

  // Finder's fee (10% pool) recipient is now chosen manually by the CFO per
  // payout run / export — no more automatic "first person to log a lead
  // wins" — so the picker needs the full org roster, not just people who
  // logged hours.
  const allUsersQuery = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const collectedByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of cashLedgerQuery.data ?? []) {
      map.set(row.project_id, (map.get(row.project_id) ?? 0) + Number(row.amount_collected));
    }
    return map;
  }, [cashLedgerQuery.data]);

  const costsByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of directCostsQuery.data ?? []) {
      map.set(row.project_id, (map.get(row.project_id) ?? 0) + Number(row.amount));
    }
    return map;
  }, [directCostsQuery.data]);

  const reservePct = Number(configQuery.data?.reserve_pct ?? 0.15);
  const reserveByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const [projectId, collected] of collectedByProject) {
      map.set(projectId, collected * reservePct);
    }
    return map;
  }, [collectedByProject, reservePct]);

  const totalReserve = [...reserveByProject.values()].reduce((a, b) => a + b, 0);

  const addCashRow = useMutation({
    mutationFn: async (input: {
      projectId: string;
      invoiceAmount: number;
      amountCollected: number;
      collectedDate: string;
      paymentType: "advance" | "completion";
    }) => {
      const { error } = await supabase.from("cash_ledger").insert({
        project_id: input.projectId,
        invoice_amount: input.invoiceAmount,
        amount_collected: input.amountCollected,
        collected_date: input.collectedDate || null,
        payment_type: input.paymentType,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cash-ledger"] }),
  });

  const addDirectCost = useMutation({
    mutationFn: async (input: { projectId: string; description: string; amount: number }) => {
      const { error } = await supabase.from("direct_costs").insert({
        project_id: input.projectId,
        description: input.description,
        amount: input.amount,
        logged_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["direct-costs"] }),
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-3 gap-4">
        <StatTile
          label="Cash collected"
          value={[...collectedByProject.values()].reduce((a, b) => a + b, 0)}
        />
        <StatTile label="Direct costs" value={[...costsByProject.values()].reduce((a, b) => a + b, 0)} />
        <StatTile label={`Reserve (${(reservePct * 100).toFixed(0)}%)`} value={totalReserve} />
      </section>

      {canAssignTasks && <AssignTaskSection />}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Cash ledger</h1>
          <ExportButton
            requiresFlag="can_export_financial_data"
            filename="cash-ledger"
            rows={() =>
              (cashLedgerQuery.data ?? []).map((row) => ({
                Project: projectsById.get(row.project_id) ?? "",
                Type: row.payment_type,
                "Invoice amount": row.invoice_amount,
                "Amount collected": row.amount_collected,
                "Collected date": row.collected_date ?? "",
              }))
            }
          />
        </div>
        <CashLedgerForm
          projects={projectsQuery.data ?? []}
          onAdd={(input) => addCashRow.mutate(input)}
        />
        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Collected</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(cashLedgerQuery.data ?? []).map((row) => {
                const overdue = !row.collected_date && row.amount_collected < row.invoice_amount;
                return (
                  <tr key={row.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">{projectsById.get(row.project_id) ?? "—"}</td>
                    <td className="px-3 py-2">{row.payment_type}</td>
                    <td className="px-3 py-2">₹{Number(row.invoice_amount).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2">₹{Number(row.amount_collected).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2">{row.collected_date ?? "—"}</td>
                    <td
                      className={`px-3 py-2 font-medium ${
                        overdue ? "text-[var(--color-critical)]" : "text-[var(--color-good)]"
                      }`}
                    >
                      {overdue ? "overdue" : "collected"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Direct costs</h2>
        <DirectCostForm projects={projectsQuery.data ?? []} onAdd={(input) => addDirectCost.mutate(input)} />
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {(directCostsQuery.data ?? []).map((c) => (
            <li key={c.id} className="flex justify-between rounded border border-[var(--color-border)] px-3 py-1.5">
              <span>
                {projectsById.get(c.project_id) ?? "—"} — {c.description}
              </span>
              <span>₹{Number(c.amount).toLocaleString("en-IN")}</span>
            </li>
          ))}
        </ul>
      </section>

      <PayoutEngine
        projects={projectsQuery.data ?? []}
        config={configQuery.data ?? null}
        collectedByProject={collectedByProject}
        costsByProject={costsByProject}
        reserveByProject={reserveByProject}
        existingRuns={payoutRunsQuery.data ?? []}
        allUsers={allUsersQuery.data ?? []}
        generatedBy={userId ?? ""}
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payout run history</h2>
          <ExportButton
            requiresFlag="can_export_financial_data"
            filename="payout-run-history"
            rows={() =>
              (payoutRunsQuery.data ?? []).map((r) => ({
                Project: r.project_id ? allProjectsById.get(r.project_id) ?? r.project_id : "—",
                Period: `${r.period_start} to ${r.period_end}`,
                Status: r.status,
                "Total distributed": r.total_distributed,
              }))
            }
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Total distributed</th>
              </tr>
            </thead>
            <tbody>
              {(payoutRunsQuery.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">
                    {r.project_id ? allProjectsById.get(r.project_id) ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.period_start} → {r.period_end}
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">₹{Number(r.total_distributed).toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {payoutRunsQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-[var(--color-text-muted)]">
                    No payout runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ProjectHoursExport
        projects={projectsQuery.data ?? []}
        config={configQuery.data ?? null}
        collectedByProject={collectedByProject}
        costsByProject={costsByProject}
        reserveByProject={reserveByProject}
        allUsers={allUsersQuery.data ?? []}
      />

      <ActivityLog />

      <HistoricalProjects />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="text-xl font-semibold">₹{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

function CashLedgerForm({
  projects,
  onAdd,
}: {
  projects: { id: string; name: string }[];
  onAdd: (input: {
    projectId: string;
    invoiceAmount: number;
    amountCollected: number;
    collectedDate: string;
    paymentType: "advance" | "completion";
  }) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [amountCollected, setAmountCollected] = useState("");
  const [collectedDate, setCollectedDate] = useState("");
  const [paymentType, setPaymentType] = useState<"advance" | "completion">("advance");

  function submit() {
    if (!projectId || !invoiceAmount) return;
    onAdd({
      projectId,
      invoiceAmount: Number(invoiceAmount),
      amountCollected: Number(amountCollected || 0),
      collectedDate,
      paymentType,
    });
    setInvoiceAmount("");
    setAmountCollected("");
    setCollectedDate("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
        <option value="">Project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as "advance" | "completion")} className="input">
        <option value="advance">advance</option>
        <option value="completion">completion</option>
      </select>
      <input
        type="number"
        placeholder="Invoice amount"
        value={invoiceAmount}
        onChange={(e) => setInvoiceAmount(e.target.value)}
        className="input w-32"
      />
      <input
        type="number"
        placeholder="Amount collected"
        value={amountCollected}
        onChange={(e) => setAmountCollected(e.target.value)}
        className="input w-32"
      />
      <input type="date" value={collectedDate} onChange={(e) => setCollectedDate(e.target.value)} className="input" />
      <button onClick={submit} className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent-fg)]">
        Add
      </button>
    </div>
  );
}

function DirectCostForm({
  projects,
  onAdd,
}: {
  projects: { id: string; name: string }[];
  onAdd: (input: { projectId: string; description: string; amount: number }) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  function submit() {
    if (!projectId || !description || !amount) return;
    onAdd({ projectId, description, amount: Number(amount) });
    setDescription("");
    setAmount("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
        <option value="">Project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="input"
      />
      <input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="input w-28" />
      <button onClick={submit} className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent-fg)]">
        Log cost
      </button>
    </div>
  );
}

type QualityTier = "rework" | "met_specification" | "above_expectations";

function PayoutEngine({
  projects,
  config,
  collectedByProject,
  costsByProject,
  reserveByProject,
  existingRuns,
  allUsers,
  generatedBy,
}: {
  projects: { id: string; name: string }[];
  config: import("@/lib/database.types").PayoutConfigRow | null;
  collectedByProject: Map<string, number>;
  costsByProject: Map<string, number>;
  reserveByProject: Map<string, number>;
  existingRuns: { project_id: string | null; period_start: string; period_end: string }[];
  allUsers: { id: string; name: string }[];
  generatedBy: string;
}) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [qualityByUser, setQualityByUser] = useState<Record<string, QualityTier>>({});
  // Finder's fee (10% pool) recipient — manually chosen by the CFO, not
  // auto-attributed. Left unset ("") until the run explicitly includes it.
  const [finderUserId, setFinderUserId] = useState("");

  const overlappingRun = useMemo(() => {
    if (!projectId || !periodStart || !periodEnd) return null;
    return (
      existingRuns.find(
        (r) =>
          r.project_id === projectId && periodStart <= r.period_end && periodEnd >= r.period_start
      ) ?? null
    );
  }, [existingRuns, projectId, periodStart, periodEnd]);

  // Scoped to [periodStart, periodEnd] (inclusive) by log_date — critical so
  // a second payout run for the same project doesn't re-pay hours already
  // covered by an earlier run. Nothing is ever deleted from time_logs, so as
  // long as periods don't overlap, every logged hour gets paid exactly once.
  const teamHoursQuery = useQuery({
    queryKey: ["team-hours-for-payout", projectId, periodStart, periodEnd],
    enabled: !!projectId && !!periodStart && !!periodEnd,
    queryFn: async () => {
      const { data: tasks, error: tasksErr } = await supabase
        .from("tasks")
        .select("id, assigned_to")
        .eq("project_id", projectId);
      if (tasksErr) throw tasksErr;
      const taskIds = (tasks ?? []).map((t) => t.id);
      if (taskIds.length === 0) return { logs: [], users: [] };
      const { data: logs, error: logsErr } = await supabase
        .from("time_logs")
        .select("user_id, hours, pool_tag")
        .in("task_id", taskIds)
        .eq("pool_tag", "team")
        .gte("log_date", periodStart)
        .lte("log_date", periodEnd);
      if (logsErr) throw logsErr;
      const userIds = [...new Set((logs ?? []).map((l) => l.user_id))];
      const { data: users, error: usersErr } =
        userIds.length > 0
          ? await supabase.from("users").select("id, name").in("id", userIds)
          : { data: [], error: null };
      if (usersErr) throw usersErr;
      return { logs: logs ?? [], users: users ?? [] };
    },
  });

  const hoursByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of teamHoursQuery.data?.logs ?? []) {
      map.set(log.user_id, (map.get(log.user_id) ?? 0) + Number(log.hours));
    }
    return map;
  }, [teamHoursQuery.data]);

  const qualityRule = config?.quality_factor_rule_json ?? {
    rework: 0.9,
    met_specification: 1.0,
    above_expectations: 1.1,
  };
  const roleWeights = config?.role_weights_json ?? {};
  const poolSplit = config?.pool_split_json ?? {
    kpi_team_pool_pct: 0.6,
    founder_pool_pct: 0.3,
    finders_fee_pool_pct: 0.1,
  };

  const cashCollected = collectedByProject.get(projectId) ?? 0;
  const directCosts = costsByProject.get(projectId) ?? 0;
  const reserve = reserveByProject.get(projectId) ?? 0;
  const remainingProfit = Math.max(0, cashCollected - directCosts - reserve);
  const kpiTeamPool = remainingProfit * poolSplit.kpi_team_pool_pct;
  const founderPool = remainingProfit * poolSplit.founder_pool_pct;
  const findersFeePool = remainingProfit * poolSplit.finders_fee_pool_pct;

  const lines = useMemo(() => {
    const totalPoints = [...hoursByUser.entries()].reduce((sum, [userId, hours]) => {
      const qf = qualityRule[qualityByUser[userId] ?? "met_specification"];
      const rw = roleWeights[userId] ?? 1;
      return sum + hours * rw * qf;
    }, 0);
    return [...hoursByUser.entries()].map(([userId, hours]) => {
      const tier = qualityByUser[userId] ?? "met_specification";
      const qf = qualityRule[tier];
      const rw = roleWeights[userId] ?? 1;
      const points = hours * rw * qf;
      const amount = totalPoints > 0 ? (points / totalPoints) * kpiTeamPool : 0;
      return { userId, hours, roleWeight: rw, qualityFactor: qf, points, amount };
    });
  }, [hoursByUser, qualityByUser, qualityRule, roleWeights, kpiTeamPool]);

  const runPayout = useMutation({
    mutationFn: async () => {
      if (!config) throw new Error("No active payout config");
      const { data: run, error: runErr } = await supabase
        .from("payout_runs")
        .insert({
          project_id: projectId,
          period_start: periodStart,
          period_end: periodEnd,
          config_snapshot_json: config,
          generated_by: generatedBy,
          status: "draft",
          total_distributed: remainingProfit,
        })
        .select("id")
        .single();
      if (runErr) throw runErr;

      const rows = lines.map((l) => ({
        payout_run_id: run.id,
        user_id: l.userId,
        hours: l.hours,
        role_weight: l.roleWeight,
        quality_factor: l.qualityFactor,
        points: l.points,
        amount_paid: l.amount,
      }));

      if (finderUserId) {
        rows.push({
          payout_run_id: run.id,
          user_id: finderUserId,
          hours: 0,
          role_weight: 1,
          quality_factor: 1,
          points: 0,
          amount_paid: findersFeePool,
        });
      }

      if (rows.length > 0) {
        const { error: linesErr } = await supabase.from("payout_run_lines").insert(rows);
        if (linesErr) throw linesErr;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payout-runs"] }),
  });

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Payout engine</h2>
      <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-end gap-2">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
            <option value="">Project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="input" />
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="input" />
        </div>

        {projectId && (
          <>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <Waterfall label="Cash collected" value={cashCollected} />
              <Waterfall label="− Direct costs" value={-directCosts} />
              <Waterfall label={`− Reserve (${((config?.reserve_pct ?? 0.15) * 100).toFixed(0)}%)`} value={-reserve} />
              <Waterfall label="= Remaining profit" value={remainingProfit} bold />
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Waterfall label={`KPI team pool (${(poolSplit.kpi_team_pool_pct * 100).toFixed(0)}%)`} value={kpiTeamPool} />
              <Waterfall label={`Founder pool (${(poolSplit.founder_pool_pct * 100).toFixed(0)}%)`} value={founderPool} />
              <Waterfall label={`Finder's fee pool (${(poolSplit.finders_fee_pool_pct * 100).toFixed(0)}%)`} value={findersFeePool} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">
                KPI team pool distribution
              </h3>
              <table className="w-full text-left text-sm">
                <thead className="text-[var(--color-text-muted)]">
                  <tr>
                    <th className="py-1">Person</th>
                    <th className="py-1">Hours</th>
                    <th className="py-1">Quality</th>
                    <th className="py-1">Points</th>
                    <th className="py-1">₹ share</th>
                  </tr>
                </thead>
                <tbody>
                  {(teamHoursQuery.data?.users ?? []).map((u) => {
                    const line = lines.find((l) => l.userId === u.id);
                    return (
                      <tr key={u.id} className="border-t border-[var(--color-border)]">
                        <td className="py-1">{u.name}</td>
                        <td className="py-1">{line?.hours ?? 0}</td>
                        <td className="py-1">
                          <select
                            value={qualityByUser[u.id] ?? "met_specification"}
                            onChange={(e) =>
                              setQualityByUser((prev) => ({ ...prev, [u.id]: e.target.value as QualityTier }))
                            }
                            className="input"
                          >
                            <option value="rework">Rework (0.9)</option>
                            <option value="met_specification">Met spec (1.0)</option>
                            <option value="above_expectations">Above expectations (1.1)</option>
                          </select>
                        </td>
                        <td className="py-1">{line?.points.toFixed(2) ?? 0}</td>
                        <td className="py-1">₹{(line?.amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-[var(--color-text-muted)]">
                  Finder's fee pool (₹{findersFeePool.toLocaleString("en-IN", { maximumFractionDigits: 0 })}):
                </span>
                <select
                  value={finderUserId}
                  onChange={(e) => setFinderUserId(e.target.value)}
                  className="input"
                >
                  <option value="">Not yet assigned</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {!finderUserId && (
                  <span className="text-[var(--color-warn)]">
                    Will be left unassigned in this run until chosen.
                  </span>
                )}
              </div>
            </div>

            {overlappingRun && (
              <p className="text-sm text-[var(--color-critical)]">
                This period overlaps an existing run ({overlappingRun.period_start} →{" "}
                {overlappingRun.period_end}) for this project — running it would double-pay those hours.
                Pick a non-overlapping period.
              </p>
            )}

            <button
              onClick={() => runPayout.mutate()}
              disabled={!periodStart || !periodEnd || !config || !!overlappingRun}
              className="self-start rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm text-[var(--color-accent-fg)] disabled:opacity-50"
            >
              Run payout
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// Read-only reporting tool: pick a project, see every person who has ever
// logged hours against it (all-time — this is a record-keeping view, not a
// payout run, so it is deliberately not period-scoped) with the payout
// formula applied so the CFO can export a spreadsheet showing hours worked
// and the calculated ₹ share per person, without committing an actual run.
function ProjectHoursExport({
  projects,
  config,
  collectedByProject,
  costsByProject,
  reserveByProject,
  allUsers,
}: {
  projects: { id: string; name: string }[];
  config: import("@/lib/database.types").PayoutConfigRow | null;
  collectedByProject: Map<string, number>;
  costsByProject: Map<string, number>;
  reserveByProject: Map<string, number>;
  allUsers: { id: string; name: string }[];
}) {
  const [projectId, setProjectId] = useState("");
  const [qualityByUser, setQualityByUser] = useState<Record<string, QualityTier>>({});
  const [finderUserId, setFinderUserId] = useState("");

  const projectName = projects.find((p) => p.id === projectId)?.name ?? "";

  const hoursQuery = useQuery({
    queryKey: ["project-hours-export", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data: tasks, error: tasksErr } = await supabase
        .from("tasks")
        .select("id")
        .eq("project_id", projectId);
      if (tasksErr) throw tasksErr;
      const taskIds = (tasks ?? []).map((t) => t.id);
      if (taskIds.length === 0) return { logs: [], users: [] };

      const { data: logs, error: logsErr } = await supabase
        .from("time_logs")
        .select("user_id, hours, pool_tag")
        .in("task_id", taskIds);
      if (logsErr) throw logsErr;

      const userIds = [...new Set((logs ?? []).map((l) => l.user_id))];
      const { data: users, error: usersErr } =
        userIds.length > 0
          ? await supabase.from("users").select("id, name, base_role").in("id", userIds)
          : { data: [], error: null };
      if (usersErr) throw usersErr;
      return { logs: logs ?? [], users: users ?? [] };
    },
  });

  const usersById = useMemo(
    () => new Map((hoursQuery.data?.users ?? []).map((u) => [u.id, u])),
    [hoursQuery.data]
  );

  const qualityRule = config?.quality_factor_rule_json ?? {
    rework: 0.9,
    met_specification: 1.0,
    above_expectations: 1.1,
  };
  const roleWeights = config?.role_weights_json ?? {};
  const poolSplit = config?.pool_split_json ?? {
    kpi_team_pool_pct: 0.6,
    founder_pool_pct: 0.3,
    finders_fee_pool_pct: 0.1,
  };

  const cashCollected = collectedByProject.get(projectId) ?? 0;
  const directCosts = costsByProject.get(projectId) ?? 0;
  const reserve = reserveByProject.get(projectId) ?? 0;
  const remainingProfit = Math.max(0, cashCollected - directCosts - reserve);
  const kpiTeamPool = remainingProfit * poolSplit.kpi_team_pool_pct;
  const founderPool = remainingProfit * poolSplit.founder_pool_pct;
  const findersFeePool = remainingProfit * poolSplit.finders_fee_pool_pct;

  const teamHoursByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of hoursQuery.data?.logs ?? []) {
      if (log.pool_tag !== "team") continue;
      map.set(log.user_id, (map.get(log.user_id) ?? 0) + Number(log.hours));
    }
    return map;
  }, [hoursQuery.data]);

  const founderHoursByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of hoursQuery.data?.logs ?? []) {
      if (log.pool_tag !== "founder") continue;
      map.set(log.user_id, (map.get(log.user_id) ?? 0) + Number(log.hours));
    }
    return map;
  }, [hoursQuery.data]);

  const teamRows = useMemo(() => {
    const totalPoints = [...teamHoursByUser.entries()].reduce((sum, [userId, hours]) => {
      const qf = qualityRule[qualityByUser[userId] ?? "met_specification"];
      const rw = roleWeights[userId] ?? 1;
      return sum + hours * rw * qf;
    }, 0);
    return [...teamHoursByUser.entries()].map(([userId, hours]) => {
      const tier = qualityByUser[userId] ?? "met_specification";
      const qf = qualityRule[tier];
      const rw = roleWeights[userId] ?? 1;
      const points = hours * rw * qf;
      const amount = totalPoints > 0 ? (points / totalPoints) * kpiTeamPool : 0;
      return { userId, hours, roleWeight: rw, qualityFactor: qf, points, amount, pool: "KPI Team" as const };
    });
  }, [teamHoursByUser, qualityByUser, qualityRule, roleWeights, kpiTeamPool]);

  const founderRows = useMemo(() => {
    const founderUserIds = [...founderHoursByUser.keys()];
    if (founderUserIds.length === 0) return [];
    const share = founderPool / founderUserIds.length;
    return founderUserIds.map((userId) => ({
      userId,
      hours: founderHoursByUser.get(userId) ?? 0,
      roleWeight: 1,
      qualityFactor: 1,
      points: 0,
      amount: share,
      pool: "Founder" as const,
    }));
  }, [founderHoursByUser, founderPool]);

  const finderRow = finderUserId
    ? {
        userId: finderUserId,
        hours: 0,
        roleWeight: 1,
        qualityFactor: 1,
        points: 0,
        amount: findersFeePool,
        pool: "Finder's Fee" as const,
      }
    : null;

  const allRows = [...teamRows, ...founderRows, ...(finderRow ? [finderRow] : [])];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Project hours &amp; payment export</h2>
        <ExportButton
          requiresFlag="can_export_financial_data"
          filename={projectName ? `${projectName}-hours-payment` : "project-hours-payment"}
          rows={() => {
            const exportRows = allRows.map((r) => ({
              Project: projectName,
              Person: usersById.get(r.userId)?.name ?? r.userId,
              Role: usersById.get(r.userId)?.base_role ?? "",
              Pool: r.pool,
              Hours: r.hours,
              "Role weight": r.roleWeight,
              "Quality factor": r.qualityFactor,
              Points: Number(r.points.toFixed(3)),
              "₹ Share (calculated, unpaid preview)": Number(r.amount.toFixed(2)),
              "Cash collected": cashCollected,
              "Direct costs": directCosts,
              Reserve: reserve,
              "Remaining profit": remainingProfit,
              "Generated at": new Date().toISOString(),
            }));
            // No auto-attribution anymore — if the CFO hasn't picked a
            // finder yet, the sheet still needs to say the 10% exists and
            // is unassigned, not silently drop it.
            if (!finderRow) {
              exportRows.push({
                Project: projectName,
                Person: "Not yet assigned",
                Role: "",
                Pool: "Finder's Fee",
                Hours: 0,
                "Role weight": 1,
                "Quality factor": 1,
                Points: 0,
                "₹ Share (calculated, unpaid preview)": Number(findersFeePool.toFixed(2)),
                "Cash collected": cashCollected,
                "Direct costs": directCosts,
                Reserve: reserve,
                "Remaining profit": remainingProfit,
                "Generated at": new Date().toISOString(),
              });
            }
            return exportRows;
          }}
        />
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input self-start">
          <option value="">Select project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {projectId && (
          <>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <Waterfall label="Cash collected" value={cashCollected} />
              <Waterfall label="− Direct costs" value={-directCosts} />
              <Waterfall label="− Reserve" value={-reserve} />
              <Waterfall label="= Remaining profit" value={remainingProfit} bold />
            </div>

            <table className="w-full text-left text-sm">
              <thead className="text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-1">Person</th>
                  <th className="py-1">Pool</th>
                  <th className="py-1">Hours</th>
                  <th className="py-1">Quality</th>
                  <th className="py-1">Points</th>
                  <th className="py-1">₹ Share</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((r) => (
                  <tr key={r.userId} className="border-t border-[var(--color-border)]">
                    <td className="py-1">{usersById.get(r.userId)?.name ?? r.userId}</td>
                    <td className="py-1">{r.pool}</td>
                    <td className="py-1">{r.hours}</td>
                    <td className="py-1">
                      <select
                        value={qualityByUser[r.userId] ?? "met_specification"}
                        onChange={(e) =>
                          setQualityByUser((prev) => ({
                            ...prev,
                            [r.userId]: e.target.value as QualityTier,
                          }))
                        }
                        className="input"
                      >
                        <option value="rework">Rework (0.9)</option>
                        <option value="met_specification">Met spec (1.0)</option>
                        <option value="above_expectations">Above expectations (1.1)</option>
                      </select>
                    </td>
                    <td className="py-1">{r.points.toFixed(2)}</td>
                    <td className="py-1">
                      ₹{r.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
                {founderRows.map((r) => (
                  <tr key={r.userId} className="border-t border-[var(--color-border)]">
                    <td className="py-1">{usersById.get(r.userId)?.name ?? r.userId}</td>
                    <td className="py-1">{r.pool}</td>
                    <td className="py-1">{r.hours}</td>
                    <td className="py-1">—</td>
                    <td className="py-1">—</td>
                    <td className="py-1">
                      ₹{r.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--color-border)]">
                  <td className="py-1">
                    <select
                      value={finderUserId}
                      onChange={(e) => setFinderUserId(e.target.value)}
                      className="input"
                    >
                      <option value="">Not yet assigned</option>
                      {allUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1">Finder's Fee</td>
                  <td className="py-1">—</td>
                  <td className="py-1">—</td>
                  <td className="py-1">—</td>
                  <td className="py-1">
                    ₹{findersFeePool.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    {!finderUserId && (
                      <span className="ml-1 text-[var(--color-warn)]">(unassigned)</span>
                    )}
                  </td>
                </tr>
                {allRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 text-center text-[var(--color-text-muted)]">
                      No hours logged on this project yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-xs text-[var(--color-text-muted)]">
              This is a calculated preview for record-keeping and export — it does not create a payout
              run. Use the payout engine above to actually run and pay.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Waterfall({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className={bold ? "font-semibold" : ""}>
        ₹{value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}

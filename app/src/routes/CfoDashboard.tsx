import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ExportButton } from "@/components/shell/ExportButton";
import { HistoricalProjects } from "@/components/shell/HistoricalProjects";
import { ActivityLog } from "@/components/shell/ActivityLog";

export default function CfoDashboard() {
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
        .select("id, period_start, period_end, status, total_distributed, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const projectsById = useMemo(
    () => new Map((projectsQuery.data ?? []).map((p) => [p.id, p.name])),
    [projectsQuery.data]
  );

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
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Total distributed</th>
              </tr>
            </thead>
            <tbody>
              {(payoutRunsQuery.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">
                    {r.period_start} → {r.period_end}
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">₹{Number(r.total_distributed).toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {payoutRunsQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-[var(--color-text-muted)]">
                    No payout runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
  generatedBy,
}: {
  projects: { id: string; name: string }[];
  config: import("@/lib/database.types").PayoutConfigRow | null;
  collectedByProject: Map<string, number>;
  costsByProject: Map<string, number>;
  reserveByProject: Map<string, number>;
  generatedBy: string;
}) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [qualityByUser, setQualityByUser] = useState<Record<string, QualityTier>>({});

  const teamHoursQuery = useQuery({
    queryKey: ["team-hours-for-payout", projectId],
    enabled: !!projectId,
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
        .eq("pool_tag", "team");
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

  const finderQuery = useQuery({
    queryKey: ["first-finder", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finder_fee_log")
        .select("logged_by, logged_at")
        .eq("project_id", projectId)
        .order("logged_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
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

      if (finderQuery.data?.logged_by) {
        rows.push({
          payout_run_id: run.id,
          user_id: finderQuery.data.logged_by,
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
              {finderQuery.data?.logged_by && (
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  Finder's fee pool (₹{findersFeePool.toLocaleString("en-IN", { maximumFractionDigits: 0 })}) goes to the first verified lead source.
                </p>
              )}
            </div>

            <button
              onClick={() => runPayout.mutate()}
              disabled={!periodStart || !periodEnd || !config}
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

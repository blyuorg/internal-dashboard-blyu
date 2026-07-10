const url = "https://rvyrtwwukcswssvnqjnp.supabase.co";
const anon = "sb_publishable_zWtRTW68LerizQN5I37gQA_H_z-gjnd";

const PASS = "TestPass123!";
const EMAILS = {
  ceo: "e2e-ceo@blyu.test",
  cto: "e2e-cto@blyu.test",
  cfo: "e2e-cfo@blyu.test",
  team: "e2e-team@blyu.test",
};

let failures = 0;
function check(label, cond, extra) {
  if (cond) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}

async function login(email) {
  const res = await fetch(url + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ email, password: PASS }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(json)}`);
  return { token: json.access_token, userId: json.user.id };
}

function headersFor(token) {
  return { "Content-Type": "application/json", apikey: anon, Authorization: "Bearer " + token };
}

async function main() {
  const sessions = {};
  for (const [role, email] of Object.entries(EMAILS)) {
    sessions[role] = await login(email);
  }
  console.log("Logged in as all 4 roles.\n");

  // ============================================================
  // CEO: create project
  // ============================================================
  console.log("== CEO: create project ==");
  const ceoH = headersFor(sessions.ceo.token);
  let res = await fetch(url + "/rest/v1/projects", {
    method: "POST",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({ name: "E2E Test Project", client_name: "E2E Client", contract_value: 200000, status: "active" }),
  });
  let project = (await res.json())[0];
  check("create project", res.status === 201 && project?.id, project);
  const projectId = project.id;

  // team should NOT be able to create a project
  res = await fetch(url + "/rest/v1/projects", {
    method: "POST",
    headers: { ...headersFor(sessions.team.token), Prefer: "return=representation" },
    body: JSON.stringify({ name: "Should Not Exist", client_name: "x", status: "active" }),
  });
  const teamProjectAttempt = await res.json();
  check("team blocked from creating project", res.status !== 201 || teamProjectAttempt.length === 0, { status: res.status, body: teamProjectAttempt });

  // ============================================================
  // CEO: assign task to team member
  // ============================================================
  console.log("\n== CEO: assign task ==");
  res = await fetch(url + "/rest/v1/tasks", {
    method: "POST",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({
      project_id: projectId,
      assigned_to: sessions.team.userId,
      assigned_by: sessions.ceo.userId,
      role_tag: "e2e",
      estimated_hours: 10,
      status: "todo",
      deadline: "2026-08-01",
    }),
  });
  let task = (await res.json())[0];
  check("assign task to team", res.status === 201 && task?.id, task);
  const taskId = task.id;

  // ============================================================
  // TEAM: view my tasks, log hours (valid + invalid), submit for review
  // ============================================================
  console.log("\n== TEAM: my tasks / log hours / submit for review ==");
  const teamH = headersFor(sessions.team.token);
  res = await fetch(url + `/rest/v1/tasks?select=id,status&assigned_to=eq.${sessions.team.userId}`, { headers: teamH });
  const myTasks = await res.json();
  check("team sees assigned task", myTasks.some((t) => t.id === taskId), myTasks);

  // valid manual hours
  res = await fetch(url + "/rest/v1/time_logs", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ task_id: taskId, user_id: sessions.team.userId, hours: 3, pool_tag: "team" }),
  });
  const validLog = await res.json();
  check("valid manual hours (3h) accepted", res.status === 201, validLog);

  // invalid: 0 hours (should be rejected by new CHECK constraint)
  res = await fetch(url + "/rest/v1/time_logs", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ task_id: taskId, user_id: sessions.team.userId, hours: 0, pool_tag: "team" }),
  });
  check("0-hour entry rejected by DB constraint", res.status === 400, { status: res.status, body: await res.text() });

  // invalid: 20 hours (over the 16h cap)
  res = await fetch(url + "/rest/v1/time_logs", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ task_id: taskId, user_id: sessions.team.userId, hours: 20, pool_tag: "team" }),
  });
  check("20-hour entry rejected by DB constraint", res.status === 400, { status: res.status, body: await res.text() });

  // submit for review
  res = await fetch(url + `/rest/v1/tasks?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ status: "in_review", deliverable_link: "https://example.com/e2e-pr" }),
  });
  const submitted = await res.json();
  check("submit for review (task -> in_review)", submitted[0]?.status === "in_review", submitted);

  res = await fetch(url + "/rest/v1/deliverables", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ task_id: taskId, link: "https://example.com/e2e-pr" }),
  });
  let deliverable = (await res.json())[0];
  check("deliverable created", res.status === 201 && deliverable?.id, deliverable);
  const deliverableId = deliverable.id;

  // log a lead
  res = await fetch(url + "/rest/v1/finder_fee_log", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ project_id: projectId, logged_by: sessions.team.userId }),
  });
  check("log a lead", res.status === 201, await res.json());

  // project chat
  res = await fetch(url + "/rest/v1/chat_messages", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ channel_type: "project", channel_id: projectId, sender_id: sessions.team.userId, body: "e2e test message" }),
  });
  check("project chat message sent", res.status === 201, await res.json());

  // day-detail style query: today's logs
  const today = new Date().toISOString().slice(0, 10);
  res = await fetch(url + `/rest/v1/time_logs?select=*&user_id=eq.${sessions.team.userId}&log_date=eq.${today}`, { headers: teamH });
  const todayLogs = await res.json();
  check("day-detail query returns today's log", todayLogs.length >= 1, todayLogs);

  // ============================================================
  // CTO: delivery pipeline, reassign, review gate
  // ============================================================
  console.log("\n== CTO: delivery pipeline / reassign / review gate ==");
  const ctoH = headersFor(sessions.cto.token);
  res = await fetch(url + "/rest/v1/tasks?select=id,project_id,assigned_to,status", { headers: ctoH });
  const allTasksAsCto = await res.json();
  check("CTO sees full delivery pipeline", allTasksAsCto.some((t) => t.id === taskId), allTasksAsCto.length);

  res = await fetch(url + `/rest/v1/deliverables?select=*&review_status=eq.pending`, { headers: ctoH });
  const pendingReview = await res.json();
  check("CTO sees pending deliverable in review gate", pendingReview.some((d) => d.id === deliverableId), pendingReview);

  // reassign to CTO themselves then back to team
  res = await fetch(url + `/rest/v1/tasks?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { ...ctoH, Prefer: "return=representation" },
    body: JSON.stringify({ assigned_to: sessions.cto.userId }),
  });
  let reassigned = (await res.json())[0];
  check("CTO reassigns task to self", reassigned?.assigned_to === sessions.cto.userId, reassigned);

  res = await fetch(url + `/rest/v1/tasks?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { ...ctoH, Prefer: "return=representation" },
    body: JSON.stringify({ assigned_to: sessions.team.userId }),
  });
  reassigned = (await res.json())[0];
  check("CTO reassigns task back to team", reassigned?.assigned_to === sessions.team.userId, reassigned);

  // review gate: approve
  res = await fetch(url + `/rest/v1/deliverables?id=eq.${deliverableId}`, {
    method: "PATCH",
    headers: { ...ctoH, Prefer: "return=representation" },
    body: JSON.stringify({ review_status: "approved", reviewed_by: sessions.cto.userId, reviewed_at: new Date().toISOString() }),
  });
  let approvedDeliverable = (await res.json())[0];
  check("CTO approves deliverable", approvedDeliverable?.review_status === "approved", approvedDeliverable);

  res = await fetch(url + `/rest/v1/tasks?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { ...ctoH, Prefer: "return=representation" },
    body: JSON.stringify({ status: "done" }),
  });
  let doneTask = (await res.json())[0];
  check("task moves to done after approval", doneTask?.status === "done", doneTask);

  // CTO personal time log with cap validation
  res = await fetch(url + "/rest/v1/time_logs", {
    method: "POST",
    headers: { ...ctoH, Prefer: "return=representation" },
    body: JSON.stringify({ task_id: taskId, user_id: sessions.cto.userId, hours: 2, pool_tag: "founder" }),
  });
  check("CTO personal time log (2h founder)", res.status === 201, await res.json());

  // ============================================================
  // CEO: sign-off queue (final gate)
  // ============================================================
  console.log("\n== CEO: final sign-off queue ==");
  res = await fetch(url + `/rest/v1/deliverables?select=*&review_status=eq.approved`, { headers: ceoH });
  const signoffQueue = await res.json();
  check("CEO sees approved deliverable in signoff queue", signoffQueue.some((d) => d.id === deliverableId), signoffQueue);

  // CEO kicks it back with a note (test the reject path)
  res = await fetch(url + `/rest/v1/deliverables?id=eq.${deliverableId}`, {
    method: "PATCH",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({ review_status: "returned", review_notes: "e2e test kickback" }),
  });
  let kicked = (await res.json())[0];
  check("CEO kicks back deliverable", kicked?.review_status === "returned", kicked);

  res = await fetch(url + `/rest/v1/tasks?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({ status: "in_progress" }),
  });
  check("task reverts to in_progress on kickback", (await res.json())[0]?.status === "in_progress");

  res = await fetch(url + "/rest/v1/audit_log", {
    method: "POST",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({ actor_id: sessions.ceo.userId, action: "signoff_kicked_back", entity_type: "task", entity_id: taskId, details_json: { notes: "e2e test kickback" } }),
  });
  check("audit_log entry written for kickback", res.status === 201, await res.json());

  // re-approve properly for the payout flow later
  await fetch(url + `/rest/v1/deliverables?id=eq.${deliverableId}`, {
    method: "PATCH",
    headers: ceoH,
    body: JSON.stringify({ review_status: "approved", review_notes: null }),
  });
  res = await fetch(url + `/rest/v1/tasks?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({ status: "done" }),
  });
  check("CEO re-approves and task is done again", (await res.json())[0]?.status === "done");

  // Team capacity aggregation query
  res = await fetch(url + "/rest/v1/tasks?select=id,assigned_to,estimated_hours", { headers: ceoH });
  const capacityTasks = await res.json();
  check("CEO team capacity query returns tasks", capacityTasks.some((t) => t.id === taskId), capacityTasks.length);

  // Role & permission management: grant + revoke a flag
  res = await fetch(url + "/rest/v1/user_capability_flags", {
    method: "POST",
    headers: { ...ceoH, Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: sessions.team.userId, flag_name: "can_export_task_data", enabled: true, granted_by: sessions.ceo.userId }),
  });
  let flagRow = (await res.json())[0];
  check("CEO grants capability flag", flagRow?.enabled === true, flagRow);

  res = await fetch(url + `/rest/v1/user_capability_flags?user_id=eq.${sessions.team.userId}&flag_name=eq.can_export_task_data`, {
    method: "PATCH",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({ enabled: false }),
  });
  flagRow = (await res.json())[0];
  check("CEO revokes capability flag", flagRow?.enabled === false, flagRow);

  // archive + reactivate project
  res = await fetch(url + `/rest/v1/projects?id=eq.${projectId}`, {
    method: "PATCH",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({ status: "archived" }),
  });
  let archived = (await res.json())[0];
  check("CEO archives project", archived?.status === "archived", archived);

  res = await fetch(url + `/rest/v1/projects?select=id,name,status`, { headers: ceoH });
  const historicalLookup = await res.json();
  check("archived project still visible in historical lookup", historicalLookup.some((p) => p.id === projectId && p.status === "archived"));

  res = await fetch(url + `/rest/v1/projects?id=eq.${projectId}`, {
    method: "PATCH",
    headers: { ...ceoH, Prefer: "return=representation" },
    body: JSON.stringify({ status: "active" }),
  });
  let reactivated = (await res.json())[0];
  check("CEO reactivates project", reactivated?.status === "active", reactivated);

  // ============================================================
  // CFO: cash ledger, direct costs, payout engine
  // ============================================================
  console.log("\n== CFO: cash ledger / direct costs / payout engine ==");
  const cfoH = headersFor(sessions.cfo.token);
  res = await fetch(url + "/rest/v1/cash_ledger", {
    method: "POST",
    headers: { ...cfoH, Prefer: "return=representation" },
    body: JSON.stringify({ project_id: projectId, invoice_amount: 200000, amount_collected: 200000, payment_type: "completion", collected_date: today }),
  });
  check("CFO adds cash ledger entry", res.status === 201, await res.json());

  res = await fetch(url + "/rest/v1/direct_costs", {
    method: "POST",
    headers: { ...cfoH, Prefer: "return=representation" },
    body: JSON.stringify({ project_id: projectId, description: "e2e cost", amount: 20000, logged_by: sessions.cfo.userId }),
  });
  check("CFO logs direct cost", res.status === 201, await res.json());

  // team should be blocked from logging direct costs
  res = await fetch(url + "/rest/v1/direct_costs", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ project_id: projectId, description: "should fail", amount: 100, logged_by: sessions.team.userId }),
  });
  const teamCostAttempt = await res.json();
  check("team blocked from logging direct costs", res.status !== 201 || teamCostAttempt.length === 0, { status: res.status, body: teamCostAttempt });

  // payout engine math
  const config = await (await fetch(url + "/rest/v1/payout_config?select=*&order=effective_from.desc&limit=1", { headers: cfoH })).json();
  const cfg = config[0];
  const cashCollected = 200000;
  const directCosts = 20000;
  const reserve = cashCollected * Number(cfg.reserve_pct);
  const remaining = cashCollected - directCosts - reserve;
  const kpiTeamPool = remaining * cfg.pool_split_json.kpi_team_pool_pct;

  res = await fetch(url + `/rest/v1/time_logs?select=user_id,hours&task_id=eq.${taskId}&pool_tag=eq.team&log_date=gte.2026-01-01&log_date=lte.2026-12-31`, { headers: cfoH });
  const periodLogs = await res.json();
  const totalHours = periodLogs.reduce((s, l) => s + Number(l.hours), 0);
  check("payout engine sees team hours in period", totalHours === 3, { totalHours, periodLogs });

  res = await fetch(url + "/rest/v1/payout_runs", {
    method: "POST",
    headers: { ...cfoH, Prefer: "return=representation" },
    body: JSON.stringify({
      project_id: projectId,
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      config_snapshot_json: cfg,
      generated_by: sessions.cfo.userId,
      status: "draft",
      total_distributed: remaining,
    }),
  });
  let payoutRun = (await res.json())[0];
  check("CFO creates payout run", res.status === 201 && payoutRun?.id, payoutRun);
  const payoutRunId = payoutRun.id;

  res = await fetch(url + "/rest/v1/payout_run_lines", {
    method: "POST",
    headers: { ...cfoH, Prefer: "return=representation" },
    body: JSON.stringify({
      payout_run_id: payoutRunId,
      user_id: sessions.team.userId,
      hours: totalHours,
      role_weight: 1,
      quality_factor: 1.0,
      points: totalHours,
      amount_paid: kpiTeamPool,
    }),
  });
  check("payout_run_lines written", res.status === 201, await res.json());

  // overlap check: a second run with an overlapping period for the SAME project should be flagged client-side
  // (server allows the insert since overlap prevention is a UI guard, not RLS -- verify that assumption holds)
  res = await fetch(url + "/rest/v1/payout_runs", {
    method: "POST",
    headers: { ...cfoH, Prefer: "return=representation" },
    body: JSON.stringify({
      project_id: projectId,
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      config_snapshot_json: cfg,
      generated_by: sessions.cfo.userId,
      status: "draft",
      total_distributed: 0,
    }),
  });
  const overlapRunTest = (await res.json())[0];
  check("(informational) DB does not block overlapping periods -- UI-only guard confirmed", res.status === 201, overlapRunTest);
  // clean this one up immediately, it was only to confirm the UI-guard assumption
  if (overlapRunTest?.id) {
    await fetch(url + `/rest/v1/payout_runs?id=eq.${overlapRunTest.id}`, { method: "DELETE", headers: cfoH });
  }

  // team member should only see their own payout_run_lines
  res = await fetch(url + `/rest/v1/payout_run_lines?select=*`, { headers: teamH });
  const teamVisibleLines = await res.json();
  check("team sees only own payout line(s)", teamVisibleLines.every((l) => l.user_id === sessions.team.userId), teamVisibleLines);

  // project hours export query (CFO, all-time)
  res = await fetch(url + `/rest/v1/time_logs?select=user_id,hours,pool_tag&task_id=eq.${taskId}`, { headers: cfoH });
  const exportLogs = await res.json();
  check("project hours export query returns logs", exportLogs.length >= 2, exportLogs);

  res = await fetch(url + "/rest/v1/payout_runs?select=id,project_id,period_start,period_end,status,total_distributed", { headers: cfoH });
  const runHistory = await res.json();
  check("payout run history query works", runHistory.some((r) => r.id === payoutRunId), runHistory.length);

  // ============================================================
  // Timer widget lifecycle (start -> checkin -> stop) + hours cap
  // ============================================================
  console.log("\n== Timer lifecycle ==");
  res = await fetch(url + "/rest/v1/work_sessions", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ user_id: sessions.team.userId, task_id: taskId, pool_tag: "team" }),
  });
  let session = (await res.json())[0];
  check("timer session starts", res.status === 201 && session?.status === "active", session);
  const sessionId = session.id;

  res = await fetch(url + `/rest/v1/work_sessions?id=eq.${sessionId}`, {
    method: "PATCH",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ last_checkin_at: new Date().toISOString() }),
  });
  check("timer check-in updates last_checkin_at", res.status === 200, await res.json());

  res = await fetch(url + "/rest/v1/time_logs", {
    method: "POST",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ task_id: taskId, user_id: sessions.team.userId, hours: 1.5, pool_tag: "team" }),
  });
  let timerLog = (await res.json())[0];
  check("timer finalize writes time_log", res.status === 201, timerLog);

  res = await fetch(url + `/rest/v1/work_sessions?id=eq.${sessionId}`, {
    method: "PATCH",
    headers: { ...teamH, Prefer: "return=representation" },
    body: JSON.stringify({ status: "completed", ended_at: new Date().toISOString(), time_log_id: timerLog.id }),
  });
  check("timer session finalized as completed", (await res.json())[0]?.status === "completed");

  // ============================================================
  // Activity log (founder cross-monitoring)
  // ============================================================
  console.log("\n== Activity log ==");
  res = await fetch(url + `/rest/v1/work_sessions?select=*&started_at=gte.${today}T00:00:00.000Z`, { headers: ctoH });
  const ctoSeesActivity = await res.json();
  check("CTO sees team's timer session in activity log", ctoSeesActivity.some((s) => s.id === sessionId), ctoSeesActivity.length);

  res = await fetch(url + `/rest/v1/work_sessions?select=*&id=eq.${sessionId}`, { headers: cfoH });
  const cfoSeesActivity = await res.json();
  check("CFO also sees the session (cross-founder monitoring)", cfoSeesActivity.length === 1);

  // ============================================================
  console.log(`\n${"=".repeat(50)}`);
  console.log(failures === 0 ? `ALL CHECKS PASSED` : `${failures} CHECK(S) FAILED`);
  console.log(JSON.stringify({ projectId, taskId, deliverableId, payoutRunId, sessionId }));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E test crashed:", e);
  process.exit(1);
});

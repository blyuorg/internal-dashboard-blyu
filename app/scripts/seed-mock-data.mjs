import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const USERS = {
  ceo: "9a826e3a-c0f1-4a4d-8e8d-49c106e17d93",
  cto: "a9766feb-3cd1-44bf-8b17-1db3e8d5c741",
  cfo: "af9fd6c7-a39c-4698-aed1-823456425a25",
  kk: "9e6d48be-bb90-47c0-bcff-ca98ffd89865",
  simar: "cbf2df45-2cb8-4d37-80f9-dbd2b068563b",
  shaurya: "2295607a-fe7c-4e8f-a53d-361878e4d752",
};

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
function dateFromNow(n) {
  return daysFromNow(n).slice(0, 10);
}

async function insertProject(name, clientName, contractValue, status = "active") {
  const r = await client.query(
    "insert into projects (name, client_name, contract_value, status) values ($1,$2,$3,$4) returning id",
    [name, clientName, contractValue, status]
  );
  return r.rows[0].id;
}

async function insertTask({ projectId, assignedTo, assignedBy, roleTag, estHours, status, deadline }) {
  const r = await client.query(
    `insert into tasks (project_id, assigned_to, assigned_by, role_tag, estimated_hours, status, deadline)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [projectId, assignedTo, assignedBy, roleTag, estHours, status, deadline]
  );
  return r.rows[0].id;
}

async function insertDeliverable(taskId, link, reviewStatus, reviewedBy = null, notes = null) {
  const reviewedAt = reviewStatus === "pending" ? null : new Date().toISOString();
  await client.query(
    "insert into deliverables (task_id, link, review_status, reviewed_by, review_notes, reviewed_at) values ($1,$2,$3::review_status,$4,$5,$6)",
    [taskId, link, reviewStatus, reviewedBy, notes, reviewedAt]
  );
}

async function insertManualLog(taskId, userId, hours, logDate, poolTag = "team") {
  await client.query(
    "insert into time_logs (task_id, user_id, hours, log_date, pool_tag) values ($1,$2,$3,$4,$5)",
    [taskId, userId, hours, logDate, poolTag]
  );
}

async function insertTimerSession(taskId, userId, hoursAgoStart, durationHours, status, poolTag = "team") {
  const startedAt = daysFromNow(-hoursAgoStart / 24);
  const endedAt = new Date(new Date(startedAt).getTime() + durationHours * 3_600_000).toISOString();
  const logDate = startedAt.slice(0, 10);
  const log = await client.query(
    "insert into time_logs (task_id, user_id, hours, log_date, pool_tag) values ($1,$2,$3,$4,$5) returning id",
    [taskId, userId, durationHours, logDate, poolTag]
  );
  await client.query(
    `insert into work_sessions (user_id, task_id, pool_tag, started_at, last_checkin_at, ended_at, status, time_log_id)
     values ($1,$2,$3,$4,$4,$5,$6,$7)`,
    [userId, taskId, poolTag, startedAt, status === "active" ? null : endedAt, status, status === "active" ? null : log.rows[0].id]
  );
}

async function insertCash(projectId, invoiceAmount, amountCollected, paymentType, collectedDate) {
  await client.query(
    "insert into cash_ledger (project_id, invoice_amount, amount_collected, payment_type, collected_date) values ($1,$2,$3,$4,$5)",
    [projectId, invoiceAmount, amountCollected, paymentType, collectedDate]
  );
}

async function insertCost(projectId, description, amount, loggedBy) {
  await client.query(
    "insert into direct_costs (project_id, description, amount, logged_by) values ($1,$2,$3,$4)",
    [projectId, description, amount, loggedBy]
  );
}

async function insertLead(projectId, loggedBy, loggedAt) {
  await client.query("insert into finder_fee_log (project_id, logged_by, logged_at) values ($1,$2,$3)", [
    projectId,
    loggedBy,
    loggedAt,
  ]);
}

async function insertChat(channelType, channelId, senderId, body, createdAt) {
  await client.query(
    "insert into chat_messages (channel_type, channel_id, sender_id, body, created_at) values ($1,$2,$3,$4,$5)",
    [channelType, channelId, senderId, body, createdAt]
  );
}

async function main() {
  await client.connect();

  console.log("Creating projects...");
  const acme = await insertProject("Acme Website Revamp", "Acme Corp", 250000);
  const zenith = await insertProject("Zenith Mobile App", "Zenith Labs", 480000);
  const bright = await insertProject("Bright Retail POS", "BrightMart", 150000, "archived");
  const nova = await insertProject("Nova Onboarding Portal", "Nova Inc", 90000);

  console.log("Creating tasks...");
  const a1 = await insertTask({ projectId: acme, assignedTo: USERS.kk, assignedBy: USERS.ceo, roleTag: "frontend", estHours: 20, status: "in_progress", deadline: daysFromNow(5) });
  const a2 = await insertTask({ projectId: acme, assignedTo: USERS.simar, assignedBy: USERS.cto, roleTag: "backend", estHours: 15, status: "in_review", deadline: daysFromNow(2) });
  const a3 = await insertTask({ projectId: acme, assignedTo: USERS.shaurya, assignedBy: USERS.ceo, roleTag: "design", estHours: 10, status: "done", deadline: daysFromNow(-3) });
  const a4 = await insertTask({ projectId: acme, assignedTo: USERS.kk, assignedBy: USERS.cto, roleTag: "qa", estHours: 8, status: "blocked", deadline: daysFromNow(-1) });

  const z1 = await insertTask({ projectId: zenith, assignedTo: USERS.simar, assignedBy: USERS.ceo, roleTag: "mobile", estHours: 30, status: "in_progress", deadline: daysFromNow(10) });
  const z2 = await insertTask({ projectId: zenith, assignedTo: USERS.shaurya, assignedBy: USERS.cto, roleTag: "mobile", estHours: 25, status: "todo", deadline: daysFromNow(15) });
  const z3 = await insertTask({ projectId: zenith, assignedTo: USERS.kk, assignedBy: USERS.ceo, roleTag: "backend", estHours: 18, status: "done", deadline: daysFromNow(-5) });

  const b1 = await insertTask({ projectId: bright, assignedTo: USERS.kk, assignedBy: USERS.ceo, roleTag: "pos", estHours: 40, status: "done", deadline: daysFromNow(-30) });
  const b2 = await insertTask({ projectId: bright, assignedTo: USERS.simar, assignedBy: USERS.ceo, roleTag: "pos", estHours: 35, status: "done", deadline: daysFromNow(-28) });

  const n1 = await insertTask({ projectId: nova, assignedTo: USERS.shaurya, assignedBy: USERS.cto, roleTag: "frontend", estHours: 12, status: "todo", deadline: daysFromNow(7) });
  const n2 = await insertTask({ projectId: nova, assignedTo: USERS.kk, assignedBy: USERS.cto, roleTag: "backend", estHours: 14, status: "in_progress", deadline: daysFromNow(4) });

  console.log("Creating deliverables...");
  await insertDeliverable(a2, "https://github.com/blyu/acme/pull/12", "pending");
  await insertDeliverable(a3, "https://github.com/blyu/acme/pull/9", "approved", USERS.cto);
  await insertDeliverable(z3, "https://github.com/blyu/zenith/pull/5", "approved", USERS.cto);
  await insertDeliverable(b1, "https://github.com/blyu/bright/pull/40", "approved", USERS.cto);
  await insertDeliverable(b2, "https://github.com/blyu/bright/pull/41", "approved", USERS.cto);

  console.log("Creating manual time logs (spread over last 14 days)...");
  const manualPlan = [
    [a1, USERS.kk, [3, 4, 2, 5, 3]],
    [a2, USERS.simar, [4, 4, 3]],
    [a4, USERS.kk, [2, 1]],
    [z1, USERS.simar, [5, 4, 6, 3]],
    [z2, USERS.shaurya, [2, 3]],
    [n1, USERS.shaurya, [1, 2]],
    [n2, USERS.kk, [3, 2]],
  ];
  for (const [taskId, userId, hoursSeries] of manualPlan) {
    for (let i = 0; i < hoursSeries.length; i++) {
      await insertManualLog(taskId, userId, hoursSeries[i], dateFromNow(-(hoursSeries.length - i) * 2));
    }
  }

  console.log("Creating timer sessions (completed, expired, one active)...");
  await insertTimerSession(a1, USERS.kk, 24, 2.5, "completed");
  await insertTimerSession(a3, USERS.shaurya, 48, 3, "completed");
  await insertTimerSession(z1, USERS.simar, 72, 1.5, "expired");
  await insertTimerSession(n2, USERS.kk, 6, 1, "active");

  console.log("Creating founder time logs...");
  await insertManualLog(a1, USERS.ceo, 2, dateFromNow(-1), "founder");
  await insertManualLog(z1, USERS.cto, 3, dateFromNow(-2), "founder");
  await insertManualLog(a2, USERS.cto, 2, dateFromNow(-3), "founder");

  console.log("Creating cash ledger entries...");
  await insertCash(acme, 100000, 100000, "advance", dateFromNow(-20));
  await insertCash(acme, 150000, 0, "completion", null); // pending -> shows overdue
  await insertCash(zenith, 150000, 150000, "advance", dateFromNow(-15));
  await insertCash(zenith, 330000, 100000, "completion", dateFromNow(-2));
  await insertCash(bright, 60000, 60000, "advance", dateFromNow(-40));
  await insertCash(bright, 90000, 90000, "completion", dateFromNow(-25));
  await insertCash(nova, 30000, 30000, "advance", dateFromNow(-5));

  console.log("Creating direct costs...");
  await insertCost(acme, "Hosting (AWS)", 4000, USERS.cfo);
  await insertCost(acme, "Stock assets", 1500, USERS.cfo);
  await insertCost(zenith, "App Store fees", 3000, USERS.cfo);
  await insertCost(bright, "POS hardware testing", 10000, USERS.cfo);
  await insertCost(nova, "Design tools license", 2000, USERS.cfo);

  console.log("Creating finder-fee leads...");
  await insertLead(acme, USERS.kk, daysFromNow(-25));
  await insertLead(zenith, USERS.simar, daysFromNow(-18));
  await insertLead(bright, USERS.ceo, daysFromNow(-45));

  console.log("Creating a completed payout run for Bright Retail POS...");
  const config = await client.query("select * from payout_config order by effective_from desc limit 1");
  const cfg = config.rows[0];
  const cashCollected = 150000;
  const directCosts = 10000;
  const reserve = cashCollected * Number(cfg.reserve_pct);
  const remaining = cashCollected - directCosts - reserve;
  const kpiTeamPool = remaining * cfg.pool_split_json.kpi_team_pool_pct;
  const founderPool = remaining * cfg.pool_split_json.founder_pool_pct;
  const findersFeePool = remaining * cfg.pool_split_json.finders_fee_pool_pct;
  // KK: 40h, Simar: 35h, both met_specification (1.0)
  const kkPoints = 40 * 1 * 1.0;
  const simarPoints = 35 * 1 * 1.0;
  const totalPoints = kkPoints + simarPoints;
  const kkAmount = (kkPoints / totalPoints) * kpiTeamPool;
  const simarAmount = (simarPoints / totalPoints) * kpiTeamPool;

  const run = await client.query(
    `insert into payout_runs (project_id, period_start, period_end, config_snapshot_json, generated_by, approved_by, status, total_distributed)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [bright, dateFromNow(-45), dateFromNow(-25), JSON.stringify(cfg), USERS.cfo, USERS.ceo, "paid", remaining]
  );
  const runId = run.rows[0].id;
  await client.query(
    "insert into payout_run_lines (payout_run_id, user_id, hours, role_weight, quality_factor, points, amount_paid) values ($1,$2,$3,$4,$5,$6,$7)",
    [runId, USERS.kk, 40, 1, 1.0, kkPoints, kkAmount]
  );
  await client.query(
    "insert into payout_run_lines (payout_run_id, user_id, hours, role_weight, quality_factor, points, amount_paid) values ($1,$2,$3,$4,$5,$6,$7)",
    [runId, USERS.simar, 35, 1, 1.0, simarPoints, simarAmount]
  );
  await client.query(
    "insert into payout_run_lines (payout_run_id, user_id, hours, role_weight, quality_factor, points, amount_paid) values ($1,$2,$3,$4,$5,$6,$7)",
    [runId, USERS.ceo, 0, 1, 1.0, 0, founderPool / 3]
  );
  await client.query(
    "insert into payout_run_lines (payout_run_id, user_id, hours, role_weight, quality_factor, points, amount_paid) values ($1,$2,$3,$4,$5,$6,$7)",
    [runId, USERS.cto, 0, 1, 1.0, 0, founderPool / 3]
  );
  await client.query(
    "insert into payout_run_lines (payout_run_id, user_id, hours, role_weight, quality_factor, points, amount_paid) values ($1,$2,$3,$4,$5,$6,$7)",
    [runId, USERS.cfo, 0, 1, 1.0, 0, founderPool / 3]
  );
  await client.query(
    "insert into payout_run_lines (payout_run_id, user_id, hours, role_weight, quality_factor, points, amount_paid) values ($1,$2,$3,$4,$5,$6,$7)",
    [runId, USERS.ceo, 0, 1, 1.0, 0, findersFeePool]
  );
  console.log("  payout run:", runId, "remaining profit:", remaining);

  console.log("Creating chat messages...");
  await insertChat("project", acme, USERS.ceo, "Kickoff call went well, client wants the homepage first.", daysFromNow(-19));
  await insertChat("project", acme, USERS.kk, "On it, wireframes by Thursday.", daysFromNow(-19));
  await insertChat("project", acme, USERS.simar, "Backend API contract is ready for review.", daysFromNow(-2));
  await insertChat("project", zenith, USERS.simar, "Found a blocker with push notifications on iOS.", daysFromNow(-3));
  await insertChat("project", zenith, USERS.cto, "Let's sync tomorrow morning on that.", daysFromNow(-3));

  console.log("Done seeding mock data.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

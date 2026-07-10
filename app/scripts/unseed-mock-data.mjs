import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const MOCK_PROJECT_NAMES = [
  "Acme Website Revamp",
  "Zenith Mobile App",
  "Bright Retail POS",
  "Nova Onboarding Portal",
];

async function main() {
  await client.connect();

  const projects = await client.query("select id from projects where name = any($1)", [MOCK_PROJECT_NAMES]);
  const ids = projects.rows.map((r) => r.id);
  console.log("Removing mock projects:", ids.length);

  if (ids.length > 0) {
    const tasks = await client.query("select id from tasks where project_id = any($1)", [ids]);
    const taskIds = tasks.rows.map((r) => r.id);

    if (taskIds.length > 0) {
      await client.query("delete from deliverables where task_id = any($1)", [taskIds]);
      await client.query("delete from work_sessions where task_id = any($1)", [taskIds]);
      await client.query("delete from time_logs where task_id = any($1)", [taskIds]);
    }
    await client.query("delete from tasks where project_id = any($1)", [ids]);
    await client.query("delete from cash_ledger where project_id = any($1)", [ids]);
    await client.query("delete from direct_costs where project_id = any($1)", [ids]);
    await client.query("delete from finder_fee_log where project_id = any($1)", [ids]);
    await client.query(
      "delete from payout_run_lines where payout_run_id in (select id from payout_runs where project_id = any($1))",
      [ids]
    );
    await client.query("delete from payout_runs where project_id = any($1)", [ids]);
    await client.query("delete from chat_messages where channel_type=$1 and channel_id = any($2)", [
      "project",
      ids,
    ]);
    await client.query("delete from projects where id = any($1)", [ids]);
  }

  console.log("Mock data removed.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

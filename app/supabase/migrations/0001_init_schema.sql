-- Blyu Internal Dashboard — initial schema
-- All tables use RLS. Nothing is hard-deleted; status/archived flags handle lifecycle.

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================
create type base_role as enum ('ceo', 'cto', 'cfo', 'team');
create type project_status as enum ('active', 'archived');
create type task_status as enum ('todo', 'in_progress', 'in_review', 'blocked', 'done');
create type review_status as enum ('pending', 'approved', 'returned');
create type payment_type as enum ('advance', 'completion');
create type pool_tag as enum ('team', 'founder');
create type founder_approval_status as enum ('pending', 'approved', 'rejected');
create type payout_run_status as enum ('draft', 'approved', 'paid');
create type channel_type as enum ('project', 'task', 'dm');

-- ============================================================
-- USERS & ROLES
-- ============================================================
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  base_role base_role not null default 'team',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table user_capability_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  flag_name text not null check (flag_name in (
    'can_assign_tasks', 'can_monitor_tasks', 'can_review_deliverables',
    'can_see_team_earnings', 'can_run_payouts', 'can_log_direct_costs',
    'can_approve_founder_hours', 'can_export_financial_data', 'can_export_task_data',
    'is_admin_ceo', 'is_admin_cto', 'is_admin_cfo'
  )),
  enabled boolean not null default false,
  granted_by uuid references users(id),
  granted_at timestamptz not null default now(),
  unique (user_id, flag_name)
);

create table user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  dark_mode boolean not null default false,
  notification_settings jsonb not null default '{}'::jsonb,
  google_calendar_connected boolean not null default false
);

-- ============================================================
-- PROJECTS & TASKS
-- ============================================================
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text not null,
  contract_value numeric(14,2) not null default 0,
  status project_status not null default 'active',
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  assigned_to uuid references users(id),
  assigned_by uuid references users(id),
  role_tag text,
  estimated_hours numeric(8,2),
  deliverable_link text,
  status task_status not null default 'todo',
  deadline timestamptz,
  google_calendar_event_id text,
  created_at timestamptz not null default now()
);

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id),
  link text not null,
  review_status review_status not null default 'pending',
  reviewed_by uuid references users(id),
  review_notes text,
  reviewed_at timestamptz
);

-- ============================================================
-- TIME LOGS
-- ============================================================
create table time_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id),
  user_id uuid not null references users(id),
  hours numeric(6,2) not null,
  log_date date not null default current_date,
  pool_tag pool_tag not null default 'team',
  founder_approval_status founder_approval_status not null default 'pending'
);

-- ============================================================
-- FINANCIALS
-- ============================================================
create table cash_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  invoice_amount numeric(14,2) not null,
  amount_collected numeric(14,2) not null default 0,
  collected_date date,
  payment_type payment_type not null
);

create table direct_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  description text not null,
  amount numeric(14,2) not null,
  logged_by uuid references users(id),
  logged_at timestamptz not null default now()
);

create table finder_fee_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  logged_by uuid references users(id),
  logged_at timestamptz not null default now()
);

-- ============================================================
-- PAYOUT ENGINE
-- Business rules (finalized, do not reinterpret):
--   Quality factors: 0.9 rework/sloppy, 1.0 met spec, 1.1 above expectations
--   Pool split: cash collected - direct costs - reserve% = remaining profit
--               60% KPI team pool / 30% founder pool / 10% finder's fee pool
-- ============================================================
create table payout_config (
  id uuid primary key default gen_random_uuid(),
  effective_from timestamptz not null default now(),
  pool_split_json jsonb not null default '{"kpi_team_pool_pct": 0.60, "founder_pool_pct": 0.30, "finders_fee_pool_pct": 0.10}'::jsonb,
  role_weights_json jsonb not null default '{}'::jsonb,
  quality_factor_rule_json jsonb not null default '{"rework": 0.9, "met_specification": 1.0, "above_expectations": 1.1}'::jsonb,
  reserve_pct numeric(5,4) not null default 0.15
);

create table payout_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  config_snapshot_json jsonb not null,
  generated_by uuid references users(id),
  approved_by uuid references users(id),
  status payout_run_status not null default 'draft',
  total_distributed numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table payout_run_lines (
  id uuid primary key default gen_random_uuid(),
  payout_run_id uuid not null references payout_runs(id),
  user_id uuid not null references users(id),
  hours numeric(8,2) not null default 0,
  role_weight numeric(6,3) not null default 1,
  quality_factor numeric(4,2) not null default 1.0,
  points numeric(10,3) not null default 0,
  amount_paid numeric(14,2) not null default 0
);

-- ============================================================
-- CHAT & AUDIT
-- ============================================================
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_type channel_type not null,
  channel_id uuid not null,
  sender_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

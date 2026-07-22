// Hand-authored types matching supabase/migrations/0001_init_schema.sql.
// Once the project is linked, replace with `supabase gen types typescript`.

export type BaseRole = "ceo" | "cto" | "cfo" | "team";

export type CapabilityFlag =
  | "can_assign_tasks"
  | "can_monitor_tasks"
  | "can_review_deliverables"
  | "can_see_team_earnings"
  | "can_run_payouts"
  | "can_log_direct_costs"
  | "can_approve_founder_hours"
  | "can_export_financial_data"
  | "can_export_task_data"
  | "can_create_projects"
  | "can_view_tasks"
  | "can_edit_tasks"
  | "is_admin_ceo"
  | "is_admin_cto"
  | "is_admin_cfo";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled";
export type ProjectStatus = "active" | "archived";

export type UsersRow = {
  id: string;
  name: string;
  email: string;
  base_role: BaseRole;
  avatar_url: string | null;
  created_at: string;
};

export type UserCapabilityFlagsRow = {
  id: string;
  user_id: string;
  flag_name: CapabilityFlag;
  enabled: boolean;
  granted_by: string | null;
  granted_at: string;
};

export type ThemeName = "light" | "dark" | "pink";

export type UserPreferencesRow = {
  user_id: string;
  dark_mode: boolean;
  theme: ThemeName;
  notification_settings: Record<string, unknown>;
  google_calendar_connected: boolean;
};

export type ProjectsRow = {
  id: string;
  name: string;
  client_name: string;
  contract_value: number;
  status: ProjectStatus;
  created_at: string;
};

export type TasksRow = {
  id: string;
  title: string;
  project_id: string;
  assigned_to: string | null;
  assigned_by: string | null;
  role_tag: string | null;
  estimated_hours: number | null;
  deliverable_link: string | null;
  status: TaskStatus;
  deadline: string | null;
  google_calendar_event_id: string | null;
  created_at: string;
};

export type ReviewStatus = "pending" | "approved" | "returned";
export type PoolTag = "team" | "founder";
export type FounderApprovalStatus = "pending" | "approved" | "rejected";

export type DeliverablesRow = {
  id: string;
  task_id: string;
  link: string | null;
  note: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
};

export type TimeLogsRow = {
  id: string;
  task_id: string;
  user_id: string;
  hours: number;
  log_date: string;
  pool_tag: PoolTag;
  founder_approval_status: FounderApprovalStatus;
};

export type PayoutRunLinesRow = {
  id: string;
  payout_run_id: string;
  user_id: string;
  hours: number;
  role_weight: number;
  quality_factor: number;
  points: number;
  amount_paid: number;
};

export type UserGoogleTokensRow = {
  user_id: string;
  refresh_token: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details_json: Record<string, unknown>;
  created_at: string;
};

export type WorkSessionStatus = "active" | "completed" | "expired";

export type WorkSessionsRow = {
  id: string;
  user_id: string;
  task_id: string;
  pool_tag: PoolTag;
  started_at: string;
  last_checkin_at: string;
  ended_at: string | null;
  status: WorkSessionStatus;
  time_log_id: string | null;
};

export type PaymentType = "advance" | "completion";

export type CashLedgerRow = {
  id: string;
  project_id: string;
  invoice_amount: number;
  amount_collected: number;
  collected_date: string | null;
  payment_type: PaymentType;
};

export type DirectCostsRow = {
  id: string;
  project_id: string;
  description: string;
  amount: number;
  logged_by: string | null;
  logged_at: string;
};

export type PoolSplitJson = {
  kpi_team_pool_pct: number;
  founder_pool_pct: number;
  finders_fee_pool_pct: number;
};

export type QualityFactorRuleJson = {
  rework: number;
  met_specification: number;
  above_expectations: number;
};

export type PayoutConfigRow = {
  id: string;
  effective_from: string;
  pool_split_json: PoolSplitJson;
  role_weights_json: Record<string, number>;
  quality_factor_rule_json: QualityFactorRuleJson;
  reserve_pct: number;
};

export type PayoutRunStatus = "draft" | "approved" | "paid";

export type PayoutRunsRow = {
  id: string;
  project_id: string | null;
  period_start: string;
  period_end: string;
  config_snapshot_json: PayoutConfigRow;
  generated_by: string | null;
  approved_by: string | null;
  status: PayoutRunStatus;
  total_distributed: number;
  created_at: string;
};

// Minimal Database shape for supabase-js typing; extend as tables are consumed.
export interface Database {
  public: {
    Tables: {
      users: {
        Row: UsersRow;
        Insert: Partial<UsersRow>;
        Update: Partial<UsersRow>;
        Relationships: [];
      };
      user_capability_flags: {
        Row: UserCapabilityFlagsRow;
        Insert: Partial<UserCapabilityFlagsRow>;
        Update: Partial<UserCapabilityFlagsRow>;
        Relationships: [];
      };
      user_preferences: {
        Row: UserPreferencesRow;
        Insert: Partial<UserPreferencesRow>;
        Update: Partial<UserPreferencesRow>;
        Relationships: [];
      };
      projects: {
        Row: ProjectsRow;
        Insert: Partial<ProjectsRow>;
        Update: Partial<ProjectsRow>;
        Relationships: [];
      };
      tasks: {
        Row: TasksRow;
        Insert: Partial<TasksRow>;
        Update: Partial<TasksRow>;
        Relationships: [];
      };
      deliverables: {
        Row: DeliverablesRow;
        Insert: Partial<DeliverablesRow>;
        Update: Partial<DeliverablesRow>;
        Relationships: [];
      };
      time_logs: {
        Row: TimeLogsRow;
        Insert: Partial<TimeLogsRow>;
        Update: Partial<TimeLogsRow>;
        Relationships: [];
      };
      work_sessions: {
        Row: WorkSessionsRow;
        Insert: Partial<WorkSessionsRow>;
        Update: Partial<WorkSessionsRow>;
        Relationships: [];
      };
      payout_run_lines: {
        Row: PayoutRunLinesRow;
        Insert: Partial<PayoutRunLinesRow>;
        Update: Partial<PayoutRunLinesRow>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: Partial<AuditLogRow>;
        Update: Partial<AuditLogRow>;
        Relationships: [];
      };
      cash_ledger: {
        Row: CashLedgerRow;
        Insert: Partial<CashLedgerRow>;
        Update: Partial<CashLedgerRow>;
        Relationships: [];
      };
      direct_costs: {
        Row: DirectCostsRow;
        Insert: Partial<DirectCostsRow>;
        Update: Partial<DirectCostsRow>;
        Relationships: [];
      };
      payout_config: {
        Row: PayoutConfigRow;
        Insert: Partial<PayoutConfigRow>;
        Update: Partial<PayoutConfigRow>;
        Relationships: [];
      };
      user_google_tokens: {
        Row: UserGoogleTokensRow;
        Insert: Partial<UserGoogleTokensRow>;
        Update: Partial<UserGoogleTokensRow>;
        Relationships: [];
      };
      chat_messages: {
        Row: import("./chat.types").ChatMessagesRow;
        Insert: Partial<import("./chat.types").ChatMessagesRow>;
        Update: Partial<import("./chat.types").ChatMessagesRow>;
        Relationships: [];
      };
      payout_runs: {
        Row: PayoutRunsRow;
        Insert: Partial<PayoutRunsRow>;
        Update: Partial<PayoutRunsRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

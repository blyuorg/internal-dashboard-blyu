import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { CapabilityFlag } from "@/lib/database.types";

// Mirrors the RLS helper functions (auth_is_ceo/cto/cfo in
// supabase/migrations/0002_rls_policies.sql): base role match, OR the
// corresponding is_admin_* flag the CEO can grant from Role & permission
// management. Frontend routing is cosmetic — RLS is the real gate — but it
// must not contradict RLS by being more permissive.
const DASHBOARD_ACCESS: Record<"ceo" | "cto" | "cfo", { baseRole: "ceo" | "cto" | "cfo"; adminFlag: CapabilityFlag }> = {
  ceo: { baseRole: "ceo", adminFlag: "is_admin_ceo" },
  cto: { baseRole: "cto", adminFlag: "is_admin_cto" },
  cfo: { baseRole: "cfo", adminFlag: "is_admin_cfo" },
};

export function ProtectedRoute({
  children,
  dashboard,
}: {
  children: ReactNode;
  /** Omit for routes any authenticated user with a profile may access (e.g. /team). */
  dashboard?: "ceo" | "cto" | "cfo";
}) {
  const { session, profile, flags, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  // No users row (e.g. Google sign-in before the CEO provisioned them):
  // deny every gated dashboard rather than silently rendering it.
  if (!profile) return <Navigate to="/login" replace />;

  if (dashboard) {
    const { baseRole, adminFlag } = DASHBOARD_ACCESS[dashboard];
    const hasAccess = profile.base_role === baseRole || flags.has(adminFlag);
    if (!hasAccess) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

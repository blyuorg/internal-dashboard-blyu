import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { BaseRole } from "@/lib/database.types";

export function ProtectedRoute({
  children,
  allow,
}: {
  children: ReactNode;
  allow?: BaseRole[];
}) {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (allow && profile && !allow.includes(profile.base_role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

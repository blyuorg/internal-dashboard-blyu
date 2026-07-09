import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth, defaultRouteForRole } from "@/lib/auth";
import { ProtectedRoute } from "@/components/shell/ProtectedRoute";
import { AppShell } from "@/components/shell/AppShell";
import Login from "@/routes/Login";
import CeoDashboard from "@/routes/CeoDashboard";
import CtoDashboard from "@/routes/CtoDashboard";
import CfoDashboard from "@/routes/CfoDashboard";
import TeamDashboard from "@/routes/TeamDashboard";

function RoleHome() {
  const { profile } = useAuth();
  return <Navigate to={defaultRouteForRole(profile?.base_role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RoleHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ceo"
        element={
          <ProtectedRoute allow={["ceo"]}>
            <AppShell>
              <CeoDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cto"
        element={
          <ProtectedRoute allow={["cto"]}>
            <AppShell>
              <CtoDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cfo"
        element={
          <ProtectedRoute allow={["cfo"]}>
            <AppShell>
              <CfoDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <AppShell>
              <TeamDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

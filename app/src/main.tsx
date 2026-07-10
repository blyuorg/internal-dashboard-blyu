import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// A stale/expired session makes every RLS-gated query fail — without this,
// that shows up as dashboards silently rendering empty (0 hours, no
// projects) with no explanation. Detect the auth failure and force a
// sign-out so ProtectedRoute sends the user back to a real login instead.
const queryCache = new QueryCache({
  onError: (error) => {
    const message = error instanceof Error ? error.message : "";
    const code = (error as { code?: string })?.code ?? "";
    if (message.toLowerCase().includes("jwt") || code === "PGRST301" || code === "401") {
      supabase.auth.signOut();
    }
  },
});

const queryClient = new QueryClient({ queryCache });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);

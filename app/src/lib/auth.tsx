import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { BaseRole, CapabilityFlag, UsersRow } from "./database.types";

interface AuthState {
  session: Session | null;
  profile: UsersRow | null;
  flags: Set<CapabilityFlag>;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  flags: new Set(),
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UsersRow | null>(null);
  const [flags, setFlags] = useState<Set<CapabilityFlag>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Google OAuth only hands back a refresh token on the initial redirect;
      // persist it so the sync-task-calendar Edge Function can act on the
      // user's calendar later without another interactive login.
      if (event === "SIGNED_IN" && s?.provider_refresh_token && s.user) {
        supabase
          .from("user_google_tokens")
          .upsert({ user_id: s.user.id, refresh_token: s.provider_refresh_token })
          .then(({ error }) => {
            if (error) console.error("Failed to store Google refresh token", error);
          });
        supabase
          .from("user_preferences")
          .upsert({ user_id: s.user.id, google_calendar_connected: true })
          .then(() => {});
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setFlags(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [{ data: userRow }, { data: flagRows }] = await Promise.all([
        supabase.from("users").select("*").eq("id", session.user.id).single(),
        supabase
          .from("user_capability_flags")
          .select("flag_name")
          .eq("user_id", session.user.id)
          .eq("enabled", true),
      ]);
      setProfile(userRow ?? null);
      setFlags(new Set((flagRows ?? []).map((f) => f.flag_name)));
      setLoading(false);
    })();
  }, [session?.user?.id]);

  return (
    <AuthContext.Provider value={{ session, profile, flags, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useHasFlag(flag: CapabilityFlag) {
  const { flags } = useAuth();
  return flags.has(flag);
}

export function defaultRouteForRole(role: BaseRole | undefined) {
  switch (role) {
    case "ceo":
      return "/ceo";
    case "cto":
      return "/cto";
    case "cfo":
      return "/cfo";
    default:
      return "/team";
  }
}

import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth, defaultRouteForRole } from "@/lib/auth";

export default function Login() {
  const { session, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session && !loading && profile) {
    return <Navigate to={defaultRouteForRole(profile.base_role)} replace />;
  }

  // Signed in with Google/Supabase but no matching users row — most often
  // means they authenticated with a different email than the one the CEO
  // provisioned (a typo on either side). Say so explicitly instead of
  // silently bouncing them back to this same form with no explanation.
  if (session && !loading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)]">
        <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm">
          <h1 className="mb-2 text-lg font-semibold">No account found</h1>
          <p className="mb-1 text-sm text-[var(--color-text-muted)]">
            Signed in as <span className="text-[var(--color-text)]">{session.user.email}</span>
          </p>
          <p className="mb-6 text-sm text-[var(--color-text-muted)]">
            This email hasn't been added to Blyu yet. Ask your CEO to provision it, or sign in with
            the correct account if you have one.
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg)]"
          >
            Sign out and try another account
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) setError(error.message);
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.events",
        // Explicit, so the OAuth callback always lands back on whichever
        // origin the user started from (localhost in dev, the real deploy
        // in prod) instead of Supabase's configured Site URL default.
        redirectTo: window.location.origin,
      },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Blyu</h1>
        <p className="mb-6 text-sm text-[var(--color-text-muted)]">Sign in to your dashboard</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {error && <p className="text-xs text-[var(--color-critical)]">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
          or
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <button
          onClick={handleGoogle}
          className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg)]"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}

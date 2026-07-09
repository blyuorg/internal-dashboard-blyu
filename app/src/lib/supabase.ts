import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project values."
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    // Per-tab sessions: localStorage is shared across every tab of the
    // origin, so logging in as a different role in one tab silently swaps
    // the session in every other open tab. sessionStorage is scoped to the
    // single tab that created it, so each tab keeps its own login.
    storage: window.sessionStorage,
  },
});

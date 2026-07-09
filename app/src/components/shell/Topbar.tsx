import { Moon, Sun, Bell, Search, LogOut } from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { TimerWidget } from "@/components/timer/TimerWidget";

export function Topbar() {
  const { theme, toggle } = useDarkMode();
  const { profile } = useAuth();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      <button
        onClick={() =>
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
        }
        className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)]"
      >
        <Search size={14} />
        Search…
        <kbd className="ml-4 rounded border border-[var(--color-border)] px-1 text-xs">⌘K</kbd>
      </button>

      <div className="flex items-center gap-3">
        <TimerWidget />
        <button onClick={toggle} aria-label="Toggle dark mode" className="rounded-md p-1.5 hover:bg-[var(--color-bg)]">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button aria-label="Notifications" className="rounded-md p-1.5 hover:bg-[var(--color-bg)]">
          <Bell size={16} />
        </button>
        <span className="text-sm text-[var(--color-text-muted)]">{profile?.name}</span>
        <button
          onClick={() => supabase.auth.signOut()}
          aria-label="Sign out"
          className="rounded-md p-1.5 hover:bg-[var(--color-bg)]"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

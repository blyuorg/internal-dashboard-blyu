import { Bell, Search, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { TimerWidget } from "@/components/timer/TimerWidget";
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher";

export function Topbar() {
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
        <ThemeSwitcher />
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

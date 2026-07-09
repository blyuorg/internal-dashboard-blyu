import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const NAV_BY_ROLE: Record<string, { to: string; label: string }[]> = {
  ceo: [{ to: "/ceo", label: "Command" }],
  cto: [{ to: "/cto", label: "Delivery" }],
  cfo: [{ to: "/cfo", label: "Cash & Payouts" }],
  team: [{ to: "/team", label: "My Tasks" }],
};

export function Sidebar() {
  const { profile } = useAuth();
  const items = profile ? NAV_BY_ROLE[profile.base_role] ?? [] : [];

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-6 px-2 text-sm font-semibold tracking-tight">Blyu</div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `rounded-md px-2 py-1.5 text-sm ${
              isActive
                ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </aside>
  );
}

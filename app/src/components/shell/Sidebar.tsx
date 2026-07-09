import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { CapabilityFlag } from "@/lib/database.types";

// Every user always sees "My Tasks" (their own tasks/time log/earnings).
// The founder dashboards additionally show up when the base role matches,
// or the CEO has granted the matching is_admin_* upgrade flag.
const DASHBOARD_LINKS: {
  to: string;
  label: string;
  baseRole: "ceo" | "cto" | "cfo";
  adminFlag: CapabilityFlag;
}[] = [
  { to: "/ceo", label: "Command", baseRole: "ceo", adminFlag: "is_admin_ceo" },
  { to: "/cto", label: "Delivery", baseRole: "cto", adminFlag: "is_admin_cto" },
  { to: "/cfo", label: "Cash & Payouts", baseRole: "cfo", adminFlag: "is_admin_cfo" },
];

export function Sidebar() {
  const { profile, flags } = useAuth();

  const items = [
    ...DASHBOARD_LINKS.filter(
      (link) => profile?.base_role === link.baseRole || flags.has(link.adminFlag)
    ).map(({ to, label }) => ({ to, label })),
    { to: "/team", label: "My Tasks" },
  ];

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

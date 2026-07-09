import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface PaletteItem {
  label: string;
  hint: string;
  onSelect: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items: PaletteItem[] = [
    { label: "My tasks", hint: "Team", onSelect: () => navigate("/team") },
    { label: "CEO command view", hint: "Dashboard", onSelect: () => navigate("/ceo") },
    { label: "Delivery pipeline", hint: "CTO", onSelect: () => navigate("/cto") },
    { label: "Cash ledger", hint: "CFO", onSelect: () => navigate("/cfo") },
  ].filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          placeholder="Search tasks, projects, people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border-b border-[var(--color-border)] bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {items.map((item) => (
            <li key={item.label}>
              <button
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-[var(--color-bg)]"
              >
                <span>{item.label}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{item.hint}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--color-text-muted)]">No results</li>
          )}
        </ul>
      </div>
    </div>
  );
}

import { Moon, Sun, Cat } from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";
import type { ThemeName } from "@/lib/database.types";

const ICONS: Record<ThemeName, typeof Sun> = {
  light: Sun,
  dark: Moon,
  pink: Cat,
};

const OPTIONS: { theme: ThemeName; label: string }[] = [
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
  { theme: "pink", label: "Pink (just for fun)" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useDarkMode();
  const CurrentIcon = ICONS[theme];

  return (
    <div className="group relative">
      <button aria-label="Change theme" className="rounded-md p-1.5 hover:bg-[var(--color-bg)]">
        <CurrentIcon size={16} />
      </button>
      <div className="invisible absolute right-0 top-full z-40 flex gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 opacity-0 shadow-lg transition-opacity duration-100 group-hover:visible group-hover:opacity-100">
        {OPTIONS.map(({ theme: t, label }) => {
          const Icon = ICONS[t];
          return (
            <button
              key={t}
              onClick={() => setTheme(t)}
              aria-label={label}
              title={label}
              className={`rounded p-1.5 ${
                theme === t
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                  : "hover:bg-[var(--color-bg)]"
              }`}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

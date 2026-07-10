import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { ThemeName } from "@/lib/database.types";

function systemTheme(): ThemeName {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useDarkMode() {
  const { session } = useAuth();
  const [theme, setTheme] = useState<ThemeName>(systemTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from("user_preferences")
      .select("theme")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.theme) setTheme(data.theme);
      });
  }, [session?.user?.id]);

  const setAndPersist = useCallback(
    (next: ThemeName) => {
      setTheme(next);
      if (session?.user) {
        supabase
          .from("user_preferences")
          .upsert({ user_id: session.user.id, theme: next, dark_mode: next === "dark" })
          .then(() => {});
      }
    },
    [session?.user]
  );

  const toggle = useCallback(() => {
    setAndPersist(theme === "dark" ? "light" : "dark");
  }, [theme, setAndPersist]);

  return { theme, setTheme: setAndPersist, toggle };
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useDarkMode() {
  const { session } = useAuth();
  const [theme, setTheme] = useState<Theme>(systemTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from("user_preferences")
      .select("dark_mode")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTheme(data.dark_mode ? "dark" : "light");
      });
  }, [session?.user?.id]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (session?.user) {
        supabase
          .from("user_preferences")
          .upsert({ user_id: session.user.id, dark_mode: next === "dark" })
          .then(() => {});
      }
      return next;
    });
  }, [session?.user]);

  return { theme, toggle };
}

/**
 * ThemeContext — управление светлой/тёмной темой.
 * Синхронизируется с системной темой через Electron API.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { theme as electronTheme, isElectron } from "@/lib/electron";
import { config } from "@/lib/electron";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Определяем системную тему
    const getSystemTheme = async (): Promise<"light" | "dark"> => {
      if (isElectron()) {
        return electronTheme.getSystem();
      }
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };

    getSystemTheme().then(setSystemTheme);

    // Слушаем изменения системной темы
    if (isElectron()) {
      const unsub = electronTheme.onChange((t) => {
        setSystemTheme(t === "dark" ? "dark" : "light");
      });
      return unsub;
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, []);

  useEffect(() => {
    // Загружаем сохранённую тему
    (async () => {
      if (isElectron()) {
        const saved = await config.get("theme");
        if (saved) setThemeState(saved as Theme);
      } else {
        const saved = localStorage.getItem("theme") as Theme | null;
        if (saved) setThemeState(saved);
      }
    })();
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? systemTheme : theme;

  // Применяем тему к документу
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (isElectron()) {
      config.set("theme", t);
      electronTheme.set(t);
    } else {
      localStorage.setItem("theme", t);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

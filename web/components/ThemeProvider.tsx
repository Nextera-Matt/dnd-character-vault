"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  THEME_STORAGE_KEY,
  THEMES,
  applyTheme,
  readStoredTheme,
  type ThemeId,
} from "@/lib/themes";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "",
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("");

  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme: (id: ThemeId) => {
        setThemeState(id);
        applyTheme(id);
        if (id) localStorage.setItem(THEME_STORAGE_KEY, id);
        else localStorage.removeItem(THEME_STORAGE_KEY);
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <select
      className="bg-[var(--bg-raised)] text-[var(--ink)] border border-[var(--hairline)] text-xs px-2 py-1"
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemeId)}
      aria-label="Theme"
    >
      {THEMES.map((t) => (
        <option key={t.id || "default"} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

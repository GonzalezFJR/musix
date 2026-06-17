import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "normal" | "dark";
export const THEMES: Theme[] = ["light", "normal", "dark"];
export const THEME_LABELS: Record<Theme, string> = {
  light: "Claro",
  normal: "Normal",
  dark: "Oscuro",
};

const STORAGE_KEY = "musix_theme";

function readInitial(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "normal" ? saved : "normal";
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}

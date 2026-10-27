import { createContext } from "react";

export type ThemeMode = "light" | "dark";

export type ThemeContextValue = {
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

export const THEME_STORAGE_KEY = "crm-theme-mode";

export const ThemeContext = createContext<ThemeContextValue | null>(null);

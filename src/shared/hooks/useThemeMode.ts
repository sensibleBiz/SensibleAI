import { useContext } from "react";
import { ThemeContext } from "@/shared/lib/themeContext";

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeProvider");
  }
  return ctx;
}

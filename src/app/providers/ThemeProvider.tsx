import { ConfigProvider, theme as antdTheme } from "antd";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type ThemeMode,
} from "@/shared/lib/themeContext";

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyDocumentMode(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const initial = readStoredMode();
    if (typeof document !== "undefined") {
      applyDocumentMode(initial);
    }
    return initial;
  });

  useEffect(() => {
    applyDocumentMode(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* ignore quota / private mode */
    }
  }, [mode]);

  const toggleTheme = useCallback(() => {
    setMode((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      isDark: mode === "dark",
      mode,
      setMode,
      toggleTheme,
    }),
    [mode, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm:
            mode === "dark"
              ? antdTheme.darkAlgorithm
              : antdTheme.defaultAlgorithm,
          token: {
            fontFamily:
              "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            borderRadius: 8,
            borderRadiusLG: 12,
            borderRadiusSM: 6,
            colorPrimary: mode === "dark" ? "#3b82f6" : "#2563eb",
            colorSuccess: "#10b981",
            colorWarning: "#f59e0b",
            colorError: "#ef4444",
            colorInfo: "#3b82f6",
            ...(mode === "dark"
              ? {
                  colorBgBase: "#0b0f19",
                  colorBgContainer: "#131b2e",
                  colorBgElevated: "#1a233a",
                  colorBgLayout: "#0b0f19",
                  colorBorder: "#1e293b",
                  colorBorderSecondary: "#1e293b",
                  colorText: "rgba(255, 255, 255, 0.9)",
                  colorTextSecondary: "rgba(255, 255, 255, 0.65)",
                  colorTextTertiary: "rgba(255, 255, 255, 0.45)",
                  colorTextQuaternary: "rgba(255, 255, 255, 0.25)",
                  colorFill: "rgba(255, 255, 255, 0.18)",
                  colorFillSecondary: "rgba(255, 255, 255, 0.12)",
                  colorFillTertiary: "rgba(255, 255, 255, 0.08)",
                  colorFillQuaternary: "rgba(255, 255, 255, 0.04)",
                }
              : {
                  colorBgLayout: "#f8fafc",
                  colorBgContainer: "#ffffff",
                  colorBgElevated: "#ffffff",
                  colorBorder: "#e2e8f0",
                  colorBorderSecondary: "#f1f5f9",
                  colorText: "#0f172a",
                  colorTextSecondary: "#475569",
                  colorTextTertiary: "#94a3b8",
                }),
          },
          components: {
            Card: {
              colorBgContainer: mode === "dark" ? "#131b2e" : "#ffffff",
              colorBorderSecondary: mode === "dark" ? "#1e293b" : "#e2e8f0",
              headerHeight: 52,
            },
            Table: {
              headerBg: mode === "dark" ? "#0f172a" : "#f8fafc",
              headerColor: mode === "dark" ? "#cbd5e1" : "#334155",
              rowHoverBg: mode === "dark" ? "#1a233a" : "#f1f5f9",
              borderColor: mode === "dark" ? "#1e293b" : "#e2e8f0",
            },
            Modal: {
              contentBg: mode === "dark" ? "#131b2e" : "#ffffff",
              headerBg: mode === "dark" ? "#131b2e" : "#ffffff",
              titleColor:
                mode === "dark" ? "rgba(255, 255, 255, 0.9)" : "#0f172a",
            },
            Drawer: {
              colorBgElevated: mode === "dark" ? "#131b2e" : "#ffffff",
            },
            Input: {
              colorBgContainer: mode === "dark" ? "#131b2e" : "#ffffff",
              colorBorder: mode === "dark" ? "#1e293b" : "#cbd5e1",
              colorText:
                mode === "dark" ? "rgba(255, 255, 255, 0.9)" : "#0f172a",
              colorTextPlaceholder:
                mode === "dark" ? "rgba(255, 255, 255, 0.35)" : "#94a3b8",
            },
            Select: {
              colorBgContainer: mode === "dark" ? "#131b2e" : "#ffffff",
              colorBgElevated: mode === "dark" ? "#1a233a" : "#ffffff",
              colorBorder: mode === "dark" ? "#1e293b" : "#cbd5e1",
              optionSelectedBg: mode === "dark" ? "#1e293b" : "#eff6ff",
            },
            DatePicker: {
              colorBgContainer: mode === "dark" ? "#131b2e" : "#ffffff",
              colorBgElevated: mode === "dark" ? "#1a233a" : "#ffffff",
              colorBorder: mode === "dark" ? "#1e293b" : "#cbd5e1",
            },
            Segmented: {
              itemSelectedBg: mode === "dark" ? "#1e293b" : "#ffffff",
              trackBg: mode === "dark" ? "#0f172a" : "#f1f5f9",
            },
            Button: {
              fontWeight: 500,
            },
            Tag: {
              borderRadiusSM: 6,
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

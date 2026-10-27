import React from "react";
import MainLayout from "@/layouts/MainLayout";
import GoogleWorkspaceLayout from "@/layouts/GoogleWorkspaceLayout";

/**
 * AppLayoutShell: Dynamic layout resolver for Sensible SaaS Suite
 *
 * Defaults to the modern Google Workspace / Material Design 3 layout.
 * Supports 1-click fallback to the legacy Ant Design MainLayout if requested by the user.
 */
export const AppLayoutShell: React.FC = () => {
  const isClassicTheme =
    typeof window !== "undefined" &&
    localStorage.getItem("crm_ui_theme") === "classic";

  if (isClassicTheme) {
    return <MainLayout />;
  }

  return <GoogleWorkspaceLayout />;
};

export default AppLayoutShell;


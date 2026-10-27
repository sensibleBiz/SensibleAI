// src/routes/PrivateRoute.tsx
import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import type { RootState } from "@/app/store";

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authMode, isAuthenticated, postgresStatus } = useSelector((s: RootState) => s.auth);
  const location = useLocation();
  if (
    authMode === "postgres" &&
    (postgresStatus === "idle" || postgresStatus === "checking")
  ) return null;
  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate
      to="/login"
      replace
      state={{
        returnTo: `${location.pathname}${location.search}${location.hash}`,
      }}
    />
  );
};

export default PrivateRoute;

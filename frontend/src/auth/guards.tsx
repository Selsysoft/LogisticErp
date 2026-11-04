import { Box, CircularProgress } from "@mui/material";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { hasPermission, useAuthStore } from "./authStore";

export function RequireAuth() {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === "loading") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress aria-label="Yükleniyor" />
      </Box>
    );
  }
  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const me = useAuthStore((state) => state.me);

  if (!hasPermission(me, permission)) {
    return <EmptyState title={t("forbidden.title")} description={t("forbidden.description")} />;
  }
  return <>{children}</>;
}

/** Giriş sonrası kullanıcıyı rolünün açılış ekranına götürür. */
export function LandingRedirect() {
  const landingPath = useAuthStore((state) => state.me?.landingPath ?? "/dashboard");
  return <Navigate to={landingPath} replace />;
}

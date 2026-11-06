import { Tab, Tabs, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, Navigate, useLocation } from "react-router-dom";
import { SuspenseOutlet } from "../../components/lazyPage";
import { hasPermission, useAuthStore } from "../../auth/authStore";
import { EmptyState } from "../../components/EmptyState";

const ROOT = "/reports";
const TABS = [
  { path: ROOT, label: "reports.tabs.profitability", permission: "SHIPMENT_VIEW" },
  { path: `${ROOT}/operations`, label: "reports.tabs.operations", permission: "SHIPMENT_VIEW" },
  { path: `${ROOT}/finance`, label: "reports.tabs.finance", permission: "FINANCE_VIEW" },
  { path: `${ROOT}/fleet`, label: "reports.tabs.fleet", permission: "FLEET_VIEW" },
];

export function ReportsLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const me = useAuthStore((state) => state.me);
  const visible = TABS.filter((tab) => hasPermission(me, tab.permission));
  const current = visible.find((tab) => tab.path === pathname);

  if (visible.length === 0) {
    return <EmptyState title={t("reports.noAccess")} />;
  }
  // Rapor yetkisi olup sefer yetkisi olmayan kullanıcı açabildiği ilk sekmeye gider.
  if (!current) {
    return <Navigate to={visible[0].path} replace />;
  }

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
        {t("nav.reports")}
      </Typography>
      <Tabs
        value={current.path}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {visible.map((tab) => (
          <Tab
            key={tab.path}
            value={tab.path}
            label={t(tab.label)}
            component={RouterLink}
            to={tab.path}
          />
        ))}
      </Tabs>
      <SuspenseOutlet />
    </>
  );
}

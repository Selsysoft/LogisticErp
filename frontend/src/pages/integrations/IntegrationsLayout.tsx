import { Tab, Tabs, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { hasPermission, useAuthStore } from "../../auth/authStore";

const TABS = [
  { path: "/integrations", label: "integrations.tabs.edocuments", permission: "SHIPMENT_VIEW" },
  { path: "/integrations/imports", label: "integrations.tabs.imports", permission: "FLEET_VIEW" },
  { path: "/integrations/bank", label: "integrations.tabs.bank", permission: "FINANCE_VIEW" },
  { path: "/integrations/gps", label: "integrations.tabs.gps", permission: "SHIPMENT_VIEW" },
  {
    path: "/integrations/distances",
    label: "integrations.tabs.distances",
    permission: "SHIPMENT_VIEW",
  },
];

export function IntegrationsLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const me = useAuthStore((state) => state.me);
  const visible = TABS.filter((tab) => hasPermission(me, tab.permission));
  const current =
    TABS.slice(1).find((tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`))
      ?.path ?? "/integrations";

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
        {t("nav.integrations")}
      </Typography>
      <Tabs
        value={visible.some((tab) => tab.path === current) ? current : false}
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
      <Outlet />
    </>
  );
}

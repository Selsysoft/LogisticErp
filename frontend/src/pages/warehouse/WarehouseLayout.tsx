import { Tab, Tabs, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";

const TABS = [
  { path: "/warehouse", label: "warehouse.tabs.stock" },
  { path: "/warehouse/movements", label: "warehouse.tabs.movements" },
  { path: "/warehouse/counts", label: "warehouse.tabs.counts" },
  { path: "/warehouse/billing", label: "warehouse.tabs.billing" },
  { path: "/warehouse/definitions", label: "warehouse.tabs.definitions" },
];

export function WarehouseLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current =
    TABS.slice(1).find((tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`))
      ?.path ?? "/warehouse";

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
        {t("nav.warehouse")}
      </Typography>
      <Tabs
        value={current}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {TABS.map((tab) => (
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

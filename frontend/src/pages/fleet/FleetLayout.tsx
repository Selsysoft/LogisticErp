import { Tab, Tabs, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { SuspenseOutlet } from "../../components/lazyPage";

const TABS = [
  { path: "/fleet", label: "fleet.tabs.dashboard" },
  { path: "/fleet/vehicles", label: "fleet.tabs.vehicles" },
  { path: "/fleet/drivers", label: "fleet.tabs.drivers" },
  { path: "/fleet/expenses", label: "fleet.tabs.expenses" },
  { path: "/fleet/availability", label: "fleet.tabs.availability" },
  { path: "/fleet/reports", label: "fleet.tabs.reports" },
];

export function FleetLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current =
    TABS.slice(1).find((tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`))
      ?.path ?? "/fleet";

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
        {t("nav.fleet")}
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
      <SuspenseOutlet />
    </>
  );
}

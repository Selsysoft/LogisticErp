import { Tab, Tabs, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";

const TABS = [
  { path: "/operations", label: "operations.tabs.shipments" },
  { path: "/operations/board", label: "operations.tabs.board" },
  { path: "/operations/profit", label: "operations.tabs.profit" },
  { path: "/operations/driver-expenses", label: "operations.tabs.driverExpenses" },
];

export function OperationsLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current = TABS.slice(1).find((tab) => pathname === tab.path)?.path ?? "/operations";

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
        {t("nav.operations")}
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

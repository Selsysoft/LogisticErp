import { Box, Tab, Tabs, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { SuspenseOutlet } from "../../components/lazyPage";

const TABS = [
  { path: "/finance", label: "finance.tabs.dashboard" },
  { path: "/finance/accounts", label: "finance.tabs.accounts" },
  { path: "/finance/funds", label: "finance.tabs.funds" },
  { path: "/finance/settlements", label: "finance.tabs.settlements" },
  { path: "/finance/instruments", label: "finance.tabs.instruments" },
  { path: "/finance/invoices", label: "finance.tabs.invoices" },
  { path: "/finance/plans", label: "finance.tabs.plans" },
  { path: "/finance/reports", label: "finance.tabs.reports" },
  { path: "/finance/definitions", label: "finance.tabs.definitions" },
];

export function FinanceLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current =
    TABS.slice(1).find((tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`))
      ?.path ?? "/finance";

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
        {t("nav.finance")}
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
      <Box>
        <SuspenseOutlet />
      </Box>
    </>
  );
}

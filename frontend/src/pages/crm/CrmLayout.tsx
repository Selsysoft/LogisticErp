import { Tab, Tabs, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { SuspenseOutlet } from "../../components/lazyPage";

const TABS = [
  { path: "/crm", label: "crm.tabs.dashboard" },
  { path: "/crm/customers", label: "crm.tabs.customers" },
  { path: "/crm/opportunities", label: "crm.tabs.opportunities" },
  { path: "/crm/quotes", label: "crm.tabs.quotes" },
  { path: "/crm/contracts", label: "crm.tabs.contracts" },
  { path: "/crm/tariffs", label: "crm.tabs.tariffs" },
  { path: "/crm/pricing", label: "crm.tabs.pricing" },
];

export function CrmLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current =
    TABS.slice(1).find((tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`))
      ?.path ?? "/crm";

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
        {t("nav.crm")}
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

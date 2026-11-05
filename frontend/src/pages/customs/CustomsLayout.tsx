import { Tab, Tabs, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";

const TABS = [
  { path: "/customs", label: "customs.tabs.declarations" },
  { path: "/customs/transits", label: "customs.tabs.transits" },
  { path: "/customs/permits", label: "customs.tabs.permits" },
  { path: "/customs/crossings", label: "customs.tabs.crossings" },
];

export function CustomsLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current =
    TABS.slice(1).find((tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`))
      ?.path ?? "/customs";

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
        {t("nav.customs")}
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

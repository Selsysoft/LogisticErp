import { Alert, Box, Button, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { CenteredCard } from "../../components/CenteredCard";
import { ErrorState } from "../../components/ErrorState";
import { BRAND } from "../../theme";
import { adminRequest, useAdminSession } from "./adminApi";

const ROOT = "/saas";
const TABS = [
  { path: ROOT, label: "saas.tabs.tenants" },
  { path: `${ROOT}/plans`, label: "saas.tabs.plans" },
  { path: `${ROOT}/invoices`, label: "saas.tabs.invoices" },
  { path: `${ROOT}/health`, label: "saas.tabs.health" },
  { path: `${ROOT}/audit`, label: "saas.tabs.audit" },
];

export function SaasLoginPage() {
  const { t } = useTranslation();
  const token = useAdminSession((state) => state.token);
  const setToken = useAdminSession((state) => state.setToken);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () =>
      adminRequest<{ accessToken: string }>("POST", "/auth/login", { email, password }),
    onSuccess: (tokens) => setToken(tokens.accessToken),
  });
  if (token) {
    return <Navigate to={ROOT} replace />;
  }
  return (
    <CenteredCard title={t("saas.login.title")}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate();
        }}
      >
        <Stack spacing={2}>
          {login.isError && <ErrorState error={login.error} />}
          <TextField
            required
            label={t("saas.login.email")}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            required
            label={t("saas.login.password")}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" variant="contained" disabled={login.isPending}>
            {t("saas.login.submit")}
          </Button>
        </Stack>
      </form>
    </CenteredCard>
  );
}

export function SaasLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const token = useAdminSession((state) => state.token);
  const setToken = useAdminSession((state) => state.setToken);
  if (!token) {
    return <Navigate to={`${ROOT}/login`} replace />;
  }
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Stack
        direction="row"
        sx={{
          px: 3,
          py: 2,
          color: "#fff",
          background: BRAND.gradient,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h6" component="h1">
          {t("saas.title")}
        </Typography>
        <Button color="inherit" onClick={() => setToken(null)}>
          {t("nav.logout")}
        </Button>
      </Stack>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("saas.notice")}
        </Alert>
        <Tabs
          value={TABS.some((tab) => tab.path === pathname) ? pathname : false}
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
      </Box>
    </Box>
  );
}

import { Box, Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet } from "../api/client";
import { hasPermission, useAuthStore } from "../auth/authStore";
import { MODULE_ITEMS } from "../components/AppShell";
import { DashboardWidgets } from "./reports/DashboardWidgets";
import { BRAND } from "../theme";

/** Henüz geliştirilmemiş modüller; kartları "yakında" ile işaretlenir. */
const UPCOMING = ["/driver"];
const DASHBOARD_PATH = "/dashboard";

export function HomePage() {
  const { t } = useTranslation();
  const me = useAuthStore((state) => state.me);
  const ping = useQuery({
    queryKey: ["ping"],
    queryFn: () => apiGet<{ status: string }>("/ping"),
  });
  const modules = MODULE_ITEMS.filter(
    (item) => item.path !== DASHBOARD_PATH && hasPermission(me, item.permission),
  );

  return (
    <Stack spacing={3}>
      <Box
        sx={{
          p: { xs: 2.5, md: 4 },
          borderRadius: 4,
          color: "#fff",
          background: BRAND.backdrop,
          backgroundColor: BRAND.main,
        }}
      >
        <Typography variant="h5" component="h1">
          {t("home.welcome", { name: me?.fullName ?? "" })}
        </Typography>
        <Typography sx={{ mt: 0.5, opacity: 0.9 }}>{t("home.subtitle")}</Typography>
        <Chip
          size="small"
          sx={{ mt: 2, color: "#fff", bgcolor: "rgba(255,255,255,.18)" }}
          label={
            ping.isSuccess ? t("home.apiOk") : ping.isError ? t("home.apiDown") : t("home.loading")
          }
        />
      </Box>
      <DashboardWidgets />
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" },
        }}
      >
        {modules.map(({ path, label, Icon }) => (
          <Card key={path} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardActionArea component={RouterLink} to={path} sx={{ p: 2.5, height: "100%" }}>
              <Stack direction="row" spacing={2}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "12px",
                    color: "#fff",
                    background: BRAND.gradient,
                  }}
                >
                  <Icon />
                </Box>
                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                      {t(label)}
                    </Typography>
                    {UPCOMING.includes(path) && (
                      <Chip size="small" variant="outlined" label={t("home.upcoming")} />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {t(`home.modules.${path.slice(1)}`)}
                  </Typography>
                </Box>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}

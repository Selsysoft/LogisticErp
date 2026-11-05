import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BRAND } from "../theme";
import { BrandLogo } from "./BrandLogo";

const GRID_LINE = "rgba(255,255,255,.05)";
const GRID_SIZE = 44;

/** Oturum açılmamış ekranların ortak görünümü: kareli mavi zemin üzerinde marka kartı. */
export function CenteredCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        px: 2,
        py: 3,
        background: BRAND.backdrop,
        backgroundColor: BRAND.main,
        position: "relative",
        "&::before": {
          content: '""',
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: `linear-gradient(${GRID_LINE} 1px, transparent 1px),
            linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        },
      }}
    >
      <Card
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: 440,
          m: "auto",
          borderRadius: "24px",
          borderTop: `5px solid ${BRAND.light}`,
          boxShadow: "0 24px 70px rgba(18,43,96,.40), 0 2px 6px rgba(18,43,96,.15)",
          "@keyframes cardIn": {
            from: { opacity: 0, transform: "translateY(18px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
          animation: "cardIn .5s cubic-bezier(.2,.7,.3,1) both",
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, "&:last-child": { pb: { xs: 2, sm: 3 } } }}>
          <Stack sx={{ alignItems: "center", mb: 2 }}>
            <BrandLogo size={44} />
          </Stack>
          {intro}
          <Typography variant="h6" component="h1" sx={{ mb: 2, textAlign: "center" }}>
            {title}
          </Typography>
          {children}
          <Typography
            variant="caption"
            component="p"
            color="text.secondary"
            sx={{
              mt: 3,
              pt: 2,
              textAlign: "center",
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            © {new Date().getFullYear()} {t("appName")} · {t("login.tagline")}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

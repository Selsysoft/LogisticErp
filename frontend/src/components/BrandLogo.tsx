import { Box, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { BRAND } from "../theme";

const BAR_OPACITY = [1, 0.7, 0.45];

/** Yazı ve üç çubuklu işaret. Koyu zeminde beyaz, açık zeminde marka rengindedir. */
export function BrandLogo({ onDark = false, size = 32 }: { onDark?: boolean; size?: number }) {
  const { t } = useTranslation();
  const color = onDark ? "#fff" : BRAND.main;
  return (
    <Stack direction="row" spacing={1.25} role="img" aria-label={t("appName")}>
      <Stack direction="row" spacing={0.4} sx={{ height: size }}>
        {BAR_OPACITY.map((opacity) => (
          <Box key={opacity} sx={{ width: size * 0.26, bgcolor: color, opacity }} />
        ))}
      </Stack>
      <Box sx={{ color, textAlign: "left", lineHeight: 1 }}>
        <Typography
          component="div"
          sx={{
            fontFamily: "Sora, sans-serif",
            fontWeight: 700,
            fontSize: size * 0.6,
            lineHeight: 1,
          }}
        >
          Blackrose
        </Typography>
        <Typography
          component="div"
          sx={{ fontWeight: 600, fontSize: size * 0.36, lineHeight: 1.2, opacity: 0.85 }}
        >
          Nakliye
        </Typography>
      </Box>
    </Stack>
  );
}

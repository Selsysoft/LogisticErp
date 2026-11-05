import { createTheme } from "@mui/material";
import { trTR } from "@mui/material/locale";

export const BRAND = {
  light: "#6689ff",
  main: "#3a6ed1",
  dark: "#254fa8",
  ink: "#1e293b",
  soft: "#eef4ff",
  softBorder: "#dbe7ff",
  gradient: "linear-gradient(135deg, #6689ff, #3a6ed1)",
  /** Giriş ekranı zemini: yumuşak ışık lekeleri ve ana gradyan. */
  backdrop: `radial-gradient(circle at 18% 22%, rgba(125,156,255,.55), transparent 42%),
    radial-gradient(circle at 82% 78%, rgba(37,79,168,.55), transparent 45%),
    linear-gradient(135deg, #6689ff, #3a6ed1 82%)`,
};

const BODY_FONT = "'Plus Jakarta Sans', 'Segoe UI', sans-serif";
const HEADING_FONT = "'Sora', 'Plus Jakarta Sans', sans-serif";

export const theme = createTheme(
  {
    palette: {
      primary: { main: BRAND.main, light: BRAND.light, dark: BRAND.dark },
      background: { default: "#f4f7fc" },
      text: { primary: BRAND.ink, secondary: "#64748b" },
      divider: "#e2e8f0",
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: BODY_FONT,
      h5: { fontFamily: HEADING_FONT, fontWeight: 700 },
      h6: { fontFamily: HEADING_FONT, fontWeight: 600 },
      button: { fontWeight: 600, textTransform: "none" },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          contained: { boxShadow: "none" },
          containedPrimary: {
            background: BRAND.gradient,
            "&:hover": { background: BRAND.gradient, filter: "brightness(1.05)" },
            "&.Mui-disabled": { background: "#cbd5e1" },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: { root: { background: BRAND.gradient, boxShadow: "none" } },
      },
      MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 600 } } },
      MuiTableCell: {
        styleOverrides: { head: { fontWeight: 700, color: "#334155", background: "#f8fafc" } },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            margin: "2px 8px",
            "&.Mui-selected": {
              background: BRAND.soft,
              color: BRAND.main,
              "& .MuiListItemIcon-root": { color: BRAND.main },
              "&:hover": { background: BRAND.soft },
            },
          },
        },
      },
    },
  },
  trTR,
);

import MenuIcon from "@mui/icons-material/Menu";
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { hasPermission, useAuthStore } from "../auth/authStore";

const DRAWER_WIDTH = 240;

export const MODULE_ITEMS = [
  { path: "/dashboard", label: "nav.dashboard" },
  { path: "/finance", label: "nav.finance", permission: "FINANCE_VIEW" },
  { path: "/operations", label: "nav.operations", permission: "SHIPMENT_VIEW" },
  { path: "/crm", label: "nav.crm", permission: "CRM_VIEW" },
  { path: "/fleet", label: "nav.fleet", permission: "FLEET_VIEW" },
  { path: "/warehouse", label: "nav.warehouse", permission: "WAREHOUSE_VIEW" },
  { path: "/customs", label: "nav.customs", permission: "CUSTOMS_VIEW" },
  { path: "/driver", label: "nav.driver", permission: "DRIVER_APP" },
];

const ADMIN_ITEMS = [
  { path: "/users", label: "nav.users", permission: "USER_VIEW" },
  { path: "/roles", label: "nav.roles", permission: "ROLE_MANAGE" },
  { path: "/audit", label: "nav.audit", permission: "AUDIT_VIEW" },
];

export function AppShell() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up("md"));
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const me = useAuthStore((state) => state.me);
  const logout = useAuthStore((state) => state.logout);

  const renderItems = (items: typeof MODULE_ITEMS) =>
    items
      .filter((item) => hasPermission(me, item.permission))
      .map((item) => (
        <ListItemButton
          key={item.path}
          component={RouterLink}
          to={item.path}
          selected={
            location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
          }
          onClick={() => setOpen(false)}
        >
          <ListItemText primary={t(item.label)} />
        </ListItemButton>
      ));

  const visibleAdminItems = renderItems(ADMIN_ITEMS);
  const drawer = (
    <>
      <Toolbar />
      <List component="nav">{renderItems(MODULE_ITEMS)}</List>
      {visibleAdminItems.length > 0 && <Divider />}
      <List component="nav">{visibleAdminItems}</List>
    </>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (z) => z.zIndex.drawer + 1 }}>
        <Toolbar>
          {!isWide && (
            <IconButton
              color="inherit"
              edge="start"
              aria-label="Menü"
              onClick={() => setOpen(!open)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            {t("appName")}
          </Typography>
          <Button color="inherit" component={RouterLink} to="/account" sx={{ minWidth: 0 }}>
            <Box
              component="span"
              sx={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {isWide ? me?.fullName : t("nav.account")}
            </Box>
          </Button>
          <Button color="inherit" onClick={() => void logout()}>
            {t("nav.logout")}
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant={isWide ? "permanent" : "temporary"}
        open={isWide || open}
        onClose={() => setOpen(false)}
        sx={{
          width: isWide ? DRAWER_WIDTH : undefined,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        {drawer}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 } }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}

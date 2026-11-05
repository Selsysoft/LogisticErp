import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AssessmentIcon from "@mui/icons-material/Assessment";
import BadgeIcon from "@mui/icons-material/Badge";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import GroupIcon from "@mui/icons-material/Group";
import HandshakeIcon from "@mui/icons-material/Handshake";
import HistoryIcon from "@mui/icons-material/History";
import HubIcon from "@mui/icons-material/Hub";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import PublicIcon from "@mui/icons-material/Public";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { hasPermission, useAuthStore } from "../auth/authStore";
import { BrandLogo } from "./BrandLogo";

const DRAWER_WIDTH = 240;

export const MODULE_ITEMS = [
  { path: "/dashboard", label: "nav.dashboard", Icon: DashboardIcon },
  { path: "/finance", label: "nav.finance", permission: "FINANCE_VIEW", Icon: AccountBalanceIcon },
  {
    path: "/operations",
    label: "nav.operations",
    permission: "SHIPMENT_VIEW",
    Icon: LocalShippingIcon,
  },
  { path: "/crm", label: "nav.crm", permission: "CRM_VIEW", Icon: HandshakeIcon },
  { path: "/fleet", label: "nav.fleet", permission: "FLEET_VIEW", Icon: DirectionsCarIcon },
  { path: "/warehouse", label: "nav.warehouse", permission: "WAREHOUSE_VIEW", Icon: WarehouseIcon },
  { path: "/customs", label: "nav.customs", permission: "CUSTOMS_VIEW", Icon: PublicIcon },
  { path: "/driver", label: "nav.driver", permission: "DRIVER_APP", Icon: BadgeIcon },
  {
    path: "/integrations",
    label: "nav.integrations",
    permission: "INTEGRATION_VIEW",
    Icon: HubIcon,
  },
  { path: "/reports", label: "nav.reports", permission: "REPORT_VIEW", Icon: AssessmentIcon },
];

const ADMIN_ITEMS = [
  { path: "/users", label: "nav.users", permission: "USER_VIEW", Icon: GroupIcon },
  { path: "/roles", label: "nav.roles", permission: "ROLE_MANAGE", Icon: AdminPanelSettingsIcon },
  { path: "/audit", label: "nav.audit", permission: "AUDIT_VIEW", Icon: HistoryIcon },
];

export function AppShell() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up("md"));
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const me = useAuthStore((state) => state.me);
  const logout = useAuthStore((state) => state.logout);

  const renderItems = (items: typeof MODULE_ITEMS | typeof ADMIN_ITEMS) =>
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
          <ListItemIcon sx={{ minWidth: 36 }}>
            <item.Icon fontSize="small" />
          </ListItemIcon>
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
          <Box sx={{ flexGrow: 1, display: "flex" }}>
            <BrandLogo onDark size={30} />
          </Box>
          <Button color="inherit" component={RouterLink} to="/account" sx={{ minWidth: 0 }}>
            <Box
              component="span"
              sx={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {isWide ? me?.fullName : t("nav.account")}
            </Box>
          </Button>
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={() => void logout()}>
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

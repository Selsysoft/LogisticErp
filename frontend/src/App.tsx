import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import { useAuthStore } from "./auth/authStore";
import { LandingRedirect, RequireAuth, RequirePermission } from "./auth/guards";
import { AppShell, MODULE_ITEMS } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { AccountDetailPage, AccountsPage } from "./pages/finance/AccountsPage";
import { DefinitionsPage } from "./pages/finance/DefinitionsPage";
import { FinanceDashboardPage } from "./pages/finance/FinanceDashboardPage";
import { FinanceLayout } from "./pages/finance/FinanceLayout";
import { FundDetailPage, FundsPage } from "./pages/finance/FundsPage";
import { InstrumentsPage } from "./pages/finance/InstrumentsPage";
import { InvoicesPage } from "./pages/finance/InvoicesPage";
import { PlansPage } from "./pages/finance/PlansPage";
import { ReportsPage } from "./pages/finance/ReportsPage";
import { SettlementsPage } from "./pages/finance/SettlementsPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HomePage } from "./pages/HomePage";
import { AccountPage } from "./pages/identity/AccountPage";
import { AuditLogPage } from "./pages/identity/AuditLogPage";
import { RolesPage } from "./pages/identity/RolesPage";
import { UsersPage } from "./pages/identity/UsersPage";
import { LoginPage } from "./pages/LoginPage";
import { ModulePage } from "./pages/ModulePage";
import { SetPasswordPage } from "./pages/SetPasswordPage";

export function App() {
  const { t } = useTranslation();
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<LandingRedirect />} />
          <Route path="/dashboard" element={<HomePage />} />
          <Route
            path="/finance"
            element={
              <RequirePermission permission="FINANCE_VIEW">
                <FinanceLayout />
              </RequirePermission>
            }
          >
            <Route index element={<FinanceDashboardPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="accounts/:id" element={<AccountDetailPage />} />
            <Route path="funds" element={<FundsPage />} />
            <Route path="funds/:id" element={<FundDetailPage />} />
            <Route path="instruments" element={<InstrumentsPage />} />
            <Route path="settlements" element={<SettlementsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="definitions" element={<DefinitionsPage />} />
          </Route>
          {MODULE_ITEMS.filter((item) => item.permission && item.path !== "/finance").map(
            (item) => (
              <Route
                key={item.path}
                path={item.path}
                element={
                  <RequirePermission permission={item.permission!}>
                    <ModulePage label={item.label} />
                  </RequirePermission>
                }
              />
            ),
          )}
          <Route
            path="/users"
            element={
              <RequirePermission permission="USER_VIEW">
                <UsersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/roles"
            element={
              <RequirePermission permission="ROLE_MANAGE">
                <RolesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/audit"
            element={
              <RequirePermission permission="AUDIT_VIEW">
                <AuditLogPage />
              </RequirePermission>
            }
          />
          <Route path="/account" element={<AccountPage />} />
          <Route
            path="*"
            element={
              <EmptyState title={t("notFound.title")} description={t("notFound.description")} />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}

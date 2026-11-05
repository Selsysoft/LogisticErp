import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import { useAuthStore } from "./auth/authStore";
import { LandingRedirect, RequireAuth, RequirePermission } from "./auth/guards";
import { AppShell, MODULE_ITEMS } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { ContractsPage } from "./pages/crm/ContractsPage";
import { CrmDashboardPage } from "./pages/crm/CrmDashboardPage";
import { CrmLayout } from "./pages/crm/CrmLayout";
import { CustomerDetailPage, CustomersPage } from "./pages/crm/CustomersPage";
import { OpportunitiesPage } from "./pages/crm/OpportunitiesPage";
import { PriceCalculatorPage } from "./pages/crm/PriceCalculatorPage";
import { QuoteDetailPage, QuotesPage } from "./pages/crm/QuotesPage";
import { TariffDetailPage, TariffsPage } from "./pages/crm/TariffsPage";
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
import { AvailabilityPage } from "./pages/fleet/AvailabilityPage";
import { DriverDetailPage, DriversPage } from "./pages/fleet/DriversPage";
import { ExpensesPage } from "./pages/fleet/ExpensesPage";
import { FleetDashboardPage } from "./pages/fleet/FleetDashboardPage";
import { FleetLayout } from "./pages/fleet/FleetLayout";
import { FleetReportsPage } from "./pages/fleet/FleetReportsPage";
import { VehicleDetailPage, VehiclesPage } from "./pages/fleet/VehiclesPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HomePage } from "./pages/HomePage";
import { AccountPage } from "./pages/identity/AccountPage";
import { AuditLogPage } from "./pages/identity/AuditLogPage";
import { RolesPage } from "./pages/identity/RolesPage";
import { UsersPage } from "./pages/identity/UsersPage";
import { LoginPage } from "./pages/LoginPage";
import { ModulePage } from "./pages/ModulePage";
import { BoardPage } from "./pages/operations/BoardPage";
import { OperationsLayout } from "./pages/operations/OperationsLayout";
import { ProfitPage } from "./pages/operations/ProfitPage";
import { ShipmentDetailPage } from "./pages/operations/ShipmentDetailPage";
import { ShipmentsPage } from "./pages/operations/ShipmentsPage";
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
          <Route
            path="/crm"
            element={
              <RequirePermission permission="CRM_VIEW">
                <CrmLayout />
              </RequirePermission>
            }
          >
            <Route index element={<CrmDashboardPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="quotes/:id" element={<QuoteDetailPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="tariffs" element={<TariffsPage />} />
            <Route path="tariffs/:id" element={<TariffDetailPage />} />
            <Route path="pricing" element={<PriceCalculatorPage />} />
          </Route>
          <Route
            path="/fleet"
            element={
              <RequirePermission permission="FLEET_VIEW">
                <FleetLayout />
              </RequirePermission>
            }
          >
            <Route index element={<FleetDashboardPage />} />
            <Route path="vehicles" element={<VehiclesPage />} />
            <Route path="vehicles/:id" element={<VehicleDetailPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="drivers/:id" element={<DriverDetailPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="availability" element={<AvailabilityPage />} />
            <Route path="reports" element={<FleetReportsPage />} />
          </Route>
          <Route
            path="/operations"
            element={
              <RequirePermission permission="SHIPMENT_VIEW">
                <OperationsLayout />
              </RequirePermission>
            }
          >
            <Route index element={<ShipmentsPage />} />
            <Route path="shipments/:id" element={<ShipmentDetailPage />} />
            <Route path="board" element={<BoardPage />} />
            <Route path="profit" element={<ProfitPage />} />
          </Route>
          {MODULE_ITEMS.filter(
            (item) =>
              item.permission && !["/finance", "/crm", "/fleet", "/operations"].includes(item.path),
          ).map((item) => (
            <Route
              key={item.path}
              path={item.path}
              element={
                <RequirePermission permission={item.permission!}>
                  <ModulePage label={item.label} />
                </RequirePermission>
              }
            />
          ))}
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

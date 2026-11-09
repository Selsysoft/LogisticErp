import { Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./auth/authStore";
import { LandingRedirect, RequireAuth, RequirePermission } from "./auth/guards";
import { AppShell, MODULE_ITEMS } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { lazyPage, PageLoading } from "./components/lazyPage";
import { CustomsLayout } from "./pages/customs/CustomsLayout";
import { CrmLayout } from "./pages/crm/CrmLayout";
import { FinanceLayout } from "./pages/finance/FinanceLayout";
import { FleetLayout } from "./pages/fleet/FleetLayout";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { IntegrationsLayout } from "./pages/integrations/IntegrationsLayout";
import { LoginPage } from "./pages/LoginPage";
import { ModulePage } from "./pages/ModulePage";
import { OperationsLayout } from "./pages/operations/OperationsLayout";
import { ReportsLayout } from "./pages/reports/ReportsLayout";
import { SetPasswordPage } from "./pages/SetPasswordPage";
import { WarehouseLayout } from "./pages/warehouse/WarehouseLayout";

const ContractsPage = lazyPage(() => import("./pages/crm/ContractsPage"), "ContractsPage");
const TrackingPage = lazyPage(() => import("./pages/TrackingPage"), "TrackingPage");
const CrossingsPage = lazyPage(() => import("./pages/customs/CrossingsPage"), "CrossingsPage");
const DeclarationDetailPage = lazyPage(
  () => import("./pages/customs/DeclarationsPage"),
  "DeclarationDetailPage",
);
const DeclarationsPage = lazyPage(
  () => import("./pages/customs/DeclarationsPage"),
  "DeclarationsPage",
);
const PermitsPage = lazyPage(() => import("./pages/customs/PermitsPage"), "PermitsPage");
const TransitsPage = lazyPage(() => import("./pages/customs/TransitsPage"), "TransitsPage");
const CrmDashboardPage = lazyPage(() => import("./pages/crm/CrmDashboardPage"), "CrmDashboardPage");
const CustomerDetailPage = lazyPage(
  () => import("./pages/crm/CustomersPage"),
  "CustomerDetailPage",
);
const CustomersPage = lazyPage(() => import("./pages/crm/CustomersPage"), "CustomersPage");
const OpportunitiesPage = lazyPage(
  () => import("./pages/crm/OpportunitiesPage"),
  "OpportunitiesPage",
);
const PriceCalculatorPage = lazyPage(
  () => import("./pages/crm/PriceCalculatorPage"),
  "PriceCalculatorPage",
);
const QuoteDetailPage = lazyPage(() => import("./pages/crm/QuotesPage"), "QuoteDetailPage");
const QuotesPage = lazyPage(() => import("./pages/crm/QuotesPage"), "QuotesPage");
const TariffDetailPage = lazyPage(() => import("./pages/crm/TariffsPage"), "TariffDetailPage");
const TariffsPage = lazyPage(() => import("./pages/crm/TariffsPage"), "TariffsPage");
const AccountDetailPage = lazyPage(
  () => import("./pages/finance/AccountsPage"),
  "AccountDetailPage",
);
const AccountsPage = lazyPage(() => import("./pages/finance/AccountsPage"), "AccountsPage");
const DefinitionsPage = lazyPage(
  () => import("./pages/finance/DefinitionsPage"),
  "DefinitionsPage",
);
const FinanceDashboardPage = lazyPage(
  () => import("./pages/finance/FinanceDashboardPage"),
  "FinanceDashboardPage",
);
const FundDetailPage = lazyPage(() => import("./pages/finance/FundsPage"), "FundDetailPage");
const FundsPage = lazyPage(() => import("./pages/finance/FundsPage"), "FundsPage");
const InstrumentsPage = lazyPage(
  () => import("./pages/finance/InstrumentsPage"),
  "InstrumentsPage",
);
const InvoicesPage = lazyPage(() => import("./pages/finance/InvoicesPage"), "InvoicesPage");
const PlansPage = lazyPage(() => import("./pages/finance/PlansPage"), "PlansPage");
const ReportsPage = lazyPage(() => import("./pages/finance/ReportsPage"), "ReportsPage");
const SettlementsPage = lazyPage(
  () => import("./pages/finance/SettlementsPage"),
  "SettlementsPage",
);
const AvailabilityPage = lazyPage(
  () => import("./pages/fleet/AvailabilityPage"),
  "AvailabilityPage",
);
const DriverDetailPage = lazyPage(() => import("./pages/fleet/DriversPage"), "DriverDetailPage");
const DriversPage = lazyPage(() => import("./pages/fleet/DriversPage"), "DriversPage");
const ExpensesPage = lazyPage(() => import("./pages/fleet/ExpensesPage"), "ExpensesPage");
const FleetDashboardPage = lazyPage(
  () => import("./pages/fleet/FleetDashboardPage"),
  "FleetDashboardPage",
);
const FleetReportsPage = lazyPage(
  () => import("./pages/fleet/FleetReportsPage"),
  "FleetReportsPage",
);
const VehicleDetailPage = lazyPage(() => import("./pages/fleet/VehiclesPage"), "VehicleDetailPage");
const VehiclesPage = lazyPage(() => import("./pages/fleet/VehiclesPage"), "VehiclesPage");
const DriverExpensesPage = lazyPage(() => import("./pages/driver/DriverApp"), "DriverExpensesPage");
const DriverLayout = lazyPage(() => import("./pages/driver/DriverApp"), "DriverLayout");
const DriverTripsPage = lazyPage(() => import("./pages/driver/DriverApp"), "DriverTripsPage");
const DriverTripPage = lazyPage(() => import("./pages/driver/DriverTripPage"), "DriverTripPage");
const HomePage = lazyPage(() => import("./pages/HomePage"), "HomePage");
const AccountPage = lazyPage(() => import("./pages/identity/AccountPage"), "AccountPage");
const AuditLogPage = lazyPage(() => import("./pages/identity/AuditLogPage"), "AuditLogPage");
const RolesPage = lazyPage(() => import("./pages/identity/RolesPage"), "RolesPage");
const UsersPage = lazyPage(() => import("./pages/identity/UsersPage"), "UsersPage");
const BankPage = lazyPage(() => import("./pages/integrations/BankPage"), "BankPage");
const DistancesPage = lazyPage(() => import("./pages/integrations/DistancesPage"), "DistancesPage");
const EDocumentsPage = lazyPage(
  () => import("./pages/integrations/EDocumentsPage"),
  "EDocumentsPage",
);
const GpsPage = lazyPage(() => import("./pages/integrations/GpsPage"), "GpsPage");
const ImportDetailPage = lazyPage(
  () => import("./pages/integrations/ImportsPage"),
  "ImportDetailPage",
);
const ImportsPage = lazyPage(() => import("./pages/integrations/ImportsPage"), "ImportsPage");
const BoardPage = lazyPage(() => import("./pages/operations/BoardPage"), "BoardPage");
const DriverExpenseReviewPage = lazyPage(
  () => import("./pages/operations/DriverExpenseReviewPage"),
  "DriverExpenseReviewPage",
);
const ProfitPage = lazyPage(() => import("./pages/operations/ProfitPage"), "ProfitPage");
const ShipmentDetailPage = lazyPage(
  () => import("./pages/operations/ShipmentDetailPage"),
  "ShipmentDetailPage",
);
const ShipmentsPage = lazyPage(() => import("./pages/operations/ShipmentsPage"), "ShipmentsPage");
const FinanceReportPage = lazyPage(
  () => import("./pages/reports/FinanceReportPage"),
  "FinanceReportPage",
);
const FleetReportPage = lazyPage(
  () => import("./pages/reports/FleetReportPage"),
  "FleetReportPage",
);
const OperationsReportPage = lazyPage(
  () => import("./pages/reports/OperationsReportPage"),
  "OperationsReportPage",
);
const ProfitabilityReportPage = lazyPage(
  () => import("./pages/reports/ProfitabilityReportPage"),
  "ProfitabilityReportPage",
);
const AuditConsolePage = lazyPage(
  () => import("./pages/saas/HealthConsolePage"),
  "AuditConsolePage",
);
const HealthConsolePage = lazyPage(
  () => import("./pages/saas/HealthConsolePage"),
  "HealthConsolePage",
);
const InvoicesConsolePage = lazyPage(
  () => import("./pages/saas/InvoicesConsolePage"),
  "InvoicesConsolePage",
);
const PlansConsolePage = lazyPage(
  () => import("./pages/saas/PlansConsolePage"),
  "PlansConsolePage",
);
const SaasLayout = lazyPage(() => import("./pages/saas/SaasConsole"), "SaasLayout");
const SaasLoginPage = lazyPage(() => import("./pages/saas/SaasConsole"), "SaasLoginPage");
const SubscriptionPage = lazyPage(
  () => import("./pages/saas/SubscriptionPage"),
  "SubscriptionPage",
);
const TenantsConsolePage = lazyPage(
  () => import("./pages/saas/TenantsConsolePage"),
  "TenantsConsolePage",
);
const BillingPage = lazyPage(() => import("./pages/warehouse/BillingPage"), "BillingPage");
const ContractDetailPage = lazyPage(
  () => import("./pages/warehouse/BillingPage"),
  "ContractDetailPage",
);
const CountDetailPage = lazyPage(() => import("./pages/warehouse/CountsPage"), "CountDetailPage");
const CountsPage = lazyPage(() => import("./pages/warehouse/CountsPage"), "CountsPage");
const WarehouseDefinitionsPage = lazyPage(
  () => import("./pages/warehouse/DefinitionsPage"),
  "DefinitionsPage",
);
const MovementsPage = lazyPage(() => import("./pages/warehouse/MovementsPage"), "MovementsPage");
const StockPage = lazyPage(() => import("./pages/warehouse/StockPage"), "StockPage");

export function App() {
  const { t } = useTranslation();
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/saas/login" element={<SaasLoginPage />} />
        <Route path="/track/:tenant/:token" element={<TrackingPage />} />
        <Route path="/saas" element={<SaasLayout />}>
          <Route index element={<TenantsConsolePage />} />
          <Route path="plans" element={<PlansConsolePage />} />
          <Route path="invoices" element={<InvoicesConsolePage />} />
          <Route path="health" element={<HealthConsolePage />} />
          <Route path="audit" element={<AuditConsolePage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route
            path="/driver"
            element={
              <RequirePermission permission="DRIVER_APP">
                <DriverLayout />
              </RequirePermission>
            }
          >
            <Route index element={<DriverTripsPage />} />
            <Route path="trips/:id" element={<DriverTripPage />} />
            <Route path="expenses" element={<DriverExpensesPage />} />
          </Route>
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
              {/* Detay adresinin sonu silinince liste açılsın. */}
              <Route path="shipments" element={<Navigate to="/operations" replace />} />
              <Route path="shipments/:id" element={<ShipmentDetailPage />} />
              <Route path="board" element={<BoardPage />} />
              <Route path="profit" element={<ProfitPage />} />
              <Route path="driver-expenses" element={<DriverExpenseReviewPage />} />
            </Route>
            <Route
              path="/warehouse"
              element={
                <RequirePermission permission="WAREHOUSE_VIEW">
                  <WarehouseLayout />
                </RequirePermission>
              }
            >
              <Route index element={<StockPage />} />
              <Route path="movements" element={<MovementsPage />} />
              <Route path="counts" element={<CountsPage />} />
              <Route path="counts/:id" element={<CountDetailPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="billing/:id" element={<ContractDetailPage />} />
              <Route path="definitions" element={<WarehouseDefinitionsPage />} />
            </Route>
            <Route
              path="/customs"
              element={
                <RequirePermission permission="CUSTOMS_VIEW">
                  <CustomsLayout />
                </RequirePermission>
              }
            >
              <Route index element={<DeclarationsPage />} />
              <Route path="declarations/:id" element={<DeclarationDetailPage />} />
              <Route path="transits" element={<TransitsPage />} />
              <Route path="permits" element={<PermitsPage />} />
              <Route path="crossings" element={<CrossingsPage />} />
            </Route>
            <Route
              path="/integrations"
              element={
                <RequirePermission permission="INTEGRATION_VIEW">
                  <IntegrationsLayout />
                </RequirePermission>
              }
            >
              <Route index element={<EDocumentsPage />} />
              <Route path="imports" element={<ImportsPage />} />
              <Route path="imports/:id" element={<ImportDetailPage />} />
              <Route path="bank" element={<BankPage />} />
              <Route path="gps" element={<GpsPage />} />
              <Route path="distances" element={<DistancesPage />} />
            </Route>
            <Route
              path="/reports"
              element={
                <RequirePermission permission="REPORT_VIEW">
                  <ReportsLayout />
                </RequirePermission>
              }
            >
              <Route index element={<ProfitabilityReportPage />} />
              <Route path="operations" element={<OperationsReportPage />} />
              <Route path="finance" element={<FinanceReportPage />} />
              <Route path="fleet" element={<FleetReportPage />} />
            </Route>
            {MODULE_ITEMS.filter(
              (item) =>
                item.permission &&
                ![
                  "/finance",
                  "/crm",
                  "/fleet",
                  "/operations",
                  "/warehouse",
                  "/customs",
                  "/integrations",
                  "/reports",
                  "/driver",
                ].includes(item.path),
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
            <Route
              path="/subscription"
              element={
                <RequirePermission permission="SUBSCRIPTION_VIEW">
                  <SubscriptionPage />
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
    </Suspense>
  );
}

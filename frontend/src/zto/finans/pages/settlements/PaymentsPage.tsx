import { SettlementListPage } from "./SettlementListPage";

/**
 * Ödemeler (ZTO Views/CustomerAccountPayment/Payments.cshtml + wwwroot/js/zt/payments/payments.js
 * liste bölümü; 12.2a_TASARIM §5.5). Ortak iskelet `SettlementListPage` (kök `zto-page-payments`).
 */
export function PaymentsPage() {
  return <SettlementListPage type="PAYMENT" />;
}

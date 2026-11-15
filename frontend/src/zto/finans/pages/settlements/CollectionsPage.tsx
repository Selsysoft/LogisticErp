import { SettlementListPage } from "./SettlementListPage";

/**
 * Tahsilatlar (ZTO Views/CustomerAccountCollection/Collections.cshtml + wwwroot/js/zt/collections/
 * collections.js liste bölümü; 12.2a_TASARIM §5.6). Ortak iskelet `SettlementListPage` (kök
 * `zto-page-collections`; Hesap Grubu süzgeci, "Kur:" satırı, Döviz Bozum sütunu).
 */
export function CollectionsPage() {
  return <SettlementListPage type="COLLECTION" />;
}

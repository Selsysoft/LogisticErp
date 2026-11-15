import type { Account } from "../../pages/finance/types";
import {
  ZTO_FINANS_BASE,
  accountBankAccountsPath,
  accountEditPath,
  accountTransactionsPath,
  paymentsPath,
  statementPath,
} from "./navItems";

/*
 * Hızlı Cari İşlemi kart ızgarası (ZTO _ProductionLayout.cshtml qcaBuildCards / qcaGroupAction,
 * :3962-3986; 12.1 §5.12). Sıra ZTO: Cari Hareketler · Ekstre Al · Banka Hesapları · [müşteri değilse]
 * Ödeme Ekle · gruba özel kart · Düzenle. ZTO'nun tarım kartları (hammadde, malzeme/ilaç faturası, çavuş
 * gideri …) Blackrose'ta yok; gruba özel kart §5.7 eşlemesiyle MUI ekranına gider. Yetki gerektiren
 * kartlar yetkisiz kullanıcıda çizilmez.
 */

export type QuickCariCardKey =
  | "transactions"
  | "statement"
  | "bankAccounts"
  | "addPayment"
  | "tripCosts"
  | "driverCard"
  | "edit";

export type QuickCariCard = {
  key: QuickCariCardKey;
  href: string;
  /** Font Awesome 5 adı ("fas" olmadan). */
  icon: string;
  /** `.qca-card-ic` arka planı (ZTO satır içi renk). */
  color: string;
  /** ZTO `blank`: yeni sekmede açılır. */
  newTab: boolean;
};

export type QuickCariPermissions = {
  /** FINANCE_MANAGE: Düzenle. */
  manage: boolean;
  /** FINANCE_PAYMENT_CREATE: Ödeme Ekle. */
  payment: boolean;
  /** FLEET_VIEW: Sürücü Kartı. */
  fleet: boolean;
  /** SHIPMENT_VIEW: Sefer Maliyetleri. */
  shipments: boolean;
};

/** MUI ekranları (ödeme/tahsilat 12.2a'dan beri ZTO Ödemeler ekranında; `paymentsPath`). */
export const QUICK_CARI_MUI_PATHS = {
  shipments: "/operations",
  drivers: "/fleet/drivers",
} as const;

/** Gruba özel kart (12.1 §5.7 eşlemesi); yoksa null. */
export function groupCard(
  subGroup: string,
  can: Pick<QuickCariPermissions, "fleet" | "shipments">,
): QuickCariCard | null {
  switch (subGroup) {
    case "TASERON_NAKLIYECI":
      return can.shipments
        ? {
            key: "tripCosts",
            href: QUICK_CARI_MUI_PATHS.shipments,
            icon: "fa-shipping-fast",
            color: "#4c1d95",
            newTab: true,
          }
        : null;
    case "SEVK_NAKLIYECI":
      return can.shipments
        ? {
            key: "tripCosts",
            href: QUICK_CARI_MUI_PATHS.shipments,
            icon: "fa-truck-moving",
            color: "#581c87",
            newTab: true,
          }
        : null;
    case "SURUCU":
      return can.fleet
        ? {
            key: "driverCard",
            href: QUICK_CARI_MUI_PATHS.drivers,
            icon: "fa-id-badge",
            color: "#7f1d1d",
            newTab: true,
          }
        : null;
    default:
      return null;
  }
}

export function quickCariCards(
  account: Pick<Account, "id" | "type" | "subGroup">,
  can: QuickCariPermissions,
): QuickCariCard[] {
  const cards: QuickCariCard[] = [
    {
      key: "transactions",
      href: accountTransactionsPath(account.id),
      icon: "fa-list",
      color: "#0d6efd",
      newTab: false,
    },
    {
      key: "statement",
      href: statementPath(account.id),
      icon: "fa-file-alt",
      color: "#6c757d",
      newTab: true,
    },
    {
      key: "bankAccounts",
      href: accountBankAccountsPath(account.id),
      icon: "fa-university",
      color: "#0dcaf0",
      newTab: false,
    },
  ];
  if (account.type !== "CUSTOMER" && can.payment) {
    // ZTO qcaBuildCards:3969 `/CustomerAccountPayment/Payments/{id}?openModal=true` (12.2a §5.13).
    cards.push({
      key: "addPayment",
      href: paymentsPath({ id: account.id, openModal: true }),
      icon: "fa-money-bill-wave",
      color: "#198754",
      newTab: true,
    });
  }
  const special = groupCard(account.subGroup, can);
  if (special) cards.push(special);
  if (can.manage) {
    cards.push({
      key: "edit",
      href: accountEditPath(account.id),
      icon: "fa-edit",
      color: "#fd7e14",
      newTab: true,
    });
  }
  return cards;
}

/** Uygulama içi yol mu (aynı sekmede SPA gezinmesi). */
export function isZtoPath(href: string): boolean {
  return href.startsWith(`${ZTO_FINANS_BASE}/`);
}

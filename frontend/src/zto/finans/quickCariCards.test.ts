import { describe, expect, it } from "vitest";
import { groupCard, isZtoPath, quickCariCards } from "./quickCariCards";

const ALL = { manage: true, payment: true, fleet: true, shipments: true };
const VIEW_ONLY = { manage: false, payment: false, fleet: false, shipments: false };

describe("Hızlı Cari kartları (ZTO qcaBuildCards)", () => {
  it("tedarikçi: ZTO sırası, renkler, yeni sekme", () => {
    const cards = quickCariCards({ id: "a1", type: "SUPPLIER", subGroup: "GENEL" }, ALL);
    expect(cards.map((c) => c.key)).toEqual([
      "transactions",
      "statement",
      "bankAccounts",
      "addPayment",
      "edit",
    ]);
    expect(cards[0]).toEqual({
      key: "transactions",
      href: "/zto-finans/cari-kartlar/a1/hareketler",
      icon: "fa-list",
      color: "#0d6efd",
      newTab: false,
    });
    expect(cards[1]).toMatchObject({
      href: "/zto-finans-yazdir/cari-ekstre/a1",
      icon: "fa-file-alt",
      color: "#6c757d",
      newTab: true,
    });
    expect(cards[2]).toMatchObject({
      href: "/zto-finans/cari-kartlar/a1/banka-hesaplari",
      icon: "fa-university",
      color: "#0dcaf0",
      newTab: false,
    });
    expect(cards[3]).toMatchObject({
      href: "/finance/settlements",
      color: "#198754",
      newTab: true,
    });
    expect(cards[4]).toMatchObject({
      href: "/zto-finans/cari-kartlar/a1/duzenle",
      icon: "fa-edit",
      color: "#fd7e14",
      newTab: true,
    });
  });

  it("müşteride Ödeme Ekle yok (ZTO g !== 'Müşteri')", () => {
    const keys = quickCariCards({ id: "m", type: "CUSTOMER", subGroup: "MUSTERI" }, ALL).map(
      (c) => c.key,
    );
    expect(keys).not.toContain("addPayment");
  });

  it("yalnız FINANCE_VIEW: yetki gerektiren kartlar gizli", () => {
    const keys = quickCariCards(
      { id: "a", type: "CARRIER", subGroup: "TASERON_NAKLIYECI" },
      VIEW_ONLY,
    ).map((c) => c.key);
    expect(keys).toEqual(["transactions", "statement", "bankAccounts"]);
  });

  it("gruba özel kart §5.7 eşlemesi; tarım kartları yok", () => {
    expect(groupCard("TASERON_NAKLIYECI", ALL)).toMatchObject({
      key: "tripCosts",
      href: "/operations",
      icon: "fa-shipping-fast",
    });
    expect(groupCard("SEVK_NAKLIYECI", ALL)).toMatchObject({
      key: "tripCosts",
      icon: "fa-truck-moving",
    });
    expect(groupCard("SURUCU", ALL)).toMatchObject({ key: "driverCard", href: "/fleet/drivers" });
    expect(groupCard("SURUCU", { fleet: false, shipments: true })).toBeNull();
    expect(groupCard("YEDEK_PARCA_SERVIS", ALL)).toBeNull();
    const carrier = quickCariCards({ id: "n", type: "CARRIER", subGroup: "SEVK_NAKLIYECI" }, ALL);
    expect(carrier.map((c) => c.key)).toEqual([
      "transactions",
      "statement",
      "bankAccounts",
      "addPayment",
      "tripCosts",
      "edit",
    ]);
  });

  it("uygulama içi yol", () => {
    expect(isZtoPath("/zto-finans/cari-kartlar/a/hareketler")).toBe(true);
    expect(isZtoPath("/finance/settlements")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  branchLabel,
  branchOptions,
  companyOfBranch,
  defaultBranchValue,
  fundsOfCompany,
} from "./branchOptions";
import type { Branch } from "./types";

const branch = (id: string, name: string, companyId: string, active = true): Branch => ({
  id,
  code: id,
  name,
  companyId,
  companyName: companyId === "c1" ? "Acme" : "Beta",
  branchGroupId: null,
  branchGroupName: null,
  phone: null,
  address: null,
  city: null,
  district: null,
  latitude: null,
  longitude: null,
  active,
  createdBy: "x",
  createdAt: "2026-11-13T00:00:00Z",
  updatedBy: "x",
  updatedAt: "2026-11-13T00:00:00Z",
  updateCount: 0,
});

const BRANCHES = [
  branch("a", "Bornova", "c1"),
  branch("b", "Kemalpaşa", "c1", false),
  branch("d", "Sincan", "c2"),
];

describe("branchOptions", () => {
  it("pasifleri atar; tek şirkette etiket yalnız ad", () => {
    expect(branchOptions(BRANCHES, { multiCompany: false })).toEqual([
      { value: "a", label: "Bornova" },
      { value: "d", label: "Sincan" },
    ]);
  });

  it("düzenlenen kaydın pasif ya da başka şirketteki iş yerini korur", () => {
    expect(
      branchOptions(BRANCHES, { keepId: "b", multiCompany: false }).map((o) => o.value),
    ).toEqual(["a", "b", "d"]);
    expect(
      branchOptions(BRANCHES, { keepId: "d", companyId: "c1", multiCompany: false }).map(
        (o) => o.value,
      ),
    ).toEqual(["a", "d"]);
  });

  it("aktif şirkete süzer; konsolidede (null) tüm şirketler", () => {
    expect(branchOptions(BRANCHES, { companyId: "c2", multiCompany: true })).toEqual([
      { value: "d", label: "Beta › Sincan" },
    ]);
    expect(branchOptions(BRANCHES, { companyId: null, multiCompany: true })).toEqual([
      { value: "a", label: "Acme › Bornova" },
      { value: "d", label: "Beta › Sincan" },
    ]);
  });

  it("eski yanıtta active alanı yoksa iş yeri aktif sayılır; şirket adı yoksa yalnız ad", () => {
    const legacy = { id: "x", code: "X", name: "Eski" } as Branch;
    expect(branchOptions([legacy], { multiCompany: true })).toEqual([
      { value: "x", label: "Eski" },
    ]);
    expect(branchLabel(legacy, true)).toBe("Eski");
  });
});

describe("yardımcılar", () => {
  it("companyOfBranch seçili iş yerinin şirketini bulur", () => {
    expect(companyOfBranch(BRANCHES, "d")).toBe("c2");
    expect(companyOfBranch(BRANCHES, "yok")).toBeUndefined();
    expect(companyOfBranch(BRANCHES, "")).toBeUndefined();
    expect(companyOfBranch(undefined, "a")).toBeUndefined();
  });

  it("varsayılan iş yeri yalnız seçeneklerde varsa önerilir", () => {
    const options = branchOptions(BRANCHES, { multiCompany: false });
    expect(defaultBranchValue(options, "a")).toBe("a");
    expect(defaultBranchValue(options, "b")).toBe("");
    expect(defaultBranchValue(options, null)).toBe("");
    expect(defaultBranchValue(options, undefined)).toBe("");
  });
});

describe("fundsOfCompany", () => {
  const funds = [
    { id: "f1", companyId: "c1" },
    { id: "f2", companyId: "c2" },
    { id: "f3", companyId: null },
  ];

  it("iş yerinin şirketine süzer; şirket bilinmiyorsa hepsi", () => {
    expect(fundsOfCompany(funds, "c1").map((fund) => fund.id)).toEqual(["f1", "f3"]);
    expect(fundsOfCompany(funds, undefined)).toHaveLength(3);
    expect(fundsOfCompany(undefined, "c1")).toEqual([]);
  });
});

describe("12.1 §5.13: filo, entegrasyon ve sefer seçenekleri şirkete göre", () => {
  // FleetOptions.funds, IntegrationOptions.bankAccounts, ShipmentOptions.acceptedQuoteLines biçimleri.
  const fleetFunds = [
    { id: "kasaA", label: "Kasa A", kind: "CASH", currency: "TRY", companyId: "c1" },
    { id: "bankaB", label: "Banka B", kind: "BANK", currency: "TRY", companyId: "c2" },
  ];
  const bankAccounts = [
    { id: "ba1", label: "Acme Ziraat", companyId: "c1" },
    { id: "ba2", label: "Beta Garanti", companyId: "c2" },
  ];
  const quoteLines = [
    { id: "q1", label: "TK-1 / 1", accountId: "m1", companyId: "c2" },
    { id: "q2", label: "TK-2 / 1", accountId: "m1", companyId: "c1" },
  ];

  it("sürücü avansı ve araç gideri: seçili iş yerinin şirketinin fonları", () => {
    expect(fundsOfCompany(fleetFunds, companyOfBranch(BRANCHES, "a")).map((f) => f.id)).toEqual([
      "kasaA",
    ]);
    expect(fundsOfCompany(fleetFunds, companyOfBranch(BRANCHES, "d")).map((f) => f.id)).toEqual([
      "bankaB",
    ]);
    // İş yeri seçilmeden tüm fonlar.
    expect(fundsOfCompany(fleetFunds, companyOfBranch(BRANCHES, ""))).toHaveLength(2);
  });

  it("banka ekstresi: aktif şirketin hesapları; konsolidede (null) tümü", () => {
    expect(fundsOfCompany(bankAccounts, "c2").map((a) => a.id)).toEqual(["ba2"]);
    expect(fundsOfCompany(bankAccounts, null)).toHaveLength(2);
  });

  it("yeni sefer: teklif satırı seçili iş yerinin şirketinden", () => {
    expect(fundsOfCompany(quoteLines, companyOfBranch(BRANCHES, "a")).map((q) => q.id)).toEqual([
      "q2",
    ]);
  });

  it("eski yanıtta şirket alanı yoksa öğe her şirkette görünür", () => {
    const legacy: { id: string; label: string; companyId?: string | null }[] = [
      { id: "eski", label: "Eski" },
    ];
    expect(fundsOfCompany(legacy, "c1")).toEqual(legacy);
  });
});

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

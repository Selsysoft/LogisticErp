// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeCompany } from "../pages/organization/types";
import type { Me } from "./authStore";
import {
  activeCompanies,
  companyParam,
  CONSOLIDATED,
  formDefaultCompanyId,
  implicitCompanyId,
  isMultiCompany,
  resolveActive,
  storageKey,
  useCompanyStore,
} from "./companyStore";

const company = (id: string, extra: Partial<MeCompany> = {}): MeCompany => ({
  id,
  code: id.toUpperCase(),
  shortName: `Şirket ${id}`,
  title: `Şirket ${id} A.Ş.`,
  defaultCompany: false,
  active: true,
  ...extra,
});

const A = company("a", { defaultCompany: true });
const B = company("b");
const C = company("c", { active: false });

const me = (companies: MeCompany[] | undefined, id = "u1"): Me => ({
  id,
  email: "x@y.z",
  fullName: "X",
  tenant: "acme",
  permissions: [],
  roles: [],
  landingPath: "/",
  twoFactorEnabled: false,
  companies,
});

beforeEach(() => {
  localStorage.clear();
  useCompanyStore.getState().clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saf yardımcılar", () => {
  it("storageKey kiracı ve kullanıcıya özgüdür", () => {
    expect(storageKey("acme", "u1")).toBe("blackrose.activeCompany.acme.u1");
  });

  it("activeCompanies ve isMultiCompany pasif şirketi saymaz", () => {
    expect(activeCompanies([A, B, C]).map((c) => c.id)).toEqual(["a", "b"]);
    expect(activeCompanies(undefined)).toEqual([]);
    expect(isMultiCompany([A, B])).toBe(true);
    expect(isMultiCompany([A, C])).toBe(false);
    expect(isMultiCompany(undefined)).toBe(false);
  });

  it("resolveActive: tek şirket → null; listede olmayan → null; geçerli → id", () => {
    expect(resolveActive("a", [A])).toBeNull();
    expect(resolveActive("a", [A, C])).toBeNull();
    expect(resolveActive("zz", [A, B])).toBeNull();
    expect(resolveActive("c", [A, B, C])).toBeNull();
    expect(resolveActive(null, [A, B])).toBe(CONSOLIDATED);
    expect(resolveActive("b", [A, B])).toBe("b");
    expect(resolveActive("b", undefined)).toBeNull();
  });

  it("formDefaultCompanyId: seçim yoksa varsayılan şirket, o görünmüyorsa görünen tek aktif şirket", () => {
    expect(formDefaultCompanyId("b", [A, B])).toBe("b");
    expect(formDefaultCompanyId(null, [A, B])).toBe("a");
    // LIMITED: me.companies yalnız görünen şirketler; varsayılan A görünmüyor.
    expect(formDefaultCompanyId(null, [B])).toBe("b");
    expect(formDefaultCompanyId(null, [B, C])).toBe("b");
    expect(formDefaultCompanyId(null, [B, company("d")])).toBeUndefined();
    expect(formDefaultCompanyId(null)).toBeUndefined();
  });

  it("implicitCompanyId: yalnız görünen tek aktif şirket varsayılan değilse onun id'si", () => {
    // Yalnız B şirketine sınırlı LIMITED kullanıcı: şirket alanı yok ama gövdeye B gider (FE-2).
    expect(implicitCompanyId([B])).toBe("b");
    expect(implicitCompanyId([B, C])).toBe("b");
    // Gerçek tek şirketli kiracı ya da varsayılanı gören kullanıcı: gövdeye companyId konmaz.
    expect(implicitCompanyId([A])).toBeUndefined();
    expect(implicitCompanyId([A, C])).toBeUndefined();
    // Çok şirkette şirket alanı çizilir; örtük seçim yok.
    expect(implicitCompanyId([A, B])).toBeUndefined();
    expect(implicitCompanyId([])).toBeUndefined();
    expect(implicitCompanyId(undefined)).toBeUndefined();
  });

  it("companyParam konsolidede boş", () => {
    expect(companyParam("b")).toBe("companyId=b");
    expect(companyParam(null)).toBe("");
  });
});

describe("useCompanyStore", () => {
  it("hydrate saklanan seçimi okur, geçersizse konsolide", () => {
    localStorage.setItem(storageKey("acme", "u1"), "b");
    useCompanyStore.getState().hydrate(me([A, B]));
    expect(useCompanyStore.getState().activeCompanyId).toBe("b");

    localStorage.setItem(storageKey("acme", "u1"), "zz");
    useCompanyStore.getState().hydrate(me([A, B]));
    expect(useCompanyStore.getState().activeCompanyId).toBeNull();

    // Eski önbellekteki Me'de companies yok: tek şirket gibi davranılır.
    localStorage.setItem(storageKey("acme", "u1"), "b");
    useCompanyStore.getState().hydrate(me(undefined));
    expect(useCompanyStore.getState().activeCompanyId).toBeNull();

    useCompanyStore.getState().hydrate(null);
    expect(useCompanyStore.getState().activeCompanyId).toBeNull();
  });

  it("setActive kullanıcının anahtarına yazar; null anahtarı siler", () => {
    useCompanyStore.getState().hydrate(me([A, B]));
    useCompanyStore.getState().setActive("a");
    expect(useCompanyStore.getState().activeCompanyId).toBe("a");
    expect(localStorage.getItem(storageKey("acme", "u1"))).toBe("a");

    useCompanyStore.getState().setActive(CONSOLIDATED);
    expect(useCompanyStore.getState().activeCompanyId).toBeNull();
    expect(localStorage.getItem(storageKey("acme", "u1"))).toBeNull();

    // Başka kullanıcının seçimi ayrı saklanır.
    useCompanyStore.getState().hydrate(me([A, B], "u2"));
    expect(useCompanyStore.getState().activeCompanyId).toBeNull();
  });

  it("clear belleği temizler, saklanan tercihi korur; oturumsuz setActive saklamaz", () => {
    useCompanyStore.getState().hydrate(me([A, B]));
    useCompanyStore.getState().setActive("b");
    useCompanyStore.getState().clear();
    expect(useCompanyStore.getState().activeCompanyId).toBeNull();
    expect(localStorage.getItem(storageKey("acme", "u1"))).toBe("b");

    useCompanyStore.getState().setActive("a");
    expect(useCompanyStore.getState().activeCompanyId).toBe("a");
    expect(localStorage.getItem(storageKey("acme", "u1"))).toBe("b");
  });

  it("localStorage hatası yutulur", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => useCompanyStore.getState().hydrate(me([A, B]))).not.toThrow();
    expect(useCompanyStore.getState().activeCompanyId).toBeNull();
    expect(() => useCompanyStore.getState().setActive("b")).not.toThrow();
    expect(useCompanyStore.getState().activeCompanyId).toBe("b");
    expect(() => useCompanyStore.getState().setActive(null)).not.toThrow();
  });
});

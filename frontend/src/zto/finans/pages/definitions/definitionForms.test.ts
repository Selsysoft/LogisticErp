import { describe, expect, it } from "vitest";
import type { Branch, BranchGroup, Company } from "../../../../pages/organization/types";
import {
  branchGroupDetailFields,
  companyDetailFields,
  companyTab,
  DEFINITION_PATHS,
  groupTypeText,
  statusText,
  workPlaceDetailFields,
} from "./definitionDetails";
import {
  branchGroupBody,
  branchGroupValues,
  companyBody,
  companyValues,
  eDocumentBody,
  eDocumentValues,
  EMPTY_COMPANY,
  emptyBranchGroup,
  emptyWorkPlace,
  validateBranchGroup,
  validateCompany,
  validateEDocument,
  validateSeries,
  validateWorkPlace,
  workPlaceBody,
  workPlaceFromBranch,
} from "./definitionForms";

const audit = {
  createdBy: "a@x",
  createdAt: "2026-01-02T10:00:00Z",
  updatedBy: "a@x",
  updatedAt: "2026-01-02T10:00:00Z",
  updateCount: 0,
};

const BRANCH: Branch = {
  id: "b1",
  code: "IY-0001",
  name: "Merkez",
  companyId: "c1",
  companyName: "Acme",
  branchGroupId: "g1",
  branchGroupName: "İzmir",
  phone: "02321112233",
  address: "Alsancak",
  city: "İzmir",
  district: "Konak",
  latitude: 38.4,
  longitude: 27.14,
  sgkWorkplaceNo: "123",
  active: true,
  ...audit,
};

const GROUP: BranchGroup = {
  id: "g1",
  companyId: "c1",
  companyName: "Acme",
  name: "İzmir",
  groupType: "SUB",
  phone: null,
  email: "izmir@x.com",
  address: null,
  managerName: "Ali",
  taxNumber: null,
  taxOffice: null,
  active: false,
  branchCount: 2,
  ...audit,
};

const COMPANY: Company = {
  id: "c1",
  code: "ACME",
  title: "Acme Lojistik A.Ş.",
  shortName: "Acme",
  taxIdType: "VKN",
  taxNumber: "1234567890",
  taxOffice: "Konak",
  mersisNo: null,
  tradeRegistryNo: null,
  sgkWorkplaceNo: null,
  address: "Alsancak",
  city: null,
  district: null,
  postalCode: null,
  country: "TR",
  phone: null,
  email: null,
  kepAddress: null,
  website: null,
  logoFileId: null,
  defaultFundAccountId: "f1",
  defaultCompany: true,
  active: true,
  edocumentEnabled: false,
  edocumentTestMode: true,
  branchCount: 1,
  ...audit,
};

const t = (key: string) => `«${key}»`;

describe("İş yeri formu", () => {
  it("boş form ve kayıttan değerler", () => {
    expect(emptyWorkPlace("c1").companyId).toBe("c1");
    expect(emptyWorkPlace(undefined).companyId).toBe("");
    expect(workPlaceFromBranch(BRANCH)).toEqual({
      name: "Merkez",
      phone: "02321112233",
      companyId: "c1",
      branchGroupId: "g1",
      address: "Alsancak",
      location: "38.4,27.14",
    });
    expect(
      workPlaceFromBranch({ ...BRANCH, phone: null, branchGroupId: null, latitude: null }),
    ).toMatchObject({ phone: "", branchGroupId: "", location: "" });
  });

  it("ZTO birebir zorunlular; ≥2 şirkette şirket; konum biçimi", () => {
    expect(validateWorkPlace(emptyWorkPlace(undefined), false)).toEqual({
      name: "definitions.required",
      phone: "definitions.required",
      branchGroupId: "definitions.required",
      address: "definitions.required",
    });
    expect(validateWorkPlace(emptyWorkPlace(undefined), true).companyId).toBe(
      "definitions.required",
    );
    const valid = workPlaceFromBranch(BRANCH);
    expect(validateWorkPlace(valid, true)).toEqual({});
    expect(validateWorkPlace({ ...valid, location: "41" }, false)).toEqual({
      location: "workPlaces.locationInvalid",
    });
    expect(validateWorkPlace({ ...valid, phone: "123456789012" }, false)).toEqual({
      phone: "workPlaces.phoneInvalid",
    });
    expect(validateWorkPlace({ ...valid, name: "x".repeat(51) }, false).name).toBeDefined();
  });

  it("POST gövdesi: tek şirkette companyId yok, çok şirkette var", () => {
    const values = { ...workPlaceFromBranch(BRANCH), location: "" };
    expect(workPlaceBody(values, { multiCompany: false })).toEqual({
      name: "Merkez",
      phone: "02321112233",
      branchGroupId: "g1",
      address: "Alsancak",
      latitude: null,
      longitude: null,
    });
    expect(workPlaceBody({ ...values, location: "41,29" }, { multiCompany: true })).toMatchObject({
      companyId: "c1",
      latitude: 41,
      longitude: 29,
    });
    expect(
      workPlaceBody({ ...values, companyId: "" }, { multiCompany: true }).companyId,
    ).toBeNull();
    // LIMITED kullanıcı yalnız varsayılan olmayan B'yi görüyor: alan yok, gövdeye B gider (FE-2).
    expect(
      workPlaceBody(
        { ...values, branchGroupId: "" },
        { multiCompany: false, implicitCompanyId: "c2" },
      ),
    ).toMatchObject({ companyId: "c2", branchGroupId: null });
  });

  it("PUT gövdesi: şirket alanı gizliyken de companyId/branchGroupId; formda olmayanlar korunur", () => {
    const values = { ...workPlaceFromBranch(BRANCH), companyId: "" };
    expect(workPlaceBody(values, { multiCompany: false, existing: BRANCH })).toEqual({
      code: "IY-0001",
      name: "Merkez",
      phone: "02321112233",
      companyId: "c1",
      branchGroupId: "g1",
      address: "Alsancak",
      latitude: 38.4,
      longitude: 27.14,
      city: "İzmir",
      district: "Konak",
      sgkWorkplaceNo: "123",
    });
  });
});

describe("Şube (grup) formu", () => {
  it("değerler, doğrulama ve gövde", () => {
    expect(emptyBranchGroup("c2")).toMatchObject({ companyId: "c2", active: true, groupType: "" });
    expect(emptyBranchGroup(undefined).companyId).toBe("");
    const values = branchGroupValues(GROUP);
    expect(values).toMatchObject({ groupType: "SUB", email: "izmir@x.com", active: false });
    expect(branchGroupValues({ ...GROUP, groupType: null }).groupType).toBe("");
    expect(validateBranchGroup(emptyBranchGroup(undefined), true)).toEqual({
      companyId: "definitions.required",
      name: "definitions.required",
    });
    expect(validateBranchGroup({ ...values, email: "x" }, false)).toEqual({
      email: "branchGroups.emailInvalid",
    });
    expect(validateBranchGroup(values, false)).toEqual({});

    expect(branchGroupBody(values, { multiCompany: false, existing: GROUP })).toEqual({
      companyId: "c1",
      name: "İzmir",
      groupType: "SUB",
      phone: null,
      email: "izmir@x.com",
      address: null,
      managerName: "Ali",
      taxNumber: null,
      taxOffice: null,
      active: false,
    });
    const fresh = { ...emptyBranchGroup("c1"), name: " Ege " };
    expect(branchGroupBody(fresh, { multiCompany: false })).toMatchObject({
      companyId: null,
      name: "Ege",
      groupType: null,
      managerName: null,
      active: true,
    });
    expect(branchGroupBody(fresh, { multiCompany: true }).companyId).toBe("c1");
    // LIMITED, yalnız varsayılan olmayan şirket görünür: gövdeye o şirket gider (FE-2).
    expect(branchGroupBody(fresh, { multiCompany: false, implicitCompanyId: "c2" }).companyId).toBe(
      "c2",
    );
    expect(
      branchGroupBody({ ...fresh, companyId: "" }, { multiCompany: true }).companyId,
    ).toBeNull();
  });
});

describe("Şirket formu", () => {
  it("değerler, doğrulama", () => {
    expect(companyValues(COMPANY)).toMatchObject({
      code: "ACME",
      taxNumber: "1234567890",
      mersisNo: "",
      defaultFundAccountId: "f1",
    });
    expect(validateCompany(EMPTY_COMPANY)).toEqual({
      code: "definitions.required",
      title: "definitions.required",
      shortName: "definitions.required",
    });
    const values = companyValues(COMPANY);
    expect(validateCompany(values)).toEqual({});
    expect(validateCompany({ ...values, taxNumber: "1234567891" })).toEqual({
      taxNumber: "companies.taxInvalid",
    });
    expect(validateCompany({ ...values, taxIdType: "TCKN" })).toEqual({
      taxNumber: "companies.taxInvalid",
    });
    expect(
      validateCompany({ ...values, code: "a b", mersisNo: "12", email: "x", kepAddress: "y" }),
    ).toEqual({
      code: "companies.codeInvalid",
      mersisNo: "companies.mersisInvalid",
      email: "companies.emailInvalid",
      kepAddress: "companies.emailInvalid",
    });
  });

  it("gövde: eklemede defaultFundAccountId yok", () => {
    const values = companyValues(COMPANY);
    expect(companyBody(values, false)).not.toHaveProperty("defaultFundAccountId");
    expect(companyBody(values, false)).toMatchObject({
      code: "ACME",
      mersisNo: null,
      defaultCompany: true,
      active: true,
    });
    expect(companyBody(values, true).defaultFundAccountId).toBe("f1");
    expect(
      companyBody({ ...values, defaultFundAccountId: "" }, true).defaultFundAccountId,
    ).toBeNull();
  });
});

describe("e-Belge ve seri", () => {
  const settings = {
    companyId: "c1",
    provider: "MOCK",
    enabled: true,
    testMode: false,
    serviceUrl: null,
    username: "u",
    passwordSet: true,
    defaultProfile: "TEMELFATURA" as const,
    invoiceSeries: "ZTO",
    despatchSeries: null,
    despatchEnabled: false,
    inboxEnabled: true,
    inboxLastSync: null,
    senderTaxNumber: "1234567890",
    senderTitle: "Acme",
  };

  it("şifre boşsa null (değişmez); adres doğrulaması", () => {
    const values = eDocumentValues(settings);
    expect(values).toMatchObject({ password: "", serviceUrl: "", despatchSeries: "" });
    expect(eDocumentBody(values)).toEqual({
      enabled: true,
      testMode: false,
      serviceUrl: null,
      username: "u",
      password: null,
      defaultProfile: "TEMELFATURA",
      invoiceSeries: "ZTO",
      despatchSeries: null,
      despatchEnabled: false,
      inboxEnabled: true,
    });
    expect(eDocumentBody({ ...values, password: "s" }).password).toBe("s");
    expect(validateEDocument(values)).toBeNull();
    expect(validateEDocument({ ...values, serviceUrl: "https://x" })).toBeNull();
    expect(validateEDocument({ ...values, serviceUrl: "ftp://x" })).toBe("companies.uyUrlInvalid");
  });

  it("seri: önek deseni, sıradaki numara yalnız ileri", () => {
    expect(validateSeries("NF", "150", 150)).toEqual({});
    expect(validateSeries("NF", "151", 150)).toEqual({});
    expect(validateSeries("NF", "149", 150)).toEqual({ nextValue: "companies.seriesForwardOnly" });
    expect(validateSeries("", "", 1)).toEqual({
      prefix: "definitions.required",
      nextValue: "definitions.required",
    });
    expect(validateSeries("nf", "0", 0)).toEqual({
      prefix: "companies.seriesPrefixInvalid",
      nextValue: "companies.seriesForwardOnly",
    });
    expect(validateSeries("NF", "1.5", 1).nextValue).toBe("companies.seriesForwardOnly");
  });
});

describe("Detay alanları ve gösterimler", () => {
  it("şube tipi ZTO ham değeriyle; durum", () => {
    expect(groupTypeText("MAIN", t)).toBe("«branchGroups.typeMain»");
    expect(groupTypeText("SUB", t)).toBe("«branchGroups.typeSubValue»");
    expect(groupTypeText(null, t)).toBe("");
    expect(statusText(true, t)).toBe("«definitions.active»");
    expect(statusText(false, t)).toBe("«definitions.passive»");
  });

  it("İş Yeri alanları (≥2 şirkette Şirket)", () => {
    expect(workPlaceDetailFields(BRANCH, false, t).map((f) => f.label)).toEqual([
      "«definitions.fieldName»",
      "«definitions.fieldPhone»",
      "«definitions.fieldAddress»",
      "«definitions.status»",
      "«definitions.fieldGroup»",
      "«definitions.fieldLocation»",
    ]);
    const multi = workPlaceDetailFields({ ...BRANCH, branchGroupName: null }, true, t);
    expect(multi.map((f) => f.value)).toEqual([
      "Merkez",
      "02321112233",
      "Alsancak",
      "«definitions.active»",
      "«definitions.unspecified»",
      "Acme",
      "38.4,27.14",
    ]);
  });

  it("Şube ve Şirket alanları", () => {
    expect(branchGroupDetailFields(GROUP, false, t).map((f) => f.value)).toEqual([
      "İzmir",
      "«branchGroups.typeSubValue»",
      null,
      "izmir@x.com",
      "«definitions.passive»",
    ]);
    expect(branchGroupDetailFields(GROUP, true, t)).toHaveLength(6);
    expect(companyDetailFields(COMPANY, t).map((f) => f.label)).toEqual([
      "«companies.companyTitle»",
      "«companies.shortName»",
      "«companies.taxNumber»",
      "«companies.taxOffice»",
      "«definitions.fieldPhone»",
      "«definitions.fieldEmail»",
      "«definitions.fieldAddress»",
      "«definitions.status»",
    ]);
  });

  it("yollar ve şirket sekmesi", () => {
    expect(DEFINITION_PATHS.workPlaces).toBe("/zto-finans/tanimlar/is-yerleri");
    expect(companyTab("e-belge", true)).toBe("e-belge");
    expect(companyTab("seriler", true)).toBe("seriler");
    expect(companyTab("x", true)).toBe("genel");
    expect(companyTab(null, true)).toBe("genel");
    expect(companyTab("seriler", false)).toBe("genel");
  });
});

describe("boş (null) alanlar", () => {
  it("formlara boş metin olarak gelir, gövdeye null olarak gider", () => {
    const branch = { ...BRANCH, address: null };
    expect(workPlaceFromBranch(branch).address).toBe("");
    const values = { ...workPlaceFromBranch(branch), branchGroupId: "", companyId: "" };
    expect(workPlaceBody(values, { multiCompany: false, existing: branch })).toMatchObject({
      branchGroupId: null,
      address: null,
      companyId: "c1",
    });
    expect(branchGroupValues({ ...GROUP, email: null }).email).toBe("");
    const company = companyValues({
      ...COMPANY,
      taxNumber: null,
      taxOffice: null,
      address: null,
      defaultFundAccountId: null,
    });
    expect(company).toMatchObject({
      taxNumber: "",
      taxOffice: "",
      address: "",
      defaultFundAccountId: "",
    });
    expect(
      eDocumentValues({
        companyId: "c1",
        provider: "MOCK",
        enabled: false,
        testMode: true,
        serviceUrl: null,
        username: null,
        passwordSet: false,
        defaultProfile: "TICARIFATURA",
        invoiceSeries: null,
        despatchSeries: null,
        despatchEnabled: false,
        inboxEnabled: false,
        inboxLastSync: null,
        senderTaxNumber: null,
        senderTitle: "",
      }),
    ).toMatchObject({ username: "", invoiceSeries: "" });
  });
});

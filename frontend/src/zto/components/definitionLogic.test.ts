import { describe, expect, it } from "vitest";
import {
  actorText,
  auditPopoverPlacement,
  blankToNull,
  companyCodeInput,
  dateTimeLocalValue,
  digitsOnly,
  eDocumentSeriesInput,
  entityAccent,
  ENTITY_ICONS,
  errorCode,
  errorMessage,
  fieldIcon,
  flashFromState,
  formatLocation,
  isAcceptableLogo,
  isValidTaxNumber,
  isValidTckn,
  isValidVkn,
  lastActor,
  LOGO_MAX_BYTES,
  mapsUrl,
  parseLocation,
  queryString,
  seriesPrefixInput,
  seriesSample,
} from "./definitionLogic";

describe("digitsOnly", () => {
  it("rakam dışını atar, en çok max hane", () => {
    expect(digitsOnly("0 (532) 111-22-33", 11)).toBe("05321112233");
    expect(digitsOnly("123456789012", 11)).toBe("12345678901");
    expect(digitsOnly("12,5", 11)).toBe("125");
    expect(digitsOnly("abc", 11)).toBe("");
    expect(digitsOnly("123", 0)).toBe("");
    expect(digitsOnly("123", -1)).toBe("");
  });
});

describe("parseLocation", () => {
  it("geçerli enlem,boylam (virgülden sonra boşluk olabilir)", () => {
    expect(parseLocation("41.015137,28.979530")).toEqual({
      latitude: 41.015137,
      longitude: 28.97953,
    });
    expect(parseLocation(" 38.4 , 27.14 ")).toEqual({ latitude: 38.4, longitude: 27.14 });
    expect(parseLocation("-33,-70")).toEqual({ latitude: -33, longitude: -70 });
    expect(parseLocation("90,180")).toEqual({ latitude: 90, longitude: 180 });
  });

  it("boş → null", () => {
    expect(parseLocation("")).toBeNull();
    expect(parseLocation("   ")).toBeNull();
  });

  it("biçim ya da aralık dışı → invalid", () => {
    expect(parseLocation("41.015137")).toBe("invalid");
    expect(parseLocation("41,015;28,97")).toBe("invalid");
    expect(parseLocation("41.0151371,28.9")).toBe("invalid");
    expect(parseLocation("91,28")).toBe("invalid");
    expect(parseLocation("41,181")).toBe("invalid");
    expect(parseLocation("a,b")).toBe("invalid");
    expect(parseLocation("1,2,3")).toBe("invalid");
    expect(parseLocation("41.,28")).toBe("invalid");
  });
});

describe("konum gösterimi", () => {
  it("formatLocation ve mapsUrl", () => {
    expect(formatLocation(41.01, 28.97)).toBe("41.01,28.97");
    expect(formatLocation(0, 0)).toBe("0,0");
    expect(formatLocation(null, 28)).toBe("");
    expect(formatLocation(41, undefined)).toBe("");
    expect(mapsUrl(41.01, 28.97)).toBe(
      "https://www.google.com/maps/search/?api=1&query=41.01,28.97",
    );
  });
});

describe("VKN / TCKN", () => {
  it("VKN kontrol hanesi (1234567890 geçerli; IntegrationIT örneği)", () => {
    expect(isValidVkn("1234567890")).toBe(true);
    expect(isValidVkn("1234567891")).toBe(false);
    expect(isValidVkn("0000000001")).toBe(true);
    expect(isValidVkn("0000000000")).toBe(false);
    expect(isValidVkn("123456789")).toBe(false);
    expect(isValidVkn("12345678901")).toBe(false);
    expect(isValidVkn("12345abc90")).toBe(false);
  });

  it("VKN: t=9 olan hane (v=0 → 9 kuralı)", () => {
    // d[0]=0 → t=(0+9)%10=9, v=9*2^9 %9=0 → 9.
    const body = "012345678";
    const valid = Array.from({ length: 10 }, (_, k) => `${body}${k}`).filter(isValidVkn);
    expect(valid).toHaveLength(1);
  });

  it("TCKN algoritması", () => {
    expect(isValidTckn("10000000146")).toBe(true);
    expect(isValidTckn("10000000147")).toBe(false);
    expect(isValidTckn("10000000156")).toBe(false);
    expect(isValidTckn("00000000146")).toBe(false);
    expect(isValidTckn("1000000014")).toBe(false);
  });

  it("isValidTaxNumber: türe göre, uzunluk–tür uyuşmazlığı geçersiz, boş geçerli", () => {
    expect(isValidTaxNumber("VKN", "")).toBe(true);
    expect(isValidTaxNumber("VKN", "1234567890")).toBe(true);
    expect(isValidTaxNumber("TCKN", "1234567890")).toBe(false);
    expect(isValidTaxNumber("TCKN", "10000000146")).toBe(true);
    expect(isValidTaxNumber("VKN", "10000000146")).toBe(false);
  });
});

describe("seri ve giriş biçimleri", () => {
  it("seriesSample backend biçimiyle", () => {
    expect(seriesSample("NF", 2026, 123, 6)).toBe("NF-2026-000123");
    expect(seriesSample("ACME-DF", 2027, 1234567, 6)).toBe("ACME-DF-2027-1234567");
  });

  it("kod/önek/seri girişleri büyük harf ve izinli karakter", () => {
    expect(companyCodeInput("acme_1-x ç!")).toBe("ACME_1-X");
    expect(companyCodeInput("a".repeat(30))).toHaveLength(20);
    expect(seriesPrefixInput("nf-a_b")).toBe("NF-AB");
    expect(seriesPrefixInput("abcdefghijkl")).toBe("ABCDEFGHIJ");
    expect(eDocumentSeriesInput("zt-o9")).toBe("ZTO");
  });

  it("blankToNull ve queryString", () => {
    expect(blankToNull("  x ")).toBe("x");
    expect(blankToNull("   ")).toBeNull();
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
    expect(queryString({ a: 1, b: "", c: null, d: undefined, e: true, f: "ş c" })).toBe(
      "?a=1&e=true&f=%C5%9F%20c",
    );
    expect(queryString({})).toBe("");
  });

  it("dateTimeLocalValue yerel saatle", () => {
    expect(dateTimeLocalValue(new Date(2026, 10, 3, 9, 5, 7))).toBe("2026-11-03T09:05:07");
  });

  it("isAcceptableLogo", () => {
    expect(isAcceptableLogo({ type: "image/png", size: LOGO_MAX_BYTES })).toBe(true);
    expect(isAcceptableLogo({ type: "image/jpeg", size: 10 })).toBe(true);
    expect(isAcceptableLogo({ type: "image/png", size: LOGO_MAX_BYTES + 1 })).toBe(false);
    expect(isAcceptableLogo({ type: "image/svg+xml", size: 10 })).toBe(false);
  });
});

describe("bildirim ve hata", () => {
  it("flashFromState", () => {
    expect(flashFromState({ flash: "İş yeri oluşturuldu." })).toBe("İş yeri oluşturuldu.");
    expect(flashFromState({ flash: "  " })).toBeNull();
    expect(flashFromState({ flash: 1 })).toBeNull();
    expect(flashFromState(null)).toBeNull();
    expect(flashFromState("x")).toBeNull();
    expect(flashFromState(undefined)).toBeNull();
  });

  it("errorMessage ve errorCode", () => {
    const apiError = Object.assign(new Error("Önce iş yerlerini taşıyın."), {
      body: { code: "BRANCH_GROUP_HAS_ACTIVE_BRANCHES" },
    });
    expect(errorMessage(apiError, "genel")).toBe("Önce iş yerlerini taşıyın.");
    expect(errorMessage(new Error(" "), "genel")).toBe("genel");
    expect(errorMessage("x", "genel")).toBe("genel");
    expect(errorCode(apiError)).toBe("BRANCH_GROUP_HAS_ACTIVE_BRANCHES");
    expect(errorCode(new Error("x"))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });
});

describe("Detay modalı yardımcıları", () => {
  it("fieldIcon _Details.cshtml:15-35 sırasıyla", () => {
    expect(fieldIcon("Adı")).toBe("fa-tag");
    expect(fieldIcon("Telefon")).toBe("fa-phone-alt");
    expect(fieldIcon("Adres")).toBe("fa-map-marker-alt");
    expect(fieldIcon("Durum")).toBe("fa-check-circle");
    expect(fieldIcon("Şirket")).toBe("fa-building");
    expect(fieldIcon("Kod")).toBe("fa-barcode");
    expect(fieldIcon("Oluşturma Tarihi")).toBe("fa-calendar-alt");
    expect(fieldIcon("VKN/TCKN")).toBe("fa-id-card");
    expect(fieldIcon("Kısa Ad")).toBe("fa-tag");
    // ZTO birebir: "E-posta" Mail/Email içermez → varsayılan simge.
    expect(fieldIcon("E-posta")).toBe("fa-info-circle");
    expect(fieldIcon("Email")).toBe("fa-envelope");
    expect(fieldIcon("Cari Adı")).toBe("fa-building");
    expect(fieldIcon("Cari Kodu")).toBe("fa-barcode");
    expect(fieldIcon("Cari Grubu")).toBe("fa-layer-group");
    expect(fieldIcon("Vergi No")).toBe("fa-id-card");
    expect(fieldIcon("Firma")).toBe("fa-building");
    expect(fieldIcon("Kapasite")).toBe("fa-weight-hanging");
    expect(fieldIcon("Sertifika")).toBe("fa-certificate");
    expect(fieldIcon("Bakiye")).toBe("fa-coins");
    expect(fieldIcon("Yetkili")).toBe("fa-user");
    expect(fieldIcon("Şube Türü")).toBe("fa-info-circle");
    expect(fieldIcon(null)).toBe("fa-info-circle");
  });

  it("varlık simgesi ve vurgu", () => {
    expect(ENTITY_ICONS).toEqual({
      workplace: "fa-building",
      branch: "fa-city",
      company: "fa-landmark",
    });
    expect(entityAccent("workplace")).toBe("blue");
    expect(entityAccent("branch")).toBe("blue");
    expect(entityAccent("company")).toBe("indigo");
  });

  it("lastActor ve actorText", () => {
    const audit = {
      createdBy: "a@x",
      createdAt: "2026-01-01T10:00:00Z",
      updatedBy: "b@x",
      updatedAt: "2026-02-01T10:00:00Z",
      updateCount: 0,
    };
    expect(lastActor(audit)).toEqual({ by: "a@x", at: audit.createdAt });
    expect(lastActor({ ...audit, updateCount: 2 })).toEqual({ by: "b@x", at: audit.updatedAt });
    expect(actorText(" a@x ", "Sistem")).toBe("a@x");
    expect(actorText("", "Sistem")).toBe("Sistem");
    expect(actorText(null, "Sistem")).toBe("Sistem");
    expect(actorText("SİSTEM AKTARIMI", "Sistem")).toBe("Sistem");
  });

  it("auditPopoverPlacement: altta, sığmazsa üstte, kenarlara kısılır", () => {
    const viewport = { width: 1000, height: 800 };
    expect(auditPopoverPlacement({ left: 100, top: 100, bottom: 120 }, 150, viewport)).toEqual({
      left: 100,
      top: 128,
      width: 286,
      above: false,
    });
    expect(auditPopoverPlacement({ left: 900, top: 700, bottom: 720 }, 150, viewport)).toEqual({
      left: 704,
      top: 542,
      width: 286,
      above: true,
    });
    // Üstte de yer yoksa altta kalır.
    expect(auditPopoverPlacement({ left: 0, top: 50, bottom: 70 }, 900, viewport)).toMatchObject({
      left: 10,
      top: 78,
      above: false,
    });
    expect(
      auditPopoverPlacement({ left: 0, top: 0, bottom: 0 }, 0, { width: 200, height: 100 }),
    ).toMatchObject({ width: 180 });
  });
});

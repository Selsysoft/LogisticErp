import { describe, expect, it } from "vitest";
import {
  announcementText,
  createAnnouncementTracker,
  errorIdOf,
  fieldA11yProps,
  fieldStateOf,
  showsError,
  valueAtPath,
} from "./fieldA11y";

describe("fieldA11yProps", () => {
  it("dokunulmamış alan: aria-invalid=false, aria-describedby yok, data-error hep var", () => {
    expect(fieldA11yProps("accountName", { error: "Zorunlu" })).toEqual({
      id: "accountName",
      "aria-invalid": false,
      "aria-describedby": undefined,
      "data-error": "accountName-error",
    });
    expect(fieldA11yProps("x")).toMatchObject({ "aria-invalid": false });
  });

  it("dokunulmuş + hata → true ve errorId", () => {
    expect(fieldA11yProps("accountName", { touched: true, error: "Zorunlu" })).toMatchObject({
      "aria-invalid": true,
      "aria-describedby": "accountName-error",
    });
    // Dokunulmuş ama geçerli.
    expect(fieldA11yProps("accountName", { touched: true, error: null })).toMatchObject({
      "aria-invalid": false,
      "aria-describedby": undefined,
    });
  });

  it("gönderim sonrası dokunulmamış alan da işaretlenir; özel id ve errorId", () => {
    expect(
      fieldA11yProps("iban", { submitted: true, error: "Geçersiz", id: "iban0", errorId: "e1" }),
    ).toEqual({ id: "iban0", "aria-invalid": true, "aria-describedby": "e1", "data-error": "e1" });
    expect(errorIdOf("a")).toBe("a-error");
    expect(showsError({ submitted: true, error: "" })).toBe(false);
  });
});

describe("fieldStateOf (RHF formState)", () => {
  it("iç içe alan adlarını okur", () => {
    const formState = {
      touchedFields: { bankAccounts: [{ iban: true }] },
      isSubmitted: false,
      errors: { bankAccounts: [{ iban: { message: "IBAN hatalı" } }], name: { message: "" } },
    };
    expect(fieldStateOf(formState, "bankAccounts.0.iban")).toEqual({
      touched: true,
      submitted: false,
      error: "IBAN hatalı",
    });
    expect(fieldStateOf(formState, "name", { id: "n" })).toEqual({
      touched: false,
      submitted: false,
      error: null,
      id: "n",
    });
    expect(fieldStateOf({}, "x")).toEqual({ touched: false, submitted: false, error: null });
    expect(valueAtPath({ a: 1 }, "a.b")).toBeUndefined();
    expect(valueAtPath(null, "a")).toBeUndefined();
  });
});

describe("duyuru", () => {
  it("metin '{etiket}: {hata}', etiket sonundaki * ve : atılır", () => {
    expect(announcementText("Cari Adı *", "Zorunlu alan")).toBe("Cari Adı: Zorunlu alan");
    expect(announcementText("  Vergi\n No: ", "Hatalı")).toBe("Vergi No: Hatalı");
    expect(announcementText(null, "Hatalı")).toBe("Hatalı");
  });

  it("aynı hata iki kez okunmaz; düzeltilince unutulur", () => {
    const tracker = createAnnouncementTracker();
    expect(tracker.next("a", "Zorunlu")).toBe(true);
    expect(tracker.next("a", "Zorunlu")).toBe(false);
    expect(tracker.next("a", "Başka")).toBe(true);
    expect(tracker.next("a", null)).toBe(false);
    expect(tracker.next("a", "Başka")).toBe(true);
    expect(tracker.next("b", "")).toBe(false);
    tracker.reset();
    expect(tracker.next("a", "Başka")).toBe(true);
  });
});

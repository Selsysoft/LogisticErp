// @vitest-environment node
/// <reference types="node" />
/**
 * Dil kaynakları testi: ad alanlarına bölünmüş Türkçe metinlerin yapısını, ztoFinans metinlerinin
 * doluluğunu ve interpolasyon değişkenlerini, ayrıca kaynak koddaki literal t("...") anahtarlarının
 * gerçekten var olduğunu denetler.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import tr from "./tr";

type Tree = { readonly [key: string]: string | Tree };

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NAMESPACES: Record<string, Tree> = { translation: tr.translation, ztoFinans: tr.ztoFinans };

/** Ağacı "a.b.c" → değer çiftlerine düzler. */
function flatten(tree: Tree, prefix = ""): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[prefix + key, value] as [string, string]]
      : flatten(value, `${prefix}${key}.`),
  );
}

/** Anahtar yaprak bir metne (ya da i18next çoğul eklerine) çözülüyor mu? */
function hasKey(tree: Tree, key: string): boolean {
  const parts = key.split(".");
  const last = parts.pop() as string;
  let node: string | Tree | undefined = tree;
  for (const part of parts) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  if (typeof node !== "object") return false;
  if (typeof node[last] === "string") return true;
  return typeof node[`${last}_one`] === "string" || typeof node[`${last}_other`] === "string";
}

function variables(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^},\s]+)\s*(?:,[^}]*)?\}\}/g)].map((m) => m[1]).sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "locales" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** 12.1 ekranlarının ztoFinans parçaları (§5.14). */
const TWELVE_ONE_PARTS = ["accounts", "transactions", "allTransactions", "quickCari"] as const;

const translationLeaves = flatten(tr.translation);
const ztoLeaves = flatten(tr.ztoFinans);

describe("translation ad alanı (eski i18n.ts'ten bölünen)", () => {
  it("üst düzey modüller eski sırayla ve eksiksiz", () => {
    expect(Object.keys(tr.translation)).toEqual([
      "appName",
      "common",
      "nav",
      "home",
      "module",
      "login",
      "tracking",
      "forgot",
      "setPassword",
      "users",
      "roles",
      "permissions",
      "audit",
      "account",
      "finance",
      "crm",
      "operations",
      "driver",
      "subscription",
      "saas",
      "reports",
      "integrations",
      "customs",
      "warehouse",
      "fleet",
      "forbidden",
      "notFound",
      "error",
    ]);
    // Bölünme anında 1274 + nav.ztoFinance; anahtar silinirse sayı düşer.
    expect(translationLeaves.length).toBeGreaterThanOrEqual(1275);
  });

  it("örnek anahtarlar i18next üzerinden eski değerleri verir", () => {
    expect(i18n.t("appName")).toBe("Blackrose Nakliye");
    expect(i18n.t("common.save")).toBe("Kaydet");
    expect(i18n.t("common.loading")).toBe("Yükleniyor…");
    expect(i18n.t("nav.finance")).toBe("Finans");
    expect(i18n.t("nav.ztoFinance")).toBe("ZTO Finans");
    expect(i18n.t("fleet.docType.KASKO")).toBe("Kasko");
    expect(i18n.t("notFound.title")).toBe("Sayfa bulunamadı");
    expect(i18n.t("error.traceId", { traceId: "abc" })).toBe("Hata kodu: abc");
  });

  it("tüm değerler boş olmayan metin", () => {
    expect(translationLeaves.filter(([, v]) => v.trim() === "").map(([k]) => k)).toEqual([]);
  });

  it("12.1 anahtarları: izin, kaynak, tür, ödeme yöntemi, banka hesabı, erişilebilirlik", () => {
    expect(i18n.t("permissions.FINANCE_EMPLOYEE_VIEW")).toBe("Personel carilerini görme");
    for (const source of [
      "FREIGHT_INVOICE",
      "TRIP_COST",
      "WAREHOUSE_INVOICE",
      "ACCOUNT_DOCUMENT",
      "ACCOUNT_TRANSFER_OUT",
      "ACCOUNT_TRANSFER_IN",
      "VEHICLE_EXPENSE",
      "INSTRUMENT_ENDORSEE_BOUNCE",
    ]) {
      expect(hasKey(tr.translation, `finance.source.${source}`), source).toBe(true);
    }
    expect(
      ["DEBT", "PAYMENT", "RECEIVABLE", "COLLECTION"].map((k) => i18n.t(`finance.kind.${k}`)),
    ).toEqual(["Borç", "Ödeme", "Alacak", "Tahsilat"]);
    expect(i18n.t("finance.paymentMethod.BANK")).toBe("Banka Havalesi/Eft");
    expect(i18n.t("finance.bankAccountKind.DEMAND")).toBe("Vadesiz");
    expect(i18n.t("finance.bankAccountCategory.SUB")).toBe("Yan Hesap");
    expect(i18n.t("finance.companyType.INDIVIDUAL")).toBe("Bireysel");
    expect(i18n.t("common.a11y.notifications")).toBe("Bildirimler");
    expect(i18n.t("common.a11y.removeFilter", { filter: "İş Yeri" })).toBe(
      "İş Yeri süzgecini kaldır",
    );
    expect(i18n.t("common.a11y.ibanLast4", { last4: "1234" })).toBe("IBAN, son dört hane 1234");
    expect(i18n.t("common.a11y.limitChart", { days: 30, credit: "10.000", risk: "5.000" })).toBe(
      "Son 30 gün bakiye grafiği; kredi limiti 10.000, risk limiti 5.000",
    );
    expect(i18n.t("common.a11y.statementCaption", { branch: "Merkez", currency: "TRY" })).toBe(
      "Merkez — TRY ekstresi",
    );
  });
});

describe("ztoFinans ad alanı", () => {
  it("parçalar ve i18next kaydı", () => {
    expect(Object.keys(tr.ztoFinans)).toEqual([
      "common",
      "nav",
      "table",
      "select",
      "modal",
      "branch",
      "export",
      "pages",
      "definitions",
      "workPlaces",
      "branchGroups",
      "companies",
      "accounts",
      "transactions",
      "allTransactions",
      "quickCari",
    ]);
    expect(i18n.options.ns).toEqual(["translation", "ztoFinans"]);
    // 12.1 parçaları (FE0 iskelet, sahipleri doldurur): kayıtlı ve boş değil.
    for (const part of TWELVE_ONE_PARTS) {
      expect(Object.keys(tr.ztoFinans[part]).length, part).toBeGreaterThan(0);
    }
    expect(i18n.t("table.search", { ns: "ztoFinans" })).toBe("Ara:");
    expect(i18n.t("ztoFinans:nav.allTransactions")).toBe("Günlük Cari İşlemleri");
  });

  it("boş değer yok", () => {
    expect(ztoLeaves.length).toBeGreaterThan(0);
    expect(ztoLeaves.filter(([, v]) => v.trim() === "" || v !== v.trim()).map(([k]) => k)).toEqual(
      [],
    );
  });

  it("DataTables/select2 yer tutucusu (_TOTAL_, %d) kalmadı", () => {
    expect(ztoLeaves.filter(([, v]) => /_[A-Z]+_|%[ds]/.test(v)).map(([k]) => k)).toEqual([]);
  });

  it("interpolasyon değişkenleri bileşenlerin verdiği adlarla aynı", () => {
    const expected: Record<string, string[]> = {
      "table.info": ["end", "start", "total"],
      "table.infoFiltered": ["max"],
      "table.buttons.copySuccess": ["count"],
      "select.inputTooLong": ["count"],
      "select.inputTooShort": ["count"],
      "select.maximumSelected": ["count"],
      "branch.branchCount": ["checked", "total"],
      "branch.selectedCount": ["count"],
      "export.copySuccess": ["count"],
      "export.generatedAt": ["date"],
      "export.pageOf": ["page", "pages"],
      "export.rowCount": ["count"],
      "nav.phase": ["step"],
      "nav.notReady": ["step"],
      "pages.placeholder.body": ["step"],
      "definitions.updateCountValue": ["count"],
      "definitions.errorPrefix": ["message"],
      "companies.uyLastSync": ["value"],
    };
    // 12.1 parçalarının yer tutucuları sahiplerinin testlerinde; burada genel denge testi yeterli.
    const actual = Object.fromEntries(
      ztoLeaves
        .filter(([k]) => !TWELVE_ONE_PARTS.some((part) => k.startsWith(`${part}.`)))
        .filter(([, v]) => variables(v).length > 0)
        .map(([k, v]) => [k, variables(v)]),
    );
    expect(actual).toEqual(expected);
    expect(i18n.t("table.info", { ns: "ztoFinans", total: "1.250", start: 1, end: 10 })).toBe(
      "1.250 kayıttan 1 - 10 arasındaki kayıtlar gösteriliyor",
    );
    expect(i18n.t("ztoFinans:export.copySuccess", { count: 3 })).toBe("3 satır panoya kopyalandı");
    expect(i18n.t("ztoFinans:definitions.updateCountValue", { count: 2 })).toBe(
      "Güncelleme Sayısı: 2",
    );
    expect(i18n.t("ztoFinans:definitions.errorPrefix", { message: "x" })).toBe("Hata: x");
  });

  it("çift süslü parantezler her iki ad alanında da dengeli", () => {
    const broken = [...translationLeaves, ...ztoLeaves].filter(
      ([, v]) =>
        (v.match(/\{\{/g) ?? []).length !== (v.match(/\}\}/g) ?? []).length ||
        (v.match(/\{\{/g) ?? []).length !== variables(v).length,
    );
    expect(broken.map(([k]) => k)).toEqual([]);
  });
});

describe("kaynak koddaki literal anahtarlar", () => {
  const files = sourceFiles(SRC);
  const translationTop = new Set(Object.keys(tr.translation));

  /** Dosyanın useTranslation ile bildirdiği ad alanları; bildirimsiz → translation. */
  function namespacesOf(code: string): string[] {
    const found = new Set<string>();
    for (const m of code.matchAll(/useTranslation\(\s*(?:(["'])([^"']+)\1|\[([^\]]*)\])?/g)) {
      if (m[2]) found.add(m[2]);
      else if (m[3]) for (const n of m[3].matchAll(/["']([^"']+)["']/g)) found.add(n[1]);
      else found.add("translation");
    }
    return found.size > 0 ? [...found] : ["translation"];
  }

  /** "ns:a.b" ya da { ns: "x" } seçeneğini dikkate alarak anahtarın var olup olmadığını söyler. */
  function resolves(key: string, fileNamespaces: string[], explicitNs?: string): boolean {
    const colon = key.indexOf(":");
    if (colon > 0 && NAMESPACES[key.slice(0, colon)]) {
      return hasKey(NAMESPACES[key.slice(0, colon)], key.slice(colon + 1));
    }
    const candidates = explicitNs ? [explicitNs] : fileNamespaces;
    return candidates.some((ns) => NAMESPACES[ns] !== undefined && hasKey(NAMESPACES[ns], key));
  }

  it('t("...") çağrılarındaki literal anahtarlar mevcut', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of files) {
      const code = readFileSync(file, "utf8");
      const nss = namespacesOf(code);
      const where = relative(SRC, file).replace(/\\/g, "/");
      // t("a.b") / t("a.b", { ns: "x" }); şablon dizesindeki ${...} dinamik sayılır, atlanır.
      for (const m of code.matchAll(
        /\bt\(\s*(["'`])([^"'`$\\]+)\1\s*(?:,\s*\{[^}]*?\bns:\s*["']([^"']+)["'])?/g,
      )) {
        checked++;
        if (!resolves(m[2], nss, m[3])) missing.push(`${where}: ${m[2]}`);
      }
      // t(koşul ? "a.b" : "c.d")
      for (const m of code.matchAll(
        /\bt\(\s*[^"'`()?]+\?\s*(["'])([^"']+)\1\s*:\s*(["'])([^"']+)\3/g,
      )) {
        for (const key of [m[2], m[4]]) {
          checked++;
          if (!resolves(key, nss)) missing.push(`${where}: ${key}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(missing).toEqual([]);
  });

  it('veri olarak taşınan anahtarlar (label: "nav.finance" gibi) mevcut', () => {
    // translation üst düzey modül adıyla başlayan, yalnız anahtar karakterleri içeren dizeler.
    // MUI palet yolları ("error.light") çeviri anahtarı değildir.
    const notKeys = /^error\.(main|light|dark|contrastText)$/;
    const missing: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, "utf8");
      const where = relative(SRC, file).replace(/\\/g, "/");
      for (const m of code.matchAll(/(["'])([a-z][A-Za-z]*)\.([A-Za-z0-9_.]*[A-Za-z0-9_])\1/g)) {
        if (!translationTop.has(m[2])) continue;
        // t("…") bağımsız değişkenini önceki test dosyanın ad alanına göre denetler (ztoFinans'ta
        // "common.back" gibi anahtarlar translation'da olmayabilir).
        if (/\bt\(\s*$/.test(code.slice(Math.max(0, m.index - 20), m.index))) continue;
        const key = `${m[2]}.${m[3]}`;
        if (notKeys.test(key)) continue;
        if (!hasKey(tr.translation, key) && !hasPrefix(tr.translation, key)) {
          missing.push(`${where}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

/** Dinamik anahtar öneki (t(`finance.method.${m}`) için "finance.method" gibi) bir alt ağaç mı? */
function hasPrefix(tree: Tree, key: string): boolean {
  let node: string | Tree | undefined = tree;
  for (const part of key.split(".")) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  return typeof node === "object";
}

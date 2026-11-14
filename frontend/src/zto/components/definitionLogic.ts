/**
 * ZTO tanım ekranlarının (İş Yerleri, Şubeler, Şirketler — 12.1a §6.8) saf yardımcıları. Görünüm
 * kaynağı ZTO view'ları ve wwwroot/js/introduction-details.js; burada yalnız veri dönüşümleri vardır.
 */

/** Yalnız rakamlar, en çok `max` hane (ZTO `.number-input` süzgeci, _Layout.cshtml:2221-2235). */
export function digitsOnly(value: string, max: number): string {
  return value.replace(/\D+/g, "").slice(0, Math.max(0, max));
}

export type ParsedLocation = { latitude: number; longitude: number };

const COORDINATE = /^-?\d{1,3}(?:\.\d{1,6})?$/;

/**
 * "enlem,boylam" (ondalık nokta, en çok 6 hane; virgülden sonra boşluk olabilir). Boş → null,
 * biçim ya da aralık dışı → "invalid".
 */
export function parseLocation(text: string): ParsedLocation | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(",").map((part) => part.trim());
  if (parts.length !== 2 || !parts.every((part) => COORDINATE.test(part))) return "invalid";
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return "invalid";
  return { latitude, longitude };
}

/** Formdaki "Konum" metni; ikisi de yoksa "". */
export function formatLocation(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string {
  return latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
    ? ""
    : `${latitude},${longitude}`;
}

/** ZTO WorkPlace/Index.cshtml:52 Google Haritalar arama bağlantısı. */
export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function digitsOf(value: string): number[] {
  return Array.from(value, (c) => c.charCodeAt(0) - 48);
}

/** Vergi kimlik numarası (10 hane) kontrol hanesi; algoritma §4.2 (backend TaxNumbers ile aynı). */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const d = digitsOf(value);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (d[i] + 9 - i) % 10;
    let v = t === 0 ? 0 : (t * 2 ** (9 - i)) % 9;
    if (t !== 0 && v === 0) v = 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

/** T.C. kimlik numarası (11 hane); algoritma §4.2. */
export function isValidTckn(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  const d = digitsOf(value);
  if (d[0] === 0) return false;
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  if (d[9] !== tenth) return false;
  const total = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return d[10] === total % 10;
}

/** Kimlik türüne göre doğrulama; uzunluk–tür uyuşmazlığı da geçersizdir. Boş değer geçerlidir. */
export function isValidTaxNumber(type: "VKN" | "TCKN", value: string): boolean {
  if (value === "") return true;
  return type === "VKN" ? isValidVkn(value) : isValidTckn(value);
}

/** Belge serisi örneği: `NF-2026-000123` (backend DocumentNumberService biçimi). */
export function seriesSample(prefix: string, year: number, next: number, padding: number): string {
  return `${prefix}-${year}-${String(next).padStart(padding, "0")}`;
}

/** Liste sayfasına `navigate(…, { state: { flash } })` ile taşınan başarı mesajı. */
export function flashFromState(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return null;
  const flash = (state as { flash?: unknown }).flash;
  return typeof flash === "string" && flash.trim() !== "" ? flash : null;
}

/**
 * Detay modalındaki alan simgesi: Views/DefinitionDetails/_Details.cshtml:15-35 eşlemesi, sıra
 * birebir (ilk eşleşen kazanır).
 */
export function fieldIcon(label: string | null | undefined): string {
  const l = label ?? "";
  if (l === "Cari Adı") return "fa-building";
  if (l === "Cari Kodu") return "fa-barcode";
  if (l === "Cari Grubu") return "fa-layer-group";
  if (l === "Vergi No") return "fa-id-card";
  if (l === "Durum") return "fa-check-circle";
  if (l.includes("Telefon") || l.includes("Tel")) return "fa-phone-alt";
  if (l.includes("Mail") || l.includes("Email")) return "fa-envelope";
  if (l.includes("Kod")) return "fa-barcode";
  if (l.includes("Tarih")) return "fa-calendar-alt";
  if (l.includes("Kimlik") || l.includes("TC")) return "fa-id-card";
  if (l.includes("Firma") || l.includes("Kurumsal") || l.includes("Şirket")) return "fa-building";
  if (l.includes("Adres") || l.includes("Lokasyon") || l.includes("Şehir") || l.includes("İl")) {
    return "fa-map-marker-alt";
  }
  if (l.includes("Tonaj") || l.includes("Miktar") || l.includes("Kapasite")) {
    return "fa-weight-hanging";
  }
  if (l.includes("Sertifika")) return "fa-certificate";
  if (l.includes("Para") || l.includes("Fiyat") || l.includes("Tutar") || l.includes("Bakiye")) {
    return "fa-coins";
  }
  if (l.includes("Yetkili") || l.includes("Kişi") || l.includes("Ad Soyad")) return "fa-user";
  if (l.includes("Ad") || l.includes("İsim")) return "fa-tag";
  return "fa-info-circle";
}

export type DefinitionEntityKey = "workplace" | "branch" | "company" | "customer-account";

/**
 * Hero simgesi (_Details.cshtml:46-75; şirket Blackrose eki, liste simgesiyle aynı). Cari kart
 * (DefinitionAuditRegistry.cs:58 "Cari Kart") ZTO'da kendi görünümüyle fa-file-invoice-dollar.
 */
export const ENTITY_ICONS: Record<DefinitionEntityKey, string> = {
  workplace: "fa-building",
  branch: "fa-city",
  company: "fa-landmark",
  "customer-account": "fa-file-invoice-dollar",
};

/**
 * Vurgu teması (_Details.cshtml:77-88): workplace/branch mavi, diğerleri (şirket) indigo. Cari kartın
 * vurgusu yok; kendi `definition-details--customer-account` görünümü kullanılır (detailsVariant).
 */
export function entityAccent(key: DefinitionEntityKey): "blue" | "indigo" | null {
  if (key === "customer-account") return null;
  return key === "company" ? "indigo" : "blue";
}

export type DetailsVariant = {
  rootClass: string;
  heroClass: string;
  icon: string;
  /** true: hero'da kod · grup · durum (ZTO _Details.cshtml:95-100). */
  customerAccount: boolean;
};

/** _Details.cshtml:89-91 kök ve hero sınıfları. */
export function detailsVariant(key: DefinitionEntityKey): DetailsVariant {
  const accent = entityAccent(key);
  if (accent === null) {
    return {
      rootClass: "definition-details definition-details--customer-account",
      heroClass: "definition-details__hero definition-details__hero--customer-account",
      icon: ENTITY_ICONS[key],
      customerAccount: true,
    };
  }
  return {
    rootClass: `definition-details definition-details--vivid dd-accent-${accent}`,
    heroClass: "definition-details__hero definition-details__hero--vivid",
    icon: ENTITY_ICONS[key],
    customerAccount: false,
  };
}

/** ZTO `fieldValue(label)`: etiketi verilen alanın değeri, yoksa "-". */
export function fieldValueOf(
  fields: ReadonlyArray<{ label: string; value: unknown }>,
  label: string,
): unknown {
  const value = fields.find((field) => field.label === label)?.value;
  return value === undefined || value === null || value === "" ? "-" : value;
}

export type DefinitionHistoryEntry = {
  at: string;
  actor: string | null;
  event: string;
  details: string | null;
};

export type DefinitionHistoryRow = {
  key: string;
  at: string;
  actor: string;
  event: string;
  details: string | null;
};

/**
 * "Düzenleme Geçmişi" satırları (Blackrose eki; kart değişiklik kaydı): en yeni önce, tarih
 * dd.MM.yyyy HH:mm, boş kişi "Sistem aktarımı", olay adı `eventLabel` ile (bilinmeyen kod aynen).
 */
export function historyRows(
  entries: ReadonlyArray<DefinitionHistoryEntry>,
  options: {
    systemImport: string;
    formatAt: (iso: string) => string;
    eventLabel?: (event: string) => string;
  },
): DefinitionHistoryRow[] {
  return [...entries]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at) || a.index - b.index)
    .map(({ entry, index }) => ({
      key: `${entry.at}-${index}`,
      at: options.formatAt(entry.at) || "-",
      actor: actorText(entry.actor, options.systemImport),
      event: options.eventLabel?.(entry.event) ?? entry.event,
      details: blankToNull(entry.details),
    }));
}

/** Denetim "Son İşlem Yapan" (_IntroductionAuditCellCompact.cshtml:24-27; erişim kaydı yok). */
export function lastActor(audit: {
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
}): { by: string; at: string } {
  return audit.updateCount > 0
    ? { by: audit.updatedBy, at: audit.updatedAt }
    : { by: audit.createdBy, at: audit.createdAt };
}

/** API hatasından gösterilecek metin; ApiError.message ya da genel metin. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return fallback;
}

/** API hata kodu (ApiError.body.code); yoksa undefined. */
export function errorCode(error: unknown): string | undefined {
  const body = (error as { body?: { code?: unknown } } | null)?.body;
  return typeof body?.code === "string" ? body.code : undefined;
}

/** Boş metni null'a çevirir (isteğe bağlı API alanları). */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Sorgu dizgesi: boş/undefined değerler atılır. */
export function queryString(params: Record<string, string | number | boolean | null | undefined>) {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** Şirket kodu girişi: büyük harf (tr değil, ASCII kod), yalnız A-Z 0-9 _ -, en çok 20. */
export function companyCodeInput(value: string): string {
  return value
    .toLocaleUpperCase("en")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 20);
}

/** Seri öneki girişi: büyük harf, yalnız A-Z 0-9 -, en çok 10. */
export function seriesPrefixInput(value: string): string {
  return value
    .toLocaleUpperCase("en")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 10);
}

/** e-Belge seri girişi (Fatura/İrsaliye Seri): büyük harf, A-Z 0-9, en çok 3. */
export function eDocumentSeriesInput(value: string): string {
  return value
    .toLocaleUpperCase("en")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
}

/** `datetime-local` değeri (yyyy-MM-ddTHH:mm:ss), yerel saat; ZTO Add "Oluşturma Tarihi". */
export function dateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export const LOGO_MAX_BYTES = 1_048_576;

/** İstemci logo denetimi (§4.9): PNG/JPEG, en çok 1 MB. */
export function isAcceptableLogo(file: { type: string; size: number }): boolean {
  return (file.type === "image/png" || file.type === "image/jpeg") && file.size <= LOGO_MAX_BYTES;
}

export type PopoverPlacement = { left: number; top: number; width: number; above: boolean };

/**
 * "Kayıt Geçmişi" açılır kutusunun konumu (introduction-audit-popover.js positionPopover): genişlik
 * en çok 286, tetikleyicinin altında 8 px; altta sığmazsa ve üstte yer varsa üstte.
 */
export function auditPopoverPlacement(
  trigger: { left: number; top: number; bottom: number },
  popoverHeight: number,
  viewport: { width: number; height: number },
): PopoverPlacement {
  const gap = 8;
  const width = Math.min(286, viewport.width - 20);
  const left = Math.max(10, Math.min(trigger.left, viewport.width - width - 10));
  const below = trigger.bottom + gap;
  if (below + popoverHeight > viewport.height - 10 && trigger.top > popoverHeight + gap) {
    return { left, top: trigger.top - popoverHeight - gap, width, above: true };
  }
  return { left, top: below, width, above: false };
}

/** Denetim kolonundaki kişi: boş ya da "Sistem aktarımı" literali → çevrilmiş metin. */
export function actorText(value: string | null | undefined, systemImport: string): string {
  const v = (value ?? "").trim();
  return v === "" || v.toLocaleLowerCase("tr") === "sistem aktarımı" ? systemImport : v;
}

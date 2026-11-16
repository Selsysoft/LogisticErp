import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  daysBetween,
  endOfMonthIso,
  formatDayMonth,
  formatIsoDate,
  formatMonthKey,
  localToday,
} from "./reportDates";

describe("daysBetween", () => {
  it("aynı gün 0, ileri pozitif, geri negatif", () => {
    expect(daysBetween("2026-11-16", "2026-11-16")).toBe(0);
    expect(daysBetween("2026-11-16", "2026-11-22")).toBe(6);
    expect(daysBetween("2026-11-16", "2026-11-01")).toBe(-15);
  });

  it("ay, yıl ve artık yıl sınırları", () => {
    expect(daysBetween("2026-01-31", "2026-03-01")).toBe(29);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("yaz saati geçişinde kayma yok (UTC gece yarıları)", () => {
    // Avrupa yaz saati 2026-03-29 ve 2026-10-25; ABD 2026-03-08 ve 2026-11-01.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("geçersiz tarih null", () => {
    expect(daysBetween("2026-02-30", "2026-03-01")).toBeNull();
    expect(daysBetween("", "2026-03-01")).toBeNull();
    expect(daysBetween("2026-03-01", "01.03.2026")).toBeNull();
  });
});

describe("diğer yardımcılar", () => {
  it("ay sonu", () => {
    expect(endOfMonthIso("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonthIso("2028-02-01")).toBe("2028-02-29");
    expect(endOfMonthIso("2026-12-31")).toBe("2026-12-31");
    expect(endOfMonthIso("x")).toBeNull();
  });

  it("gün.ay ve ay anahtarı etiketleri", () => {
    expect(formatDayMonth("2026-11-02")).toBe("02.11");
    expect(formatDayMonth(null)).toBe("");
    expect(formatMonthKey("2026-11")).toBe("11.2026");
    expect(formatMonthKey("bozuk")).toBe("bozuk");
  });

  it("12.7 yardımcıları yeniden dışa aktarılır", () => {
    expect(addDaysIso("2026-11-30", 1)).toBe("2026-12-01");
    expect(formatIsoDate("2026-11-16")).toBe("16.11.2026");
    // Yerel takvim (toISOString'in UTC kayması yok): 23:30 yerel saatte yine aynı gün.
    expect(localToday(new Date(2026, 10, 16, 23, 30))).toBe("2026-11-16");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSnackbar,
  createSnackbarTimeline,
  liveLevel,
  removeSnackbar,
  setPhase,
  SNACKBAR_SLIDE_MS,
  SNACKBAR_VISIBLE_MS,
  snackbarClass,
  snackbarStyle,
} from "./snackbarLogic";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

function timeline() {
  const events: string[] = [];
  const line = createSnackbarTimeline(
    {
      onShow: () => events.push(`show@${Date.now()}`),
      onHide: () => events.push(`hide@${Date.now()}`),
      onRemove: () => events.push(`remove@${Date.now()}`),
    },
    { now: () => Date.now() },
  );
  return { events, line };
}

describe("snackbar sınıfı ve canlı bölge", () => {
  it("ZTO sınıfları; hata assertive, diğerleri polite", () => {
    expect(snackbarClass("success")).toBe("snackbar snackbar-success");
    expect(snackbarClass("error")).toBe("snackbar snackbar-error");
    expect(liveLevel("error")).toBe("assertive");
    expect(liveLevel("success")).toBe("polite");
    expect(liveLevel("info")).toBe("polite");
    expect(liveLevel("warning")).toBe("polite");
  });

  it("stil: tam genişlik, ortalı; kayma ya da yalnız saydamlık", () => {
    expect(snackbarStyle("entering", false)).toMatchObject({
      width: "100%",
      textAlign: "center",
      bottom: "-50px",
    });
    expect(snackbarStyle("shown", false).bottom).toBe(0);
    expect(snackbarStyle("leaving", false).bottom).toBe("-50px");
    expect(snackbarStyle("shown", false).transition).toBe("bottom 500ms ease-in-out");
    expect(snackbarStyle("entering", true)).toMatchObject({ bottom: 0, opacity: 0 });
    expect(snackbarStyle("shown", true)).toMatchObject({ bottom: 0, opacity: 1 });
    expect(String(snackbarStyle("shown", true).transition)).toContain("opacity");
  });
});

describe("kuyruk yok", () => {
  it("ileti hemen listeye girer; açık iletiler beklenmez (modal açık olsa da)", () => {
    let list = addSnackbar([], { id: 1, message: "a", kind: "success" });
    list = addSnackbar(list, { id: 2, message: "b", kind: "error" });
    expect(list.map((i) => [i.id, i.phase])).toEqual([
      [1, "entering"],
      [2, "entering"],
    ]);
    list = setPhase(list, 1, "shown");
    expect(list[0].phase).toBe("shown");
    expect(list[1].phase).toBe("entering");
    expect(removeSnackbar(list, 1).map((i) => i.id)).toEqual([2]);
  });
});

describe("zaman çizelgesi", () => {
  it("hemen açılır, 500 ms + 3 sn sonra kapanır, 500 ms sonra silinir", () => {
    const start = Date.now();
    const { events } = timeline();
    vi.advanceTimersByTime(0);
    expect(events).toEqual([`show@${start}`]);
    vi.advanceTimersByTime(SNACKBAR_SLIDE_MS + SNACKBAR_VISIBLE_MS - 1);
    expect(events).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(events[1]).toBe(`hide@${start + 3500}`);
    vi.advanceTimersByTime(SNACKBAR_SLIDE_MS);
    expect(events[2]).toBe(`remove@${start + 4000}`);
  });

  it("fare/odakta durur, ayrılınca kalan süreyle devam eder", () => {
    const start = Date.now();
    const { events, line } = timeline();
    vi.advanceTimersByTime(1000);
    line.pause();
    line.pause();
    vi.advanceTimersByTime(10_000);
    expect(events).toHaveLength(1);
    line.resume();
    line.resume();
    vi.advanceTimersByTime(2499);
    expect(events).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(events[1]).toBe(`hide@${start + 13_500}`);
  });

  it("kalan süre azsa ayrıldıktan sonra en az kayma süresi kadar görünür", () => {
    const { events, line } = timeline();
    vi.advanceTimersByTime(3400);
    line.pause();
    line.resume();
    vi.advanceTimersByTime(499);
    expect(events).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(events).toHaveLength(2);
  });

  it("elle kapatma hemen kapatır; kapandıktan sonra duraklatma etkisiz; dispose zamanlayıcıları siler", () => {
    const { events, line } = timeline();
    vi.advanceTimersByTime(10);
    line.dismiss();
    line.dismiss();
    line.pause();
    line.resume();
    vi.advanceTimersByTime(SNACKBAR_SLIDE_MS);
    expect(events.map((e) => e.split("@")[0])).toEqual(["show", "hide", "remove"]);
    const other = timeline();
    other.line.dispose();
    vi.advanceTimersByTime(10_000);
    expect(other.events).toEqual([]);
  });
});

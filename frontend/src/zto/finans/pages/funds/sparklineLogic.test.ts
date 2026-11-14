import { describe, expect, it } from "vitest";
import { SPARK_HEIGHT, balanceSeries, sparkGeometry } from "./sparklineLogic";

describe("sparklineLogic (ZTO buildSpark)", () => {
  it("seri güncel bakiyeden geriye kurulur (eskiden yeniye)", () => {
    expect(balanceSeries(150, [100, -20, 70])).toEqual([0, 100, 80, 150]);
    expect(balanceSeries(10, [])).toBeNull();
    expect(balanceSeries(5, [Number.NaN])).toEqual([5, 5]);
  });

  it("< 2 nokta kesikli düz çizgi", () => {
    expect(sparkGeometry(null)).toEqual({ flat: true, midY: SPARK_HEIGHT / 2, x1: 3, x2: 89 });
    expect(sparkGeometry([5]).flat).toBe(true);
  });

  it("yükselişte yeşil, düşüşte kırmızı; Catmull-Rom yolu ve alan", () => {
    const up = sparkGeometry([0, 100]);
    expect(up).toMatchObject({ flat: false, up: true, color: "#10b981" });
    if (up.flat) throw new Error("düz olmamalı");
    expect(up.line).toBe("M3.0,35.0 C15.2,30.5 76.8,7.5 89.0,3.0 ");
    expect(up.area).toBe(`${up.line}L89.0,35 L3.0,35 Z`);
    const down = sparkGeometry([10, 10, 5]);
    expect(down).toMatchObject({ up: false, color: "#ef4444" });
    const flatRange = sparkGeometry([7, 7]);
    expect(flatRange).toMatchObject({ up: true });
  });
});

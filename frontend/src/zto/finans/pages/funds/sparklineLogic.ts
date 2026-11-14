/*
 * Kart sparkline'ı (ZTO BankIntroduction/Index.cshtml:3253-3301 `buildSpark`, CashIntroduction aynı):
 * 92×38 SVG, Catmull-Rom → kübik Bézier yumuşatma (T = 0.85), alan degradesi ve gölge. Seri, güncel
 * bakiyeden geriye yürüyerek kurulur (ZTO loadSparklines): sunucu son 20 hareketin işaretli tutarını
 * eskiden yeniye verir (§3.2.4).
 */

export const SPARK_WIDTH = 92;
export const SPARK_HEIGHT = 38;
const PAD = 3;
const SMOOTHING = 0.85;

/**
 * Bakiye serisi (kronolojik, son = güncel): güncel bakiyeden hareketler sondan başa düşülür.
 * Hareket yoksa null (kesikli çizgi + "Hareket yok").
 */
export function balanceSeries(
  current: number,
  deltasOldestFirst: readonly number[],
): number[] | null {
  if (deltasOldestFirst.length === 0) return null;
  const reversed = [current];
  let run = current;
  for (let i = deltasOldestFirst.length - 1; i >= 0; i--) {
    run -= Number(deltasOldestFirst[i]) || 0;
    reversed.push(run);
  }
  return reversed.reverse();
}

export type SparkGeometry =
  | { flat: true; midY: number; x1: number; x2: number }
  | { flat: false; up: boolean; color: string; line: string; area: string };

const fixed = (n: number) => n.toFixed(1);

/** Çizim geometrisi: < 2 nokta düz kesikli çizgi; yükselişte yeşil (#10b981), düşüşte kırmızı (#ef4444). */
export function sparkGeometry(series: readonly number[] | null): SparkGeometry {
  if (!series || series.length < 2) {
    return { flat: true, midY: SPARK_HEIGHT / 2, x1: PAD, x2: SPARK_WIDTH - PAD };
  }
  const n = series.length;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = (SPARK_WIDTH - 2 * PAD) / (n - 1);
  const px = (i: number) => PAD + i * stepX;
  const py = (v: number) => SPARK_HEIGHT - PAD - ((v - min) / range) * (SPARK_HEIGHT - 2 * PAD);
  const up = series[n - 1] >= series[0];
  const color = up ? "#10b981" : "#ef4444";
  const pts = series.map((v, i) => ({ x: px(i), y: py(v) }));
  let line = `M${fixed(pts[0].x)},${fixed(pts[0].y)} `;
  for (let j = 0; j < n - 1; j++) {
    const p0 = pts[j - 1] ?? pts[j];
    const p1 = pts[j];
    const p2 = pts[j + 1];
    const p3 = pts[j + 2] ?? pts[j + 1];
    const c1x = p1.x + ((p2.x - p0.x) / 6) * SMOOTHING;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * SMOOTHING;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * SMOOTHING;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * SMOOTHING;
    line += `C${fixed(c1x)},${fixed(c1y)} ${fixed(c2x)},${fixed(c2y)} ${fixed(p2.x)},${fixed(p2.y)} `;
  }
  const area = `${line}L${fixed(px(n - 1))},${SPARK_HEIGHT - PAD} L${fixed(px(0))},${SPARK_HEIGHT - PAD} Z`;
  return { flat: false, up, color, line, area };
}

// ZtoChart'ın saf seçenek ve renk mantığı (chart.js çalışma zamanı gerektirmez, birim testlidir).
import type { ChartData, ChartOptions, TooltipItem } from "chart.js";
import { formatMoney, formatN2, formatNumber } from "../format";

export type ZtoChartType = "bar" | "line" | "pie" | "doughnut";

export type ZtoLegendPosition = "top" | "bottom" | "left" | "right";

/**
 * Eksen ve ipucu değer biçimi: "n2" → "1.234,56", "integer" → "1.235", "percent" → "%12,5",
 * { currency } → "1.234,56 ₺" ya da özel fonksiyon. Verilmezse chart.js tr-TR yerel ayarıyla biçimler.
 */
export type ZtoValueFormat =
  "n2" | "integer" | "percent" | { currency: string } | ((value: number) => string);

export interface ZtoChartOptionsInput {
  type: ZtoChartType;
  title?: string;
  /** false gizler; varsayılan "top" (ZTO raporları). */
  legend?: boolean | ZtoLegendPosition;
  valueFormat?: ZtoValueFormat;
  /** Çubuk/çizgi serilerini üst üste yığar. */
  stacked?: boolean;
  /** Yatay çubuk (indexAxis: "y"). */
  horizontal?: boolean;
  /** Kapsayıcı yüksekliği verildiğinde false olmalı. */
  maintainAspectRatio?: boolean;
}

// Bootstrap 4.4.1 tema renkleri (ZTO raporlarındaki rgba(40,167,69,…) vb. ile aynı).
export const ZTO_CHART_COLORS = [
  [0, 123, 255],
  [40, 167, 69],
  [220, 53, 69],
  [255, 193, 7],
  [23, 162, 184],
  [108, 117, 125],
  [111, 66, 193],
  [253, 126, 20],
] as const;

/** Çubuk/çizgi serisi rengi: ZTO'daki gibi %70 dolgu, tam kenar. */
export function seriesColor(index: number): { background: string; border: string } {
  const palette = ZTO_CHART_COLORS;
  const [r, g, b] = palette[((index % palette.length) + palette.length) % palette.length];
  return { background: `rgba(${r}, ${g}, ${b}, 0.7)`, border: `rgba(${r}, ${g}, ${b}, 1)` };
}

/** Pasta dilimi renkleri: ZTO Finance/Index.cshtml'deki altın açı tonları (hsl(i·137.5, 70%, 50%)). */
export function sliceColors(count: number): string[] {
  return Array.from(
    { length: Math.max(count, 0) },
    (_, index) => `hsl(${(index * 137.5) % 360}, 70%, 50%)`,
  );
}

type AnyChartData = ChartData<ZtoChartType>;

/** Rengi verilmemiş veri kümelerine ZTO renklerini ekler; verilen renklere dokunmaz. */
export function applyDefaultColors<T extends AnyChartData>(type: ZtoChartType, data: T): T {
  const circular = type === "pie" || type === "doughnut";
  const datasets = data.datasets.map((dataset, index) => {
    const next: Record<string, unknown> = { ...dataset };
    if (circular) {
      if (next.backgroundColor === undefined) {
        next.backgroundColor = sliceColors(dataset.data.length);
      }
      if (next.borderColor === undefined) {
        next.borderColor = "#fff";
      }
      if (next.borderWidth === undefined) {
        next.borderWidth = 1;
      }
      return next;
    }
    const color = seriesColor(index);
    if (next.backgroundColor === undefined) {
      next.backgroundColor = color.background;
    }
    if (next.borderColor === undefined) {
      next.borderColor = color.border;
    }
    if (next.borderWidth === undefined) {
      next.borderWidth = 2;
    }
    return next;
  });
  return { ...data, datasets } as T;
}

/** Veri kümesi yoksa ya da hepsi boşsa true. */
export function isEmptyChartData(data: AnyChartData | null | undefined): boolean {
  return !data || data.datasets.every((dataset) => !dataset.data || dataset.data.length === 0);
}

/** Biçim tanımını fonksiyona çevirir; tanım yoksa undefined (chart.js varsayılanı). */
export function resolveValueFormatter(
  format: ZtoValueFormat | undefined,
): ((value: number) => string) | undefined {
  if (format === undefined) {
    return undefined;
  }
  if (typeof format === "function") {
    return format;
  }
  if (format === "n2") {
    return (value) => formatN2(value);
  }
  if (format === "integer") {
    return (value) => formatNumber(value, 0);
  }
  if (format === "percent") {
    return (value) => `%${formatNumber(value, 1)}`;
  }
  const { currency } = format;
  return (value) => formatMoney(value, currency);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Düz nesneleri derin birleştirir; diziler ve fonksiyonlar üstteki değerle değiştirilir. */
export function mergeOptions<T extends object>(base: T, override: object | undefined): T {
  if (!override) {
    return base;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value) ? mergeOptions(current, value) : value;
  }
  return result as T;
}

function tooltipLabel(
  type: ZtoChartType,
  horizontal: boolean,
  formatter: (value: number) => string,
): (item: TooltipItem<ZtoChartType>) => string {
  return (item) => {
    if (type === "pie" || type === "doughnut") {
      const value = formatter(Number(item.parsed));
      return item.label ? `${item.label}: ${value}` : value;
    }
    const parsed = item.parsed as { x: number; y: number };
    const value = formatter(horizontal ? parsed.x : parsed.y);
    return item.dataset.label ? `${item.dataset.label}: ${value}` : value;
  };
}

/**
 * ZTO raporlarındaki grafik ayarları: duyarlı, gösterge üstte, değer ekseni sıfırdan başlar, sayılar
 * tr-TR. Biçim verilirse değer ekseni ve ipucu bu biçimle yazılır.
 */
export function buildChartOptions(input: ZtoChartOptionsInput): ChartOptions<ZtoChartType> {
  const { type, title, legend = "top", valueFormat, stacked = false, horizontal = false } = input;
  const formatter = resolveValueFormatter(valueFormat);
  const circular = type === "pie" || type === "doughnut";
  const options: Record<string, unknown> = {
    locale: "tr-TR",
    responsive: true,
    maintainAspectRatio: input.maintainAspectRatio ?? true,
    plugins: {
      legend:
        legend === false
          ? { display: false }
          : { display: true, position: legend === true ? "top" : legend },
      title: title ? { display: true, text: title } : { display: false },
      ...(formatter
        ? { tooltip: { callbacks: { label: tooltipLabel(type, horizontal, formatter) } } }
        : {}),
    },
  };
  if (!circular) {
    const valueAxis: Record<string, unknown> = { beginAtZero: true, stacked };
    if (formatter) {
      valueAxis.ticks = { callback: (value: number | string) => formatter(Number(value)) };
    }
    const indexAxis = { stacked };
    options.scales = horizontal ? { x: valueAxis, y: indexAxis } : { x: indexAxis, y: valueAxis };
    if (horizontal) {
      options.indexAxis = "y";
    }
  }
  return options as ChartOptions<ZtoChartType>;
}

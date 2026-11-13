import type { ChartData, TooltipItem } from "chart.js";
import { describe, expect, it } from "vitest";
import {
  applyDefaultColors,
  buildChartOptions,
  isEmptyChartData,
  mergeOptions,
  resolveValueFormatter,
  seriesColor,
  sliceColors,
  ZtoChartType,
} from "./chartOptions";

type Labeler = (item: TooltipItem<ZtoChartType>) => string;

function labeler(options: ReturnType<typeof buildChartOptions>): Labeler {
  return (options.plugins?.tooltip?.callbacks?.label as unknown as Labeler) ?? (() => "");
}

// Testte yalnız label, dataset.label ve parsed okunur; parsed türü grafik türüne göre değişir.
function item(partial: {
  label?: string;
  parsed: number | { x: number; y: number };
  dataset?: { label?: string; data: number[] };
}): TooltipItem<ZtoChartType> {
  return { label: "", dataset: { label: "" }, ...partial } as unknown as TooltipItem<ZtoChartType>;
}

describe("renkler", () => {
  it("seri rengi Bootstrap paletinden, ZTO'daki %70 dolguyla", () => {
    expect(seriesColor(1)).toEqual({
      background: "rgba(40, 167, 69, 0.7)",
      border: "rgba(40, 167, 69, 1)",
    });
    expect(seriesColor(8)).toEqual(seriesColor(0));
    expect(seriesColor(-1)).toEqual(seriesColor(7));
  });

  it("pasta dilimleri altın açı tonları", () => {
    expect(sliceColors(3)).toEqual([
      "hsl(0, 70%, 50%)",
      "hsl(137.5, 70%, 50%)",
      "hsl(275, 70%, 50%)",
    ]);
    expect(sliceColors(0)).toEqual([]);
    expect(sliceColors(-2)).toEqual([]);
  });

  it("rengi olmayan kümelere renk ekler, verilenlere dokunmaz", () => {
    const data: ChartData<"bar"> = {
      labels: ["TRY", "USD"],
      datasets: [
        { label: "Alacak", data: [1, 2] },
        {
          label: "Borç",
          data: [3, 4],
          backgroundColor: "red",
          borderColor: "blue",
          borderWidth: 1,
        },
      ],
    };
    const colored = applyDefaultColors("bar", data);
    expect(colored).not.toBe(data);
    expect(colored.labels).toBe(data.labels);
    expect(colored.datasets[0]).toMatchObject({
      backgroundColor: "rgba(0, 123, 255, 0.7)",
      borderColor: "rgba(0, 123, 255, 1)",
      borderWidth: 2,
    });
    expect(colored.datasets[1]).toMatchObject({
      backgroundColor: "red",
      borderColor: "blue",
      borderWidth: 1,
    });
    expect(data.datasets[0].backgroundColor).toBeUndefined();
  });

  it("pasta/halka kümesine dilim renkleri ve beyaz kenar", () => {
    const pie = applyDefaultColors("pie", { labels: ["a", "b"], datasets: [{ data: [1, 2] }] });
    expect(pie.datasets[0]).toMatchObject({
      backgroundColor: ["hsl(0, 70%, 50%)", "hsl(137.5, 70%, 50%)"],
      borderColor: "#fff",
      borderWidth: 1,
    });
    const doughnut = applyDefaultColors("doughnut", {
      datasets: [{ data: [1], backgroundColor: ["#000"], borderColor: "#111", borderWidth: 3 }],
    });
    expect(doughnut.datasets[0]).toMatchObject({
      backgroundColor: ["#000"],
      borderColor: "#111",
      borderWidth: 3,
    });
  });
});

describe("isEmptyChartData", () => {
  it("boş veri", () => {
    expect(isEmptyChartData(undefined)).toBe(true);
    expect(isEmptyChartData(null)).toBe(true);
    expect(isEmptyChartData({ datasets: [] })).toBe(true);
    expect(isEmptyChartData({ datasets: [{ data: [] }] })).toBe(true);
    expect(isEmptyChartData({ datasets: [{ data: [] }, { data: [1] }] })).toBe(false);
  });
});

describe("resolveValueFormatter", () => {
  it("biçim tanımları", () => {
    expect(resolveValueFormatter(undefined)).toBeUndefined();
    expect(resolveValueFormatter("n2")?.(1234.5)).toBe("1.234,50");
    expect(resolveValueFormatter("integer")?.(1234.5)).toBe("1.235");
    expect(resolveValueFormatter("percent")?.(12.345)).toBe("%12,3");
    expect(resolveValueFormatter({ currency: "USD" })?.(10)).toBe("10,00 $");
    expect(resolveValueFormatter((value) => `<${value}>`)?.(3)).toBe("<3>");
  });
});

describe("mergeOptions", () => {
  it("düz nesneleri derin birleştirir, dizi ve fonksiyonları değiştirir", () => {
    const fn = () => "x";
    const base = { a: 1, nested: { b: 2, c: { d: 3 } }, list: [1, 2], keep: true };
    const merged = mergeOptions(base, {
      nested: { c: { e: 4 } },
      list: [9],
      f: fn,
      keep: undefined,
    });
    expect(merged).toEqual({
      a: 1,
      nested: { b: 2, c: { d: 3, e: 4 } },
      list: [9],
      f: fn,
      keep: true,
    });
    expect(base.nested.c).toEqual({ d: 3 });
  });

  it("üst değer yoksa tabanı döndürür", () => {
    const base = { a: 1 };
    expect(mergeOptions(base, undefined)).toBe(base);
  });

  it("nesne olmayan değer nesnenin yerine geçer", () => {
    expect(mergeOptions({ a: { b: 1 } }, { a: null })).toEqual({ a: null });
    expect(mergeOptions({ a: 1 }, { a: { b: 2 } })).toEqual({ a: { b: 2 } });
  });
});

describe("buildChartOptions", () => {
  it("çubuk grafik varsayılanları: tr-TR, gösterge üstte, sıfırdan başlayan değer ekseni", () => {
    const options = buildChartOptions({ type: "bar", title: "Döviz Bazında Alacak/Borç Dağılımı" });
    expect(options).toMatchObject({
      locale: "tr-TR",
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: "top" },
        title: { display: true, text: "Döviz Bazında Alacak/Borç Dağılımı" },
      },
      scales: { x: { stacked: false }, y: { beginAtZero: true, stacked: false } },
    });
    expect(options.plugins?.tooltip).toBeUndefined();
    expect((options.scales?.y as { ticks?: unknown }).ticks).toBeUndefined();
    expect(options).not.toHaveProperty("indexAxis");
  });

  it("gösterge ve başlık seçenekleri", () => {
    expect(buildChartOptions({ type: "line", legend: false }).plugins).toMatchObject({
      legend: { display: false },
      title: { display: false },
    });
    expect(buildChartOptions({ type: "line", legend: true }).plugins?.legend).toMatchObject({
      position: "top",
    });
    expect(buildChartOptions({ type: "line", legend: "bottom" }).plugins?.legend).toMatchObject({
      position: "bottom",
    });
    expect(
      buildChartOptions({ type: "line", maintainAspectRatio: false }).maintainAspectRatio,
    ).toBe(false);
  });

  it("biçim verilince değer ekseni ve ipucu biçimlenir", () => {
    const options = buildChartOptions({
      type: "bar",
      valueFormat: { currency: "TRY" },
      stacked: true,
    });
    const ticks = (options.scales?.y as { ticks: { callback: (value: number | string) => string } })
      .ticks;
    expect(ticks.callback(1500)).toBe("1.500,00 ₺");
    expect(ticks.callback("2")).toBe("2,00 ₺");
    expect(options.scales?.x).toMatchObject({ stacked: true });
    const label = labeler(options);
    expect(
      label(item({ parsed: { x: 0, y: 1234.5 }, dataset: { label: "Alacak", data: [] } })),
    ).toBe("Alacak: 1.234,50 ₺");
    expect(label(item({ parsed: { x: 0, y: 1 }, dataset: { label: "", data: [] } }))).toBe(
      "1,00 ₺",
    );
  });

  it("yatay çubukta değer ekseni x", () => {
    const options = buildChartOptions({ type: "bar", horizontal: true, valueFormat: "n2" });
    expect(options).toMatchObject({
      indexAxis: "y",
      scales: { x: { beginAtZero: true }, y: { stacked: false } },
    });
    expect((options.scales?.x as { ticks?: unknown }).ticks).toBeDefined();
    const label = labeler(options);
    expect(label(item({ parsed: { x: 7.5, y: 0 }, dataset: { label: "Kasa", data: [] } }))).toBe(
      "Kasa: 7,50",
    );
  });

  it("pasta/halkada eksen yok, ipucu dilim adıyla", () => {
    const options = buildChartOptions({ type: "pie", valueFormat: "percent" });
    expect(options.scales).toBeUndefined();
    const label = labeler(options);
    expect(label(item({ parsed: 42.25, label: "Merkez Kasa" }))).toBe("Merkez Kasa: %42,3");
    expect(label(item({ parsed: 10, label: "" }))).toBe("%10,0");
    expect(buildChartOptions({ type: "doughnut" }).scales).toBeUndefined();
  });
});

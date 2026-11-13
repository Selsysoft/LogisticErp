// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";

// jsdom'da canvas yok: react-chartjs-2 yerine aldığı props'u yazan bir taklit çizilir.
const chartProps = vi.hoisted(() => ({ last: undefined as Record<string, unknown> | undefined }));
vi.mock("react-chartjs-2", () => ({
  Chart: (props: Record<string, unknown>) => {
    chartProps.last = props;
    return (
      <canvas
        data-testid="chart"
        data-type={String(props.type)}
        role={props.role as string}
        aria-label={props["aria-label"] as string}
      />
    );
  },
}));

const { default: LazyDefault, ZtoChart } = await import("./ZtoChart");

afterEach(() => {
  cleanup();
  chartProps.last = undefined;
});

const barData = {
  labels: ["TRY", "USD"],
  datasets: [
    { label: "Alacak", data: [1200, 300] },
    { label: "Borç", data: [800, 100] },
  ],
};

describe("ZtoChart", () => {
  it("tür, renkli veri ve tr-TR seçenekleriyle çizer", () => {
    render(
      <ZtoChart
        type="bar"
        data={barData}
        title="Döviz Dağılımı"
        valueFormat="n2"
        className="chart-wrap"
      />,
    );
    const canvas = screen.getByTestId("chart");
    expect(canvas.getAttribute("data-type")).toBe("bar");
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-label")).toBe("Döviz Dağılımı");
    expect(canvas.parentElement?.className).toBe("chart-wrap");
    expect(canvas.parentElement?.getAttribute("style")).toBeNull();

    const props = chartProps.last as {
      data: typeof barData & { datasets: Array<Record<string, unknown>> };
      options: Record<string, unknown>;
      fallbackContent: unknown;
    };
    expect(props.data.datasets[0].backgroundColor).toBe("rgba(0, 123, 255, 0.7)");
    expect(props.data.datasets[1].backgroundColor).toBe("rgba(40, 167, 69, 0.7)");
    expect(props.options).toMatchObject({
      locale: "tr-TR",
      maintainAspectRatio: true,
      plugins: { title: { text: "Döviz Dağılımı" } },
    });
    expect(props.fallbackContent).toBe("Döviz Dağılımı");
    // Girdi verisi değiştirilmez.
    expect(barData.datasets[0]).not.toHaveProperty("backgroundColor");
  });

  it("yükseklik verilince en-boy oranı bırakılır, seçenekler derin birleşir", () => {
    render(
      <ZtoChart
        type="line"
        data={barData}
        height={240}
        colorize={false}
        ariaLabel="Aylık bakiye"
        options={{ plugins: { legend: { position: "bottom" } } }}
      />,
    );
    const canvas = screen.getByTestId("chart");
    expect(canvas.getAttribute("aria-label")).toBe("Aylık bakiye");
    expect((canvas.parentElement as HTMLElement).style.height).toBe("240px");
    expect((canvas.parentElement as HTMLElement).style.position).toBe("relative");
    const props = chartProps.last as { data: unknown; options: Record<string, unknown> };
    expect(props.data).toBe(barData);
    expect(props.options).toMatchObject({
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: "bottom" } },
    });
  });

  it("pasta grafiğe dilim renkleri", () => {
    render(
      <ZtoChart
        type="pie"
        data={{ labels: ["Kasa A", "Kasa B"], datasets: [{ data: [60, 40] }] }}
      />,
    );
    const props = chartProps.last as {
      data: { datasets: Array<Record<string, unknown>> };
      options: object;
    };
    expect(props.data.datasets[0].backgroundColor).toEqual([
      "hsl(0, 70%, 50%)",
      "hsl(137.5, 70%, 50%)",
    ]);
    expect(props.options).not.toHaveProperty("scales");
  });

  it("veri yoksa ZTO boş durum metni", () => {
    const { container, rerender } = render(<ZtoChart type="doughnut" data={{ datasets: [] }} />);
    expect(screen.queryByTestId("chart")).toBeNull();
    const empty = container.firstElementChild as HTMLElement;
    expect(empty.className).toBe("text-center text-muted py-4");
    expect(empty.textContent).toBe("Veri bulunamadı");
    rerender(
      <ZtoChart type="doughnut" data={{ datasets: [{ data: [] }] }} emptyText="Kayıt yok" />,
    );
    expect(container.textContent).toBe("Kayıt yok");
  });

  it("varsayılan dışa aktarım tembel yükleme içindir", () => {
    expect(LazyDefault).toBe(ZtoChart);
  });
});

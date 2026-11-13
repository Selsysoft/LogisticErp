import { Chart } from "chart.js";
import { describe, expect, it, vi } from "vitest";
import { registerCharts, ZTO_CHART_COMPONENTS } from "./registerCharts";

describe("registerCharts", () => {
  it("gereken parçaları bir kez kaydeder", () => {
    const spy = vi.spyOn(Chart, "register");
    expect(registerCharts()).toBe(Chart);
    expect(registerCharts()).toBe(Chart);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(...ZTO_CHART_COMPONENTS);
    spy.mockRestore();

    for (const type of ["bar", "line", "pie", "doughnut"]) {
      expect(Chart.registry.getController(type)).toBeDefined();
    }
    for (const element of ["bar", "line", "point", "arc"]) {
      expect(Chart.registry.getElement(element)).toBeDefined();
    }
    for (const scale of ["category", "linear"]) {
      expect(Chart.registry.getScale(scale)).toBeDefined();
    }
    for (const plugin of ["legend", "title", "tooltip", "filler"]) {
      expect(Chart.registry.getPlugin(plugin)).toBeDefined();
    }
  });
});

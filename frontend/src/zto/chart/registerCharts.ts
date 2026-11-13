import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

/** ZtoChart'ın desteklediği türlerin parçaları; "chart.js/auto" yerine yalnız bunlar pakete girer. */
export const ZTO_CHART_COMPONENTS = [
  BarController,
  LineController,
  PieController,
  DoughnutController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Title,
  Tooltip,
] as const;

let registered = false;

/** Chart.js parçalarını bir kez kaydeder; tekrar çağrı etkisizdir. */
export function registerCharts(): typeof Chart {
  if (!registered) {
    Chart.register(...ZTO_CHART_COMPONENTS);
    registered = true;
  }
  return Chart;
}

import type { ChartData, ChartOptions, Plugin } from "chart.js";
import { CSSProperties, useMemo } from "react";
import { Chart } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import {
  applyDefaultColors,
  buildChartOptions,
  isEmptyChartData,
  mergeOptions,
  ZtoChartType,
  ZtoLegendPosition,
  ZtoValueFormat,
} from "../chart/chartOptions";
import { registerCharts } from "../chart/registerCharts";

registerCharts();

export type { ZtoChartType, ZtoLegendPosition, ZtoValueFormat };

export interface ZtoChartProps<T extends ZtoChartType = ZtoChartType> {
  type: T;
  data: ChartData<T>;
  /** Grafiğin üstündeki başlık (chart.js title eklentisi). */
  title?: string;
  /** false gizler; varsayılan "top". */
  legend?: boolean | ZtoLegendPosition;
  /** Değer ekseni ve ipucu biçimi: "n2", "integer", "percent", { currency: "TRY" } ya da fonksiyon. */
  valueFormat?: ZtoValueFormat;
  stacked?: boolean;
  /** Yatay çubuk grafiği. */
  horizontal?: boolean;
  /** Piksel yükseklik; verilirse en-boy oranı korunmaz, grafik bu yüksekliği doldurur. */
  height?: number;
  /** Rengi olmayan veri kümelerine ZTO renkleri verilir (varsayılan true). */
  colorize?: boolean;
  /** Hazır ayarların üstüne derin birleştirilen chart.js seçenekleri. */
  options?: ChartOptions<T>;
  plugins?: Plugin<T>[];
  /** Ekran okuyucu metni; verilmezse başlık. */
  ariaLabel?: string;
  className?: string;
  /** Veri yokken gösterilecek metin; varsayılan "Veri bulunamadı". */
  emptyText?: string;
}

/**
 * chart.js 4 sarmalayıcısı (bar | line | pie | doughnut). Gereken parçalar registerCharts ile bir kez
 * kaydedilir; sayılar tr-TR biçimlenir. Varsayılan dışa aktarım React.lazy ile tembel yükleme içindir:
 * `lazy(() => import("../components/ZtoChart"))` — chart.js ana pakete girmez.
 */
export function ZtoChart<T extends ZtoChartType = ZtoChartType>({
  type,
  data,
  title,
  legend,
  valueFormat,
  stacked,
  horizontal,
  height,
  colorize = true,
  options,
  plugins,
  ariaLabel,
  className,
  emptyText,
}: ZtoChartProps<T>) {
  const { t } = useTranslation("ztoFinans");
  const chartData = useMemo(
    () => (colorize ? applyDefaultColors(type, data) : data),
    [colorize, type, data],
  );
  const chartOptions = useMemo(
    () =>
      mergeOptions(
        buildChartOptions({
          type,
          title,
          legend,
          valueFormat,
          stacked,
          horizontal,
          maintainAspectRatio: height === undefined,
        }),
        options,
      ) as ChartOptions<T>,
    [type, title, legend, valueFormat, stacked, horizontal, height, options],
  );

  if (isEmptyChartData(data)) {
    // Ad alanı önekli: anahtar ana ad alanında yok; locales.test taraması öneksizi orada arar.
    return (
      <div className="text-center text-muted py-4">{emptyText ?? t("ztoFinans:common.noData")}</div>
    );
  }

  const style: CSSProperties | undefined =
    height === undefined ? undefined : { position: "relative", height };
  const label = ariaLabel ?? title;
  return (
    <div className={className} style={style}>
      <Chart
        type={type}
        data={chartData}
        options={chartOptions}
        plugins={plugins}
        role="img"
        aria-label={label}
        fallbackContent={label}
      />
    </div>
  );
}

export default ZtoChart;

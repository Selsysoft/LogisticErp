// ZTO Finans ortak bileşenleri, biçim yardımcıları ve dışa aktarım API'si — tek giriş.
// Kullanım (yalnız .zto-finans kökü içindeki sayfalarda): import { ZtoDataTable, formatN2 } from "../components";
import { lazy } from "react";

export { ZtoBranchMultiSelect, type ZtoBranchMultiSelectProps } from "./ZtoBranchMultiSelect";
export { ZtoBranchSelect, type ZtoBranchSelectProps } from "./ZtoBranchSelect";
export {
  ZtoConfirmModal,
  useZtoConfirm,
  type ZtoConfirmModalProps,
  type ZtoConfirmOptions,
  type ZtoConfirmVariant,
} from "./ZtoConfirmModal";
export {
  ZtoDataTable,
  type ZtoButton,
  type ZtoButtonConfig,
  type ZtoButtonKind,
  type ZtoDataTableProps,
} from "./ZtoDataTable";
export { ZTO_DOM, type DataTableState, toPageRequest, pageRequestQuery } from "./dataTableLogic";
export {
  ZtoGroupStatChips,
  type ZtoGroupStat,
  type ZtoGroupStatChipsProps,
} from "./ZtoGroupStatChips";
export { buildStatGroups } from "./branchMultiSelectLogic";
export { ZtoModal, type ZtoModalProps, type ZtoModalSize } from "./ZtoModal";
export { ztoModalManager } from "./ztoModalManager";
export { ZtoPageHeader, type ZtoBreadcrumbItem, type ZtoPageHeaderProps } from "./ZtoPageHeader";
export {
  ZtoSelect,
  type ZtoSelectGroup,
  type ZtoSelectItem,
  type ZtoSelectOption,
  type ZtoSelectProps,
} from "./ZtoSelect";
export {
  ZtoPopover,
  ZtoTooltip,
  type ZtoPlacement,
  type ZtoPopoverProps,
  type ZtoTooltipProps,
} from "./ZtoTooltip";
export type { ZtoChartProps, ZtoChartType, ZtoLegendPosition, ZtoValueFormat } from "./ZtoChart";

/**
 * Grafik tembel yüklenir: chart.js (~200 KB) yalnız grafik çizen sayfada iner. Suspense içinde kullanın.
 * ZtoChart doğrudan buradan dışa verilmez; modülü chart.js kaydını (registerCharts) yan etki olarak yapar.
 */
export const ZtoChartLazy = lazy(() => import("./ZtoChart"));

export {
  currencySymbol,
  formatAmount,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyValue,
  formatN2,
  formatNumber,
  parseTrNumber,
  toIsoDate,
  toNumber,
} from "../format";

export {
  copyRowsAsTsv,
  exportExcel,
  exportPdf,
  printTable,
  type ExcelExportOptions,
  type PdfExportOptions,
  type PdfOrientation,
  type PrintOptions,
} from "../export";

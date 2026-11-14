// ZTO Finans ortak bileşenleri, biçim yardımcıları ve dışa aktarım API'si — tek giriş.
// Kullanım (yalnız .zto-finans kökü içindeki sayfalarda): import { ZtoDataTable, formatN2 } from "../components";
import { lazy } from "react";

export { ZtoAccessDenied } from "./ZtoAccessDenied";
export {
  ZtoAccountSearch,
  type AccountSearchHit,
  type ZtoAccountSearchProps,
} from "./ZtoAccountSearch";
export {
  AT_FILTER_SEARCH_IDS,
  AT_HEADER_SEARCH_IDS,
  CT_TARGET_SEARCH_IDS,
  QCA_SEARCH_IDS,
  TX_SEARCH_IDS,
  groupIcon,
  highlightParts,
  type AccountSearchIds,
  type AccountSearchVariant,
} from "./accountSearchLogic";
export { ZtoAlert, type ZtoAlertProps } from "./ZtoAlert";
export { ZtoAuditCell, type ZtoAuditCellProps, type ZtoAuditInfo } from "./ZtoAuditCell";
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
export {
  ZtoDefinitionBreadcrumb,
  type ZtoDefinitionBreadcrumbProps,
  type ZtoDefinitionCrumb,
} from "./ZtoDefinitionBreadcrumb";
export {
  ZtoDefinitionDetailsModal,
  type ZtoDefinitionDetailsModalProps,
  type ZtoDefinitionField,
} from "./ZtoDefinitionDetailsModal";
export type { DefinitionEntityKey, DefinitionHistoryEntry } from "./definitionLogic";
export { ZtoDefinitionListCard, type ZtoDefinitionListCardProps } from "./ZtoDefinitionListCard";
export {
  ZtoDefinitionRowActions,
  type ZtoDefinitionRowActionsProps,
  type ZtoDefinitionRowToggle,
} from "./ZtoDefinitionRowActions";
export { ZtoRequirePermission, type ZtoRequirePermissionProps } from "./ZtoRequirePermission";
export {
  ZTO_DOM,
  type DataTableLanguage,
  type DataTableState,
  type PageDecoration,
  toPageRequest,
  pageRequestQuery,
} from "./dataTableLogic";
export {
  ZtoGroupStatChips,
  type ZtoGroupStat,
  type ZtoGroupStatChipsProps,
} from "./ZtoGroupStatChips";
export { buildStatGroups } from "./branchMultiSelectLogic";
export { ZtoModal, type ZtoModalProps, type ZtoModalSize } from "./ZtoModal";
export { ztoModalManager } from "./ztoModalManager";
export { ZtoPageHeader, type ZtoBreadcrumbItem, type ZtoPageHeaderProps } from "./ZtoPageHeader";
export { ZtoSnackbarProvider, useZtoSnackbar, type ZtoSnackbarApi } from "./ZtoSnackbar";
export { type SnackbarKind } from "./snackbarLogic";
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
export {
  ZtoSearchableSelect,
  type SearchableGroup,
  type SearchableItem,
  type SearchableOption,
  type ZtoSearchableSelectProps,
} from "./ZtoSearchableSelect";
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

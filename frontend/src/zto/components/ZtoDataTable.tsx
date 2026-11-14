import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Header,
  type Row,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table";
import {
  CSSProperties,
  Fragment,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { copyRowsAsTsv } from "../export/copy";
import { toExportCell, type ExportCell } from "../export/cells";
import { exportExcel } from "../export/excel";
import { exportPdf, type PdfOrientation } from "../export/pdf";
import { printTable } from "../export/print";
import { useZtoOverlayContainer } from "../ZtoPortalContext";
import {
  BOOTSTRAP4_DOM,
  ZTO_DOM,
  clampStart,
  compareValues,
  defaultOrder,
  domSlotKey,
  headerText,
  infoParts,
  interleaveDecorations,
  languageInfoText,
  matchesSearch,
  pageButtonViews,
  pageInfo,
  parseDom,
  pickExportColumns,
  smartSearchTerms,
  splitLengthMenu,
  startAfterLengthChange,
  searchTextOf,
  type ColumnDefLike,
  type DataTableLanguage,
  type DataTableState,
  type DomFeature,
  type DomNode,
  type PageDecoration,
  type PagingType,
  type SortItem,
} from "./dataTableLogic";

export type ZtoButtonKind = "copy" | "excel" | "pdf" | "print";

/** DataTables Buttons yapılandırmasının karşılığı ({ extend, text, className, title }). */
export type ZtoButtonConfig = {
  extend: ZtoButtonKind;
  /** ZTO: <><i className="fa fa-copy" /> Kopyala</>; verilmezse Türkçe varsayılan. */
  text?: ReactNode;
  /** Varsayılan sınıfa eklenir (ZTO: "btn btn-grey rounded"). */
  className?: string;
  /** Bu düğme için dışa aktarım başlığı. */
  title?: string;
};

export type ZtoButton = ZtoButtonKind | ZtoButtonConfig;

export type ZtoDataTableProps<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TanStack sütun değer tipleri karışık
  columns: ColumnDef<T, any>[];
  data: T[];
  /** table id'si; özellik öğeleri `${id}_wrapper`, `${id}_info` … olur. Verilmezse üretilir. */
  id?: string;
  /**
   * DataTables "dom". Varsayılan: düğme varsa "Bfrtip" (ZTO'daki düğmeli listelerin çoğu), yoksa
   * dataTables.bootstrap4 grid düzeni. Hazır değerler: ZTO_DOM.
   */
  dom?: string;
  /** Sayfa uzunluğu; -1 tümü. */
  pageLength?: number;
  /** Uzunluk seçenekleri; -1 "Tümü". */
  lengthMenu?: number[];
  pagingType?: PagingType;
  /** Başlangıç sıralaması; verilmezse ilk sütun artan (DataTables order [[0,'asc']]). [] sırasız. */
  order?: SortItem[];
  /** DataTables "searching". */
  searchable?: boolean;
  /** DataTables "paging". */
  paging?: boolean;
  /** DataTables "info". */
  info?: boolean;
  /** DataTables "lengthChange". */
  lengthChange?: boolean;
  /** DataTables "ordering". */
  ordering?: boolean;
  buttons?: ZtoButton[];
  /**
   * "dataTables": Buttons 2.2.2 + buttons.dataTables.css (ZTO _Layout): div.dt-buttons > button.dt-button.
   * "bootstrap4": buttons.bootstrap4 düzeni: div.dt-buttons.btn-group.flex-wrap > button.btn.btn-secondary.
   */
  buttonsStyle?: "dataTables" | "bootstrap4";
  exportTitle?: string;
  /** Excel/PDF dosya adı (uzantısız olabilir); verilmezse exportTitle. */
  fileName?: string;
  /** ZTO exportOptions.columns ':not(:last-child)' (işlem sütunu). */
  exportExcludeLastColumn?: boolean;
  pdfOrientation?: PdfOrientation;
  /** Sarmalayıcıya (div.dataTables_wrapper) ek sınıf. */
  className?: string;
  /** Tablonun kendi sınıfları; "dataTable" ve "no-footer" eklenir. */
  tableClassName?: string;
  tableStyle?: CSSProperties;
  /** Hiç veri yokken gösterilen metin (sEmptyTable). */
  emptyText?: ReactNode;
  rowClassName?: (row: T, index: number) => string | undefined;
  onRowClick?: (row: T, event: MouseEvent<HTMLTableRowElement>) => void;
  getRowId?: (row: T, index: number) => string;
  /** Verilirse "r" öğesi (div.dataTables_processing) çizilir; true iken görünür. */
  processing?: boolean;
  /** tfoot içeriği (tr öğeleri). Verilmezse sütunların footer tanımları kullanılır. */
  footer?: ReactNode;
  /** Sunucu taraflı mod: data yalnız geçerli sayfa; sıralama/arama/sayfa onStateChange ile istenir. */
  manualPagination?: boolean;
  /** Sunucu taraflı: toplam kayıt (recordsTotal). */
  recordsTotal?: number;
  /** Sunucu taraflı: arama sonrası kayıt (recordsFiltered); verilmezse recordsTotal. */
  recordsFiltered?: number;
  /** Durum her değiştiğinde (ilk çizimde de) çağrılır; toPageRequest ile Page<T> sorgusuna çevrilir. */
  onStateChange?: (state: DataTableState) => void;
  /** Arama gecikmesi (ms); varsayılan istemci 0, sunucu 400 (DataTables searchDelay). */
  searchDelay?: number;
  /**
   * Arama kutusunun placeholder'ı ve aria-label'ı (ZTO introduction-details.js:425-427 tanım
   * listelerinde "Listede ara..." yazar). Verilmezse placeholder boş, aria-label yok.
   */
  searchPlaceholder?: string;
  /** Sayfa uzunluğu select'inin aria-label'ı (introduction-details.js:429-431). */
  lengthAriaLabel?: string;
  /**
   * true: her gövde td'sine sütun başlığının metni data-label olarak yazılır
   * (introduction-details.js:398; definition-list.css dar ekranda td::before ile gösterir).
   */
  cellDataLabel?: boolean;
  /** table öğesine data-* nitelikleri (ör. { "data-definition-density": "standard" }). */
  tableDataAttributes?: Record<`data-${string}`, string>;
  /**
   * Sayfanın DataTables "language" metinleri (DataTables yer tutucularıyla; ör. AllTransactions
   * "Göster _MENU_ kayıt"). Verilmeyen anahtar ztoFinans:table.* metnine düşer.
   */
  language?: DataTableLanguage;
  /**
   * `dom` kaplarına React içeriği: anahtar kabın id'si ya da sınıflarından biri (ZTO
   * `$('.dt-toggle-col').html(...)`, ör. CAI "Alacaklı Cariler" ve #totalsModeToggle).
   */
  domSlots?: Record<string, ReactNode>;
  /**
   * Geçerli sayfanın satırları arasına veriden bağımsız `tr` ekler (ZTO drawCallback; sezon/açılış
   * işaretçi satırları). `node` tam bir `<tr>` olmalı (genişlik `ctx.columnsCount`). Süsler sıralamaya,
   * aramaya, sayfalamaya ve bilgi sayılarına katılmaz; sayfa değişince yeniden hesaplanır.
   */
  pageDecorator?: (
    pageRows: T[],
    ctx: { sorting: SortingState; columnsCount: number },
  ) => Array<PageDecoration<ReactNode>>;
};

const BUTTON_CLASSES: Record<ZtoButtonKind, string> = {
  copy: "buttons-copy buttons-html5",
  excel: "buttons-excel buttons-html5",
  pdf: "buttons-pdf buttons-html5",
  print: "buttons-print",
};

const DEFAULT_LENGTH_MENU = [10, 25, 50, 100];

/** Metin sütunları Türkçe harf sırası, boşlar başta (bkz. compareValues). */
function ztoSortingFn<T>(): SortingFn<T> {
  return (a, b, columnId) => compareValues(a.getValue(columnId), b.getValue(columnId));
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function columnHeaderText<T>(column: Column<T, unknown>): string {
  return headerText(column.columnDef.header, column.columnDef.meta?.exportHeader, column.id);
}

function cellExportValue<T>(row: Row<T>, column: Column<T, unknown>): ExportCell {
  const meta = column.columnDef.meta;
  if (meta?.exportValue) return meta.exportValue(row.original);
  return column.accessorFn ? toExportCell(row.getValue(column.id)) : "";
}

function cellSearchText<T>(row: Row<T>, column: Column<T, unknown>): string {
  const meta = column.columnDef.meta;
  const value = column.accessorFn ? row.getValue(column.id) : undefined;
  if (meta?.searchValue) return meta.searchValue(value, row.original);
  if (meta?.exportValue) return searchTextOf(meta.exportValue(row.original));
  return searchTextOf(value);
}

/**
 * DataTables 1.10.20 + dataTables.bootstrap4 + Buttons 2.2.2 görünümlü tablo (ZTO listeleri).
 * Başsız @tanstack/react-table v8 üzerine kurulu; işaretleme ve sınıflar DataTables'ın ürettiği DOM ile
 * aynıdır, böylece kopyalanan dataTables.bootstrap4 / buttons CSS'i doğrudan uygulanır.
 */
export function ZtoDataTable<T>({
  columns,
  data,
  id,
  dom,
  pageLength = 10,
  lengthMenu = DEFAULT_LENGTH_MENU,
  pagingType = "simple_numbers",
  order,
  searchable = true,
  paging = true,
  info = true,
  lengthChange = true,
  ordering = true,
  buttons,
  buttonsStyle = "dataTables",
  exportTitle,
  fileName,
  exportExcludeLastColumn = false,
  pdfOrientation,
  className,
  tableClassName = "table table-bordered",
  tableStyle,
  emptyText,
  rowClassName,
  onRowClick,
  getRowId,
  processing,
  footer,
  manualPagination = false,
  recordsTotal,
  recordsFiltered,
  onStateChange,
  searchDelay,
  searchPlaceholder,
  lengthAriaLabel,
  cellDataLabel = false,
  tableDataAttributes,
  language,
  domSlots,
  pageDecorator,
}: ZtoDataTableProps<T>) {
  const { t } = useTranslation("ztoFinans");
  const portal = useZtoOverlayContainer();
  const autoId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const tableId = id ?? `ztoDataTable${autoId}`;
  const manual = manualPagination;

  const [sorting, setSorting] = useState<SortingState>(() =>
    ordering ? (order ?? defaultOrder(columns as ColumnDefLike[])) : [],
  );
  const [length, setLength] = useState(pageLength);
  const [start, setStart] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<ZtoButtonKind | null>(null);
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout>>();

  const table = useReactTable<T>({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
      setStart(0);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: manual,
    enableSorting: ordering,
    // DataTables artan → azalan → artan döner; sırasız duruma dönmez, ilk tık her zaman artan.
    enableSortingRemoval: false,
    sortDescFirst: false,
    defaultColumn: { sortingFn: ztoSortingFn<T>(), sortUndefined: false },
    getRowId,
  });

  const sortedRows = table.getSortedRowModel().rows;
  const terms = useMemo(() => smartSearchTerms(search), [search]);
  const filteredRows = useMemo(() => {
    if (manual || terms.length === 0) return sortedRows;
    const searchColumns = table
      .getAllLeafColumns()
      .filter(
        (c) =>
          c.columnDef.meta?.searchable !== false &&
          (c.accessorFn || c.columnDef.meta?.searchValue || c.columnDef.meta?.exportValue),
      );
    return sortedRows.filter((row) =>
      matchesSearch(searchColumns.map((c) => cellSearchText(row, c)).join("  "), terms),
    );
  }, [manual, terms, sortedRows, table]);

  const effectiveLength = paging ? length : -1;
  const max = manual ? (recordsTotal ?? data.length) : data.length;
  const total = manual ? (recordsFiltered ?? recordsTotal ?? data.length) : filteredRows.length;
  const safeStart = manual ? start : clampStart(start, effectiveLength, total);
  const page = pageInfo(safeStart, effectiveLength, total);
  const pageRows = manual ? sortedRows : filteredRows.slice(page.start, page.end);

  // Arama: istemcide anında, sunucuda gecikmeli (DataTables searchDelay).
  const delay = searchDelay ?? (manual ? 400 : 0);
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setStart(0);
    }, delay);
    return () => clearTimeout(timer);
  }, [searchInput, search, delay]);

  // Durum bildirimi (sunucu taraflı istek ya da kalıcılık).
  const stateCallback = useRef(onStateChange);
  stateCallback.current = onStateChange;
  useEffect(() => {
    stateCallback.current?.({ start: safeStart, length: effectiveLength, search, sorting });
  }, [safeStart, effectiveLength, search, sorting]);

  useEffect(() => () => clearTimeout(messageTimer.current), []);

  function showMessage(title: string, text: string, timeout = 2000) {
    clearTimeout(messageTimer.current);
    setMessage({ title, text });
    messageTimer.current = setTimeout(() => setMessage(null), timeout);
  }

  function exportData() {
    const columnsToExport = pickExportColumns(
      table.getVisibleLeafColumns(),
      exportExcludeLastColumn,
      (c) => c.columnDef.meta?.exportable !== false,
    );
    return {
      headers: columnsToExport.map((c) => columnHeaderText(c)),
      rows: filteredRows.map((row) => columnsToExport.map((c) => cellExportValue(row, c))),
    };
  }

  async function runButton(button: ZtoButtonConfig) {
    const kind = button.extend;
    const title = button.title ?? exportTitle;
    const { headers, rows } = exportData();
    setBusy(kind);
    try {
      if (kind === "copy") {
        await copyRowsAsTsv(headers, rows, { title });
        showMessage(
          t("table.buttons.copyTitle"),
          t("table.buttons.copySuccess", { count: rows.length }),
        );
      } else if (kind === "excel") {
        await exportExcel({ title, headers, rows, fileName });
      } else if (kind === "pdf") {
        await exportPdf({ title, headers, rows, fileName, orientation: pdfOrientation });
      } else if (!printTable({ title, headers, rows })) {
        showMessage(t("table.buttons.print"), t("export.printBlocked"), 4000);
      }
    } catch {
      showMessage(
        t(`table.buttons.${kind === "copy" ? "copyTitle" : kind}`),
        t(kind === "copy" ? "export.copyFailed" : "export.exportFailed"),
        4000,
      );
    } finally {
      setBusy(null);
    }
  }

  function changeLength(next: number) {
    if (!Number.isInteger(next) || next === 0 || next < -1) return;
    setLength(next);
    setStart(startAfterLengthChange(safeStart, next, total));
  }

  function goToPage(target: number) {
    if (effectiveLength === -1) return;
    setStart(target * effectiveLength);
  }

  const lengthMenuText = language?.lengthMenu
    ? splitLengthMenu(language.lengthMenu)
    : { before: t("table.lengthMenuBefore"), after: t("table.lengthMenuAfter") };
  const headerGroups = table.getHeaderGroups();
  const leafCount = table.getVisibleLeafColumns().length;
  const footerGroup = table.getFooterGroups()[0];
  const columnFooters =
    footerGroup?.headers.some((h) => !h.isPlaceholder && h.column.columnDef.footer !== undefined) ??
    false;
  const hasFooter = footer !== undefined || columnFooters;
  const hasButtons = (buttons?.length ?? 0) > 0;
  const nodes = useMemo(
    () => parseDom(dom ?? (hasButtons ? ZTO_DOM.buttons : BOOTSTRAP4_DOM)),
    [dom, hasButtons],
  );

  // DataTables yalnız her özelliğin ilk örneğine kimlik verir (aanFeatures).
  const seen = new Set<DomFeature>();
  function featureId(feature: DomFeature, suffix: string): string | undefined {
    if (seen.has(feature)) return undefined;
    seen.add(feature);
    return `${tableId}_${suffix}`;
  }

  function renderSortableHeader(header: Header<T, unknown>) {
    const column = header.column;
    const meta = column.columnDef.meta;
    const title = columnHeaderText(column);
    const content = header.isPlaceholder
      ? null
      : flexRender(column.columnDef.header, header.getContext());
    const isLeaf = header.subHeaders.length === 0 && !header.isPlaceholder;
    // key yayılımla verilmez (React uyarısı); her th ayrıca key={header.id} alır.
    const common = {
      colSpan: header.colSpan,
      rowSpan: 1,
    };
    if (!ordering || !isLeaf) {
      return (
        <th
          key={header.id}
          {...common}
          className={cx(meta?.className, meta?.headerClassName) || undefined}
        >
          {content}
        </th>
      );
    }
    if (!column.getCanSort()) {
      return (
        <th
          key={header.id}
          {...common}
          className={cx("sorting_disabled", meta?.className, meta?.headerClassName)}
          aria-label={title}
        >
          {content}
        </th>
      );
    }
    const sorted = column.getIsSorted();
    const primary = sorting.length > 0 && sorting[0].id === column.id;
    // _fnSortAria: bir sonraki tıklamanın yönü okunur (artan → azalan → artan).
    const nextAsc = !primary || sorted === "desc";
    const toggle = column.getToggleSortingHandler();
    return (
      <th
        key={header.id}
        {...common}
        className={cx(
          sorted === "asc" ? "sorting_asc" : sorted === "desc" ? "sorting_desc" : "sorting",
          meta?.className,
          meta?.headerClassName,
        )}
        tabIndex={0}
        aria-controls={tableId}
        aria-sort={primary ? (sorted === "desc" ? "descending" : "ascending") : undefined}
        aria-label={title + t(nextAsc ? "table.aria.sortAscending" : "table.aria.sortDescending")}
        onClick={toggle}
        onKeyDown={(e: KeyboardEvent<HTMLTableCellElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            toggle?.(e);
          }
        }}
      >
        {content}
      </th>
    );
  }

  function renderBody() {
    if (pageRows.length === 0) {
      const text =
        processing && max === 0
          ? t("table.loadingRecords")
          : max === 0
            ? (emptyText ?? language?.emptyTable ?? t("table.emptyTable"))
            : (language?.zeroRecords ?? t("table.zeroRecords"));
      return (
        <tr className="odd">
          <td valign="top" colSpan={leafCount} className="dataTables_empty">
            {text}
          </td>
        </tr>
      );
    }
    const decorations = pageDecorator
      ? pageDecorator(
          pageRows.map((row) => row.original),
          { sorting, columnsCount: leafCount },
        )
      : [];
    if (decorations.length === 0) {
      return pageRows.map((row, index) => renderRow(row, index));
    }
    return interleaveDecorations(pageRows.length, decorations).map((item) =>
      item.kind === "row" ? (
        renderRow(pageRows[item.index], item.index)
      ) : (
        <Fragment key={`decoration-${item.key}`}>{item.node}</Fragment>
      ),
    );
  }

  function renderRow(row: Row<T>, index: number) {
    return (
      <tr
        key={row.id}
        role="row"
        className={cx(index % 2 === 0 ? "odd" : "even", rowClassName?.(row.original, index))}
        onClick={onRowClick ? (e) => onRowClick(row.original, e) : undefined}
      >
        {row.getVisibleCells().map((cell) => {
          const sortIndex = ordering ? cell.column.getSortIndex() : -1;
          const meta = cell.column.columnDef.meta;
          return (
            <td
              key={cell.id}
              className={
                cx(
                  meta?.className,
                  meta?.cellClassName,
                  sortIndex >= 0 && `sorting_${Math.min(sortIndex + 1, 3)}`,
                ) || undefined
              }
              data-label={cellDataLabel ? columnHeaderText(cell.column).trim() : undefined}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          );
        })}
      </tr>
    );
  }

  function renderTable(key: string) {
    return (
      <table
        key={key}
        id={tableId}
        className={cx(tableClassName, "dataTable", !hasFooter && "no-footer")}
        role="grid"
        aria-describedby={info ? `${tableId}_info` : undefined}
        style={tableStyle}
        {...tableDataAttributes}
      >
        <thead>
          {headerGroups.map((group) => (
            <tr key={group.id} role="row">
              {group.headers.map((header) => renderSortableHeader(header))}
            </tr>
          ))}
        </thead>
        <tbody>{renderBody()}</tbody>
        {hasFooter && (
          <tfoot>
            {footer ?? (
              <tr>
                {footerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    rowSpan={1}
                    className={header.column.columnDef.meta?.className}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.footer, header.getContext())}
                  </th>
                ))}
              </tr>
            )}
          </tfoot>
        )}
      </table>
    );
  }

  function renderButtons(key: string) {
    const bootstrap = buttonsStyle === "bootstrap4";
    return (
      <div key={key} className={bootstrap ? "dt-buttons btn-group flex-wrap" : "dt-buttons"}>
        {(buttons ?? []).map((b, index) => {
          const config: ZtoButtonConfig = typeof b === "string" ? { extend: b } : b;
          const kind = config.extend;
          return (
            <button
              key={`${kind}-${index}`}
              className={cx(
                bootstrap ? "btn btn-secondary" : "dt-button",
                BUTTON_CLASSES[kind],
                config.className,
                busy === kind && "processing",
              )}
              tabIndex={0}
              aria-controls={tableId}
              type="button"
              disabled={busy !== null}
              onClick={() => void runButton(config)}
            >
              <span>{config.text ?? t(`table.buttons.${kind}`)}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderFeature(feature: DomFeature, key: string): ReactNode {
    switch (feature) {
      case "l":
        if (!paging || !lengthChange) return null;
        return (
          <div key={key} className="dataTables_length" id={featureId("l", "length")}>
            <label>
              {`${lengthMenuText.before} `}
              <select
                name={`${tableId}_length`}
                aria-controls={tableId}
                className="custom-select custom-select-sm form-control form-control-sm"
                aria-label={lengthAriaLabel}
                value={length}
                onChange={(e) => changeLength(Number(e.target.value))}
              >
                {lengthMenu.map((n) => (
                  <option key={n} value={n}>
                    {n === -1 ? t("table.lengthAll") : n}
                  </option>
                ))}
              </select>
              {lengthMenuText.after !== "" && ` ${lengthMenuText.after}`}
            </label>
          </div>
        );
      case "f":
        if (!searchable) return null;
        return (
          <div key={key} id={featureId("f", "filter")} className="dataTables_filter">
            <label>
              {language?.search ?? t("table.search")}
              <input
                type="search"
                className="form-control form-control-sm"
                placeholder={searchPlaceholder ?? ""}
                aria-label={searchPlaceholder}
                aria-controls={tableId}
                value={searchInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchInput(value);
                  if (delay <= 0) {
                    setSearch(value);
                    setStart(0);
                  }
                }}
              />
            </label>
          </div>
        );
      case "r":
        if (processing === undefined) return null;
        return (
          <div
            key={key}
            id={featureId("r", "processing")}
            className="dataTables_processing card"
            style={{ display: processing ? "block" : "none" }}
          >
            {t("table.processing")}
          </div>
        );
      case "t":
        return renderTable(key);
      case "i": {
        if (!info) return null;
        const parts = infoParts(page.start, page.end, total, max);
        return (
          <div
            key={key}
            className="dataTables_info"
            id={featureId("i", "info")}
            role="status"
            aria-live="polite"
          >
            {languageInfoText(parts, language, (k, values) => t(k, values))}
          </div>
        );
      }
      case "p": {
        if (!paging) return null;
        const first = !seen.has("p");
        const views = pageButtonViews(pagingType, page.page, page.pages);
        return (
          <div
            key={key}
            className={`dataTables_paginate paging_${pagingType}`}
            id={featureId("p", "paginate")}
          >
            <ul className="pagination">
              {views.map((view, index) => (
                <li
                  key={view.key}
                  className={view.className}
                  id={
                    first && typeof view.button === "string"
                      ? `${tableId}_${view.button}`
                      : undefined
                  }
                >
                  <a
                    href="#"
                    aria-controls={tableId}
                    data-dt-idx={index}
                    tabIndex={view.disabled ? -1 : 0}
                    className="page-link"
                    onClick={(e) => {
                      e.preventDefault();
                      if (view.target !== null) goToPage(view.target);
                    }}
                  >
                    {typeof view.button === "number"
                      ? view.button + 1
                      : view.button === "ellipsis"
                        ? "…"
                        : t(`table.paginate.${view.button}`)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      }
      case "B":
        return hasButtons ? renderButtons(key) : null;
    }
  }

  function renderNodes(list: DomNode[], prefix: string): ReactNode[] {
    return list.map((node, index) => {
      const key = `${prefix}${index}`;
      if (node.kind === "feature") return renderFeature(node.feature, key);
      const slot = domSlotKey(node, domSlots);
      return (
        <div key={key} id={node.id} className={node.className}>
          {renderNodes(node.children, `${key}-`)}
          {slot !== undefined && domSlots?.[slot]}
        </div>
      );
    });
  }

  const overlay = message && (
    <div
      className="dt-button-info"
      role="status"
      aria-live="polite"
      onClick={() => setMessage(null)}
    >
      <h2>{message.title}</h2>
      <div>{message.text}</div>
    </div>
  );

  return (
    <div
      id={`${tableId}_wrapper`}
      className={cx("dataTables_wrapper dt-bootstrap4", !hasFooter && "no-footer", className)}
    >
      {renderNodes(nodes, "n")}
      {overlay && (portal ? createPortal(overlay, portal) : overlay)}
    </div>
  );
}

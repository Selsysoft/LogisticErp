import {
  CSSProperties,
  Fragment,
  ReactNode,
  useDeferredValue,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  clampPage,
  filterRows,
  infoRange,
  pageCount,
  pageRows,
  pageWindow,
  parsePageSize,
  RCP_PAGE_SIZES,
  type RcpPageSize,
} from "./rcpTableLogic";

/** Tablo satırı: `text` arama metni (ZTO `textContent`), `node` çizilecek `<tr>`. */
export type ZtoRcpTableRow = { key: string; text: string; node: ReactNode };

export type ZtoRcpTableProps = {
  /** Tablonun id'si (ZTO `rcpDtInit('fxTable')`). */
  id: string;
  /** Tablo sınıfları (ör. "table table-bordered table-hover fx-phone-card-table"). */
  tableClassName: string;
  tableStyle?: CSSProperties;
  /** `<thead>` öğesi. */
  head: ReactNode;
  rows: readonly ZtoRcpTableRow[];
  /** Sayfanın kendi tek hücreli colspan boş satırı (ZTO `hasOwnEmpty`); verilirse dokunulmaz. */
  emptyRow?: ReactNode;
  /** İsteğe bağlı `<tfoot>`. */
  foot?: ReactNode;
  /** Varsayılan 10 (ZTO). */
  initialSize?: RcpPageSize;
  /** Sütun sayısı (yerleşik boş satırın colspan'ı); verilmezse `<thead>`'in ilk satırından okunur. */
  columnCount?: number;
  /**
   * Kaydırma alanının erişilebilir adı (MWG `responsive-table`): verilirse `.table-responsive`
   * `role="region"` + `tabIndex=0` alır (klavyeyle yatay kaydırma). Görünüm değişmez.
   */
  label?: string;
  /**
   * Veri kümesi değiştiğinde (ör. yeni süzgeç uygulandığında) değişir; yalnız sayfa 1'e döner, arama ve
   * sayfa boyutu korunur (ZTO'da süzgeç sayfayı yeniden yükler, `rcpDtInit` page=1 ile başlar). Aynı
   * süzgeçle yeniden sorguda (kur getirme, Kes sonrası) değiştirilmez; sayfa korunur ve kırpılır.
   */
  resetKey?: string;
};

const EMPTY_CELL_STYLE: CSSProperties = {
  padding: "28px 10px",
  textAlign: "center",
  borderBottom: 0,
};
const EMPTY_BOX_STYLE: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 7,
};
const EMPTY_ICON_WRAP_STYLE: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: "50%",
  background: "#f1f5f9",
  border: "1px dashed #cbd5e1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const EMPTY_ICON_STYLE: CSSProperties = { fontSize: 20, color: "#94a3b8" };
const EMPTY_TITLE_STYLE: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: "#475569" };
const EMPTY_HINT_STYLE: CSSProperties = { fontSize: 11, color: "#94a3b8" };

/**
 * ZTO reçeteli tablo aracı (`wwwroot/js/recipe-table.js` `rcpDtInit`; 12.8 §5.3a, Rev 1
 * FE-RCPDT-TABLE). Kur Farkı Raporu ve Nakit Akış bunu kullanır (`ZtoDataTable` değil): DOM birebir —
 * `.table-responsive`'in önünde `div.rcpdt-bar.no-print` (Sayfada göster + Ara), arkasında
 * `div.rcpdt-foot.no-print` (özet + numaralı sayfalama); tabloya `dataTable` sınıfı eklenmez.
 * Arama sayfa 1'e döner; arama metni ertelenmiş değerle süzülür (yazarken INP).
 */
export function ZtoRcpTable({
  id,
  tableClassName,
  tableStyle,
  head,
  rows,
  emptyRow,
  foot,
  initialSize = 10,
  columnCount,
  label,
  resetKey,
}: ZtoRcpTableProps) {
  const { t } = useTranslation("ztoFinans");
  const [size, setSize] = useState<RcpPageSize>(initialSize);
  const [page, setPage] = useState(1);
  // Süzgeç değişince sayfa 1 (props'tan türetilen durum, render sırasında; eski sayfa bir an görünmez).
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (resetKey !== seenResetKey) {
    setSeenResetKey(resetKey);
    setPage(1);
  }
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const tableRef = useRef<HTMLTableElement>(null);
  const [measuredColumns, setMeasuredColumns] = useState(1);

  useLayoutEffect(() => {
    const cells = tableRef.current?.tHead?.rows[0]?.cells.length;
    if (cells) setMeasuredColumns(cells);
  }, [head]);

  const visible = filterRows(rows, deferredQuery);
  const total = visible.length;
  const pages = pageCount(total, size);
  const current = clampPage(page, pages);
  const shown = pageRows(visible, current, size);
  const range = infoRange(total, current, size);
  const hasOwnEmpty = emptyRow !== undefined && emptyRow !== null && emptyRow !== false;
  const filtered = rows.length > 0;

  const go = (target: number) => setPage(clampPage(target, pages));

  return (
    <>
      <div className="rcpdt-bar no-print">
        <div className="rcpdt-size">
          {`${t("table.rcp.show")} `}
          <select
            className="form-control form-control-sm no-select2"
            aria-label={t("table.rcp.sizeLabel")}
            aria-controls={id}
            value={String(size)}
            onChange={(event) => {
              setSize(parsePageSize(event.target.value));
              setPage(1);
            }}
          >
            {RCP_PAGE_SIZES.map((n) => (
              <option key={n} value={String(n)}>
                {n === 0 ? t("table.rcp.all") : n}
              </option>
            ))}
          </select>
          {` ${t("table.rcp.records")}`}
        </div>
        <div className="rcpdt-search">
          {`${t("table.rcp.search")} `}
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder={t("table.rcp.placeholder")}
            aria-label={t("table.rcp.searchLabel")}
            aria-controls={id}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      <div
        className="table-responsive"
        {...(label ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
      >
        <table id={id} className={tableClassName} style={tableStyle} ref={tableRef}>
          {head}
          <tbody>
            {shown.map((row) => (
              <Fragment key={row.key}>{row.node}</Fragment>
            ))}
            {hasOwnEmpty && emptyRow}
            {total === 0 && !hasOwnEmpty && (
              <tr className="rcpdt-empty-row">
                <td colSpan={columnCount ?? measuredColumns} style={EMPTY_CELL_STYLE}>
                  <div style={EMPTY_BOX_STYLE}>
                    <div style={EMPTY_ICON_WRAP_STYLE}>
                      <i
                        className={`fas ${filtered ? "fa-search" : "fa-inbox"}`}
                        style={EMPTY_ICON_STYLE}
                        aria-hidden="true"
                      />
                    </div>
                    <div style={EMPTY_TITLE_STYLE}>{t("table.rcp.notFound")}</div>
                    <div style={EMPTY_HINT_STYLE}>
                      {filtered ? t("table.rcp.emptyFilterHint") : t("table.rcp.emptyHint")}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {foot}
        </table>
      </div>
      <div className="rcpdt-foot no-print">
        <span className="rcpdt-info" aria-live="polite">
          {total > 0 ? (
            <>
              {`${t("table.rcp.infoTotal")} `}
              <b>{total}</b>
              {` ${t("table.rcp.infoFrom")} `}
              <b>{`${range.start}-${range.end}`}</b>
              {` ${t("table.rcp.infoShowing")}`}
            </>
          ) : hasOwnEmpty ? (
            t("table.rcp.notFound")
          ) : null}
        </span>
        {pages > 1 && (
          <ul className="rcpdt-pg">
            <li>
              <button
                type="button"
                className="rcpdt-btn"
                disabled={current <= 1}
                aria-label={t("table.rcp.previous")}
                onClick={() => go(current - 1)}
              >
                ‹
              </button>
            </li>
            {pageWindow(current, pages).map((item, index) =>
              item === "dots" ? (
                <li key={`dots-${index}`} className="rcpdt-dots" aria-hidden="true">
                  …
                </li>
              ) : (
                <li key={item}>
                  <button
                    type="button"
                    className={item === current ? "rcpdt-btn rcpdt-active" : "rcpdt-btn"}
                    aria-label={t("table.rcp.pageLabel", { page: item })}
                    aria-current={item === current ? "page" : undefined}
                    onClick={() => go(item)}
                  >
                    {item}
                  </button>
                </li>
              ),
            )}
            <li>
              <button
                type="button"
                className="rcpdt-btn"
                disabled={current >= pages}
                aria-label={t("table.rcp.next")}
                onClick={() => go(current + 1)}
              >
                ›
              </button>
            </li>
          </ul>
        )}
      </div>
    </>
  );
}

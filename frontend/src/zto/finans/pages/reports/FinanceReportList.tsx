import { CSSProperties, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { LedgerAccounts, LedgerAccountRow } from "../../../../pages/finance/types";
import { cmpDec } from "../../../decimal";
import { currencySymbol, formatN2 } from "../../../format";
import { formatIsoDate } from "../../reports/reportDates";
import { ZtoStatFilterCards, type ZtoStatFilterCard } from "./ZtoStatFilterCards";
import {
  absDec,
  cellValue,
  currencyTotals,
  ledgerState,
  listColumns,
  listRowKey,
  matchesSearch,
  netSide,
  nextSort,
  settleAge,
  settleBucket,
  sortRows,
  tileKeys,
  tileTotals,
  type FrColumn,
  type FrSort,
  type TileKey,
} from "./financeReportLogic";
import { matches, rowValues, type StatActive } from "./statFilterLogic";

export type FinanceReportListProps = {
  data: LedgerAccounts;
  /** Tür başlığı (ZTO `L(type.Title)`); tablo ve Excel sayfa adı. */
  typeTitle: string;
  today: string;
  /** Çok şirketli konsolidede "Şirket" sütunu (Blackrose eki). */
  showCompany: boolean;
  /** Cari ekstre kipine bağlantı (tüm süzgeçler korunur). */
  accountHref: (accountId: string) => string;
  currencyName: (code: string) => string;
};

/**
 * Sıralama düğmesi: başlık görünümü değişmez (CSS sıfırlama; 12.8 §5.5 MWG `sortable-table`). Düğme
 * satır içi kalır (`width: 100%` yok): ZTO yön oku `th[aria-sort]::after` metnin hemen arkasında çizilir.
 */
const SORT_BUTTON: CSSProperties = {
  font: "inherit",
  color: "inherit",
  background: "none",
  border: 0,
  padding: 0,
  textAlign: "inherit",
  cursor: "pointer",
};
const PRE_LINE: CSSProperties = { whiteSpace: "pre-line" };
const SEARCH_DELAY_MS = 200;

const CARD_KEYS = ["cari", "grup", "pb", "durum", "son"] as const;

/**
 * Finans Raporları — liste kipi (ZTO Index.cshtml:187-361 + finance-report.js): kartlı hızlı filtre
 * (`ZtoStatFilterCards`, kart içi VEYA / kartlar arası VE), cari araması (200 ms gecikmeli, tr küçük
 * harf), görünen satırlardan özet kutucukları ve "Toplamlar", başlığa tıklamalı sıralama. Satır
 * anahtarı cari × şirket × para birimi; Devir/Kalan yan bazlı `display` (borç yanında ters işaret),
 * Durum ham `closing`'den.
 */
export function FinanceReportList(props: FinanceReportListProps) {
  const { t } = useTranslation("ztoFinans");
  const { data, today } = props;
  const side = data.side;
  const receivable = side === "RECEIVABLE";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<StatActive>({});
  const [sort, setSort] = useState<FrSort>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const bucketText = (date: string | null) => {
    const bucket = settleBucket(date, today);
    if (bucket === "none") {
      return receivable
        ? t("financeReport.cards.buckets.noCollection")
        : t("financeReport.cards.buckets.noPayment");
    }
    return t(`financeReport.cards.buckets.${bucket}`);
  };

  const cards: ZtoStatFilterCard[] = useMemo(
    () => [
      {
        key: "cari",
        title: receivable ? t("financeReport.cards.customers") : t("financeReport.cards.accounts"),
        icon: "fas fa-user-tie",
        theme: "supplier",
      },
      {
        key: "grup",
        title: t("financeReport.cards.group"),
        icon: "fas fa-users",
        theme: "neutral",
      },
      {
        key: "pb",
        title: t("financeReport.cards.currency"),
        icon: "fas fa-coins",
        theme: "neutral",
      },
      {
        key: "durum",
        title: t("financeReport.cards.state"),
        icon: "fas fa-balance-scale",
        theme: "primary",
      },
      {
        key: "son",
        title: receivable
          ? t("financeReport.cards.lastCollection")
          : t("financeReport.cards.lastPayment"),
        icon: "far fa-calendar-check",
        theme: "primary",
      },
    ],
    [receivable, t],
  );

  // Kart değerleri (ZTO `data-cari`, `data-grup`, `data-pb`, `data-durum`, `data-son`).
  const cardRows = useMemo(
    () =>
      data.rows.map((row) => ({
        cari: row.accountName,
        grup: row.subGroupName,
        pb: currencySymbol(row.currency),
        durum: t(`financeReport.cards.states.${ledgerState(row.closing)}`),
        son: bucketText(row.lastSettlementDate),
      })),
    // bucketText yalnız bugün/yan/t'ye bağlıdır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.rows, today, receivable, t],
  );

  // Arama ve süzme ertelenir (büyük listede yazma akıcı kalır; MWG INP).
  const deferredQuery = useDeferredValue(query);
  const deferredActive = useDeferredValue(active);
  const visible = useMemo(() => {
    const keys = [...CARD_KEYS];
    const filtered = data.rows.filter(
      (row, index) =>
        matches(rowValues(cardRows[index], keys), deferredActive) &&
        matchesSearch(row, deferredQuery),
    );
    return sortRows(filtered, sort, side);
  }, [data.rows, cardRows, deferredActive, deferredQuery, sort, side]);

  const tiles = useMemo(() => tileTotals(visible, side), [visible, side]);
  const totals = useMemo(() => currencyTotals(visible), [visible]);
  const columns = listColumns(side, props.showCompany);

  const columnLabel = (column: FrColumn) => {
    switch (column.id) {
      case "closing":
        return receivable
          ? t("financeReport.list.columns.closingReceivable")
          : t("financeReport.list.columns.closingPayable");
      case "lastSettlement":
        return receivable
          ? t("financeReport.list.columns.lastCollection")
          : t("financeReport.list.columns.lastPayment");
      default:
        return t(`financeReport.list.columns.${column.id}`);
    }
  };

  const onSort = (column: FrColumn) => {
    const next = nextSort(sort, column.id);
    setSort(next);
    if (next) {
      setStatus(
        t("financeReport.list.sorted", {
          column: columnLabel(column),
          direction: t(`financeReport.list.${next.direction}`),
          count: visible.length,
        }),
      );
    }
  };

  const tileLabel = (key: TileKey) => {
    switch (key) {
      case "credit":
        return receivable ? t("financeReport.tiles.sales") : t("financeReport.tiles.refund");
      case "collection":
        return t("financeReport.tiles.collection");
      case "penalty":
        return t("financeReport.tiles.penalty");
      case "debt":
        return t("financeReport.tiles.purchase");
      case "payment":
        return t("financeReport.tiles.paid");
      case "kalan":
        return receivable
          ? t("financeReport.tiles.remainingReceivable")
          : t("financeReport.tiles.remainingPayable");
    }
  };

  const tileText = (key: TileKey) => {
    const sums = tiles.totals[key];
    return sums.length > 0
      ? sums.map((sum) => `${formatN2(sum.total)} ${sum.sym}`).join("\n")
      : "-";
  };

  const settlementCell = (row: LedgerAccountRow) => {
    const date = row.lastSettlementDate;
    if (!date) {
      return (
        <span className="rp-muted">
          {receivable
            ? t("financeReport.cards.buckets.noCollection")
            : t("financeReport.cards.buckets.noPayment")}
        </span>
      );
    }
    const ago = settleAge(date, today);
    const agoText =
      ago === null || ago < 0
        ? ""
        : ago === 0
          ? t("financeReport.list.today")
          : t("financeReport.list.daysAgo", { count: ago });
    return (
      <>
        {formatIsoDate(date)} {agoText && <span className="rp-muted">({agoText})</span>}
      </>
    );
  };

  const amountCell = (row: LedgerAccountRow, column: FrColumn) => {
    const value = cellValue(row, column.id, side);
    const negative = (column.id === "opening" || column.id === "closing") && cmpDec(value, 0) < 0;
    const className = `${column.id === "closing" ? "num fr-closing" : column.className}${
      negative ? " fr-neg" : ""
    }`;
    return (
      <td key={column.id} className={className} data-v={value}>
        {column.id === "closing" ? <strong>{formatN2(value)}</strong> : formatN2(value)}
      </td>
    );
  };

  const cell = (row: LedgerAccountRow, column: FrColumn) => {
    switch (column.id) {
      case "code":
        return (
          <td key="code" className="fr-opt" data-v={row.accountCode}>
            {row.accountCode}
          </td>
        );
      case "name":
        return (
          <td key="name" className="fr-sticky" data-v={row.accountName}>
            <Link to={props.accountHref(row.accountId)}>{row.accountName}</Link>
            {!row.active && (
              <>
                {" "}
                <span className="rp-tag warn">{t("financeReport.list.passive")}</span>
              </>
            )}
          </td>
        );
      case "company":
        return (
          <td key="company" className="fr-opt" data-v={row.companyName}>
            {row.companyName}
          </td>
        );
      case "group":
        return (
          <td key="group" className="fr-opt" data-v={row.subGroupName}>
            {row.subGroupName}
          </td>
        );
      case "currency": {
        const symbol = currencySymbol(row.currency);
        return (
          <td key="currency" data-v={symbol}>
            {symbol}
          </td>
        );
      }
      case "lastSettlement":
        return (
          <td key="lastSettlement" data-v={row.lastSettlementDate ?? ""}>
            {settlementCell(row)}
          </td>
        );
      case "settlementAmount":
        return (
          <td
            key="settlementAmount"
            className="num fr-mid"
            data-v={row.lastSettlementAmount ?? "0"}
          >
            {row.lastSettlementDate && row.lastSettlementAmount !== null
              ? formatN2(row.lastSettlementAmount)
              : "-"}
          </td>
        );
      case "lastMovement":
        return (
          <td key="lastMovement" className="fr-opt" data-v={row.lastMovementDate ?? ""}>
            {formatIsoDate(row.lastMovementDate) || "-"}
          </td>
        );
      default:
        return amountCell(row, column);
    }
  };

  return (
    <>
      {data.postPeriodCount > 0 && (
        <div className="rp-notice">
          <i className="fas fa-info-circle" aria-hidden="true" />{" "}
          {t("financeReport.notices.afterPeriod", { count: data.postPeriodCount })}
        </div>
      )}
      {data.rows.length === 0 ? (
        <div className="rp-card rp-empty">
          <h2>{t("financeReport.notices.empty")}</h2>
        </div>
      ) : (
        <>
          <div className="fr-cards">
            <ZtoStatFilterCards
              id="frCards"
              ariaLabel={t("financeReport.cards.ariaLabel")}
              clearLabel={t("financeReport.cards.clear")}
              resultTemplate={t("financeReport.cards.result")}
              emptyLabel={t("financeReport.cards.empty")}
              cards={cards}
              rows={cardRows}
              active={active}
              onChange={setActive}
              count={[visible.length, data.rows.length]}
            />
          </div>
          <section className="rp-card">
            <div className="rp-tiles">
              <div className="rp-tile">
                <b data-fr-tile="count" style={PRE_LINE}>
                  {tiles.count}
                </b>
                <span>{t("financeReport.tiles.count")}</span>
              </div>
              {tileKeys(side).map((tile) => (
                <div key={tile.key} className={`rp-tile${tile.css ? ` ${tile.css}` : ""}`}>
                  <b data-fr-tile={tile.key} style={PRE_LINE}>
                    {tileText(tile.key)}
                  </b>
                  <span>{tileLabel(tile.key)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="rp-card">
            <div className="rp-sec-head">
              <h2 id="frListTitle">{props.typeTitle}</h2>
              <div className="rp-sec-tools">
                <input
                  type="search"
                  id="frSearch"
                  className="rp-search fr-search"
                  placeholder={t("financeReport.list.search")}
                  aria-label={t("financeReport.list.search")}
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="rp-scroll" role="region" aria-labelledby="frListTitle" tabIndex={0}>
              <table className="rp" id="frList" data-fr-sheet={props.typeTitle}>
                <thead>
                  <tr>
                    {columns.map((column, index) => (
                      <th
                        key={column.id}
                        scope="col"
                        data-sort-col={index}
                        className={column.className || undefined}
                        aria-sort={sort?.column === column.id ? sort.direction : undefined}
                        // ZTO başlığın tamamı tıklanır (finance-report.js); düğme klavye için, tıklaması buraya kabarır.
                        onClick={() => onSort(column)}
                      >
                        <button type="button" className="fr-sort-btn" style={SORT_BUTTON}>
                          {columnLabel(column)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={listRowKey(row)} className="fr-row" data-acc={row.accountId}>
                      {columns.map((column) => cell(row, column))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sr-only" role="status">
              {status}
            </div>
          </section>
          <section className="rp-card">
            <div className="rp-sec-head">
              <h2 id="frTotalsTitle">{t("financeReport.list.totalsTitle")}</h2>
              <span className="rp-sec-meta">{t("financeReport.list.totalsHint")}</span>
            </div>
            <div className="rp-scroll" role="region" aria-labelledby="frTotalsTitle" tabIndex={0}>
              <table
                className="rp"
                id="frTotals"
                data-fr-sheet={t("financeReport.list.totalsTitle")}
              >
                <thead>
                  <tr>
                    <th>{t("financeReport.overview.currency")}</th>
                    <th className="num">{t("financeReport.overview.weOwe")}</th>
                    <th className="num">{t("financeReport.overview.theyOwe")}</th>
                    <th className="num">{t("financeReport.overview.net")}</th>
                    <th className="num fr-mid">{t("financeReport.overview.openAccounts")}</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((total) => {
                    const symbol = currencySymbol(total.currency);
                    const sideKey = netSide(total.net);
                    return (
                      <tr key={total.currency} data-cur={total.currency}>
                        <td>{props.currencyName(total.currency)}</td>
                        <td className="num" data-v={total.weOwe}>
                          {formatN2(total.weOwe)} {symbol}
                        </td>
                        <td className="num" data-v={total.theyOwe}>
                          {formatN2(total.theyOwe)} {symbol}
                        </td>
                        <td className="num" data-v={total.net}>
                          {formatN2(absDec(total.net))} {symbol}{" "}
                          <span className="fr-sub">
                            {sideKey ? t(`financeReport.side.${sideKey}`) : ""}
                          </span>
                        </td>
                        <td className="num fr-mid" data-v={String(total.open)}>
                          {total.open}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="rp-note">{t("financeReport.overview.note")}</p>
          </section>
        </>
      )}
    </>
  );
}

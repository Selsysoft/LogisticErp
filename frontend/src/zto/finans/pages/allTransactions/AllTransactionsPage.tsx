import { createColumnHelper } from "@tanstack/react-table";
import { MouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAllAccountTransactions } from "../../../../pages/finance/accountApi";
import { today, useCan, useCurrencies } from "../../../../pages/finance/common";
import type { TransactionKind } from "../../../../pages/finance/types";
import {
  AT_HEADER_SEARCH_IDS,
  ZtoAccountSearch,
  ZtoDataTable,
  ZtoPageHeader,
  ZtoTooltip,
  currencySymbol,
  groupIcon,
} from "../../../components";
import {
  ZTO_FINANS_BASE,
  ZTO_SLUGS,
  accountEditPath,
  accountTransactionsPath,
  statementPath,
} from "../../navItems";
import { useQuickCari } from "../../quickCariContext";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { ZtoTopPanel } from "../../ZtoTopPanel";
import { AtCariFilter } from "./AtCariFilter";
import {
  EMPTY_SELECTION,
  QUICK_RANGES,
  buildRowsChunked,
  clearSelection,
  computeFacets,
  dataTableLanguage,
  errorText,
  facetGroups,
  formatCount,
  quickRangeDates,
  rangeProblem,
  selectionChips,
  selectionParams,
  toggleSelection,
  type AtRow,
  type CardKey,
  type CardSelection,
  type FacetItem,
  type QuickRange,
} from "./allTransactionsLogic";

// ZTO sidebar düzeninde sayfa kabı: container-fluid + padding-left:25px (AllTransactions.cshtml:1153).
// margin-top:60px ZTO'nun sabit üst çubuğu içindir; burada AppShell çubuğu akışta olduğundan alınmaz (12.0).
const PAGE_STYLE = { paddingLeft: 25 } as const;
// Başlıktaki arama + "Yeni Cari Kart" (ZTO .atcs-wrap içinde .atcs-inputbox > .atcs-inpin + .atcs-new-btn).
const HEADER_SEARCH_STYLE = {
  display: "flex",
  alignItems: "center",
  flex: "1 1 auto",
  maxWidth: 520,
  minWidth: 0,
} as const;
const EMPTY_CELL_STYLE = { border: "none" } as const;
const COLUMN_COUNT = 11;

const column = createColumnHelper<AtRow>();

/** ZTO kartlarının data-filter-key değerleri (ajs _activeCardFilters). */
const FILTER_KEYS: Record<CardKey, string> = {
  branch: "workPlaceName",
  group: "accountGroup",
  kind: "transactionType",
};
const CARD_IDS: Record<CardKey, string> = {
  branch: "atCardWorkPlace",
  group: "atCardAccountGroup",
  kind: "atCardTransactionType",
};
const CARD_HEADERS: Array<{ key: CardKey; icon: string; label: string }> = [
  { key: "branch", icon: "fas fa-building text-success", label: "cards.branches" },
  { key: "group", icon: "fas fa-user-tie text-primary", label: "cards.groups" },
  { key: "kind", icon: "fas fa-exchange-alt text-warning", label: "cards.kinds" },
];

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * Günlük Tüm Cari İşlemleri (12.1 §5.12; ZTO AccountTransaction/AllTransactions.cshtml:1153-1343 +
 * alltransactions.js). İstemci modu (OK-39): seçili aralığın tüm sayfaları birleştirilir, arama ve
 * sıralama tabloda; aralık ≤ 366 gün, 10.000 satırın üstünde tablo yerine uyarı (S-22). Kart süzgeçleri
 * (İş Yeri, Hesap Grubu, İşlem Türü) sunucuya gider, facet sayıları süzgeçten etkilenmez; tarih,
 * para birimi ya da cari değişince seçimler sıfırlanır (ZTO).
 */
export function AllTransactionsPage() {
  const { t } = useTranslation("ztoFinans");
  const { t: tr } = useTranslation();
  useZtoRootClass("zto-page-all-transactions");
  const navigate = useNavigate();
  const quickCari = useQuickCari();
  const canManage = useCan("FINANCE_MANAGE");
  const currencies = useCurrencies();

  const [range, setRange] = useState<QuickRange | null>("today");
  const [dates, setDates] = useState(() => quickRangeDates("today", today()));
  const [currency, setCurrency] = useState("");
  const [account, setAccount] = useState<{ id: string; label: string } | null>(null);
  const [selection, setSelection] = useState<CardSelection>(EMPTY_SELECTION);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  const problem = rangeProblem(dates.from, dates.to);
  const query = useAllAccountTransactions({
    from: problem ? "" : dates.from,
    to: problem ? "" : dates.to,
    currency: currency || undefined,
    accountId: account?.id,
    ...selectionParams(selection),
    facets: true,
  });

  const labels = useMemo(
    () => ({
      kind: (kind: TransactionKind) => tr(`finance.kind.${kind}`),
      sale: t("allTransactions.sale"),
      refund: t("allTransactions.refund"),
    }),
    [t, tr],
  );

  // Satır görünüm modeli 50 ms parçalarla (INP); yeni veri gelince eski iş iptal edilir.
  const sourceRows = query.data?.rows;
  const [rows, setRows] = useState<AtRow[] | null>(null);
  useEffect(() => {
    if (!sourceRows) return;
    const controller = new AbortController();
    buildRowsChunked(sourceRows, labels, { signal: controller.signal }).then(
      (built) => {
        if (!controller.signal.aborted) setRows(built);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [sourceRows, labels]);

  const groups = useMemo(() => {
    if (!query.data) return null;
    return facetGroups(query.data.facets ?? computeFacets(query.data.rows), (kind) =>
      tr(`finance.kind.${kind}`),
    );
  }, [query.data, tr]);
  const chips = groups ? selectionChips(selection, groups) : [];

  const language = useMemo(() => dataTableLanguage(t), [t]);

  // ---- Süzgeç olayları (ajs bindAllCustomerTransactionsEvents) ----
  function applyRange(next: QuickRange) {
    setRange(next);
    setDates(quickRangeDates(next, today()));
    setSelection(EMPTY_SELECTION);
  }
  function changeDate(key: "from" | "to", value: string) {
    setRange(null);
    setDates((current) => ({ ...current, [key]: value }));
    setSelection(EMPTY_SELECTION);
  }
  function changeCurrency(next: string) {
    setCurrency(next);
    setSelection(EMPTY_SELECTION);
  }
  function changeAccount(next: { id: string; label: string } | null) {
    setAccount(next);
    setSelection(EMPTY_SELECTION);
  }
  function reset() {
    applyRange("today");
    setCurrency("");
    setAccount(null);
  }
  function removeChip(key: CardKey) {
    const value = selection[key];
    setSelection((current) => clearSelection(current, key));
    // MWG: kaldırılan çipin düğmesi kaybolur; odak ilgili kart öğesine döner.
    if (value !== null) cardRefs.current.get(`${key}:${value}`)?.focus();
  }

  const columns = useMemo(
    () => [
      column.accessor("sortKey", {
        id: "date",
        header: t("allTransactions.columns.date"),
        cell: ({ row }) => row.original.dateText,
        meta: {
          exportHeader: t("allTransactions.columns.date"),
          searchValue: (_v, row) => row.dateText,
        },
      }),
      column.accessor("branchName", { header: t("allTransactions.columns.branch") }),
      column.accessor("accountCode", {
        header: t("allTransactions.columns.code"),
        cell: ({ getValue }) => <strong>{getValue()}</strong>,
      }),
      column.accessor("accountName", {
        header: t("allTransactions.columns.name"),
        cell: ({ row }) => (
          <a
            className="at-cari-link"
            target="_blank"
            rel="noopener noreferrer"
            href={accountTransactionsPath(row.original.accountId)}
            title={t("allTransactions.openTransactions")}
          >
            <i className="fas fa-user-tie" aria-hidden="true" /> {row.original.accountName}
            <span className="sr-only"> {tr("common.a11y.opensInNewTab")}</span>
          </a>
        ),
      }),
      column.accessor("groupName", {
        header: t("allTransactions.columns.group"),
        cell: ({ row }) =>
          row.original.groupName ? (
            <span className="at-group-badge">
              <i
                className={`fas ${groupIcon("atcs", row.original.groupName)}`}
                aria-hidden="true"
              />{" "}
              {row.original.groupName}
            </span>
          ) : (
            "-"
          ),
      }),
      column.accessor("kindLabel", {
        id: "kind",
        header: t("allTransactions.columns.kind"),
        cell: ({ row }) => (
          <>
            <span className={row.original.kindClass}>{row.original.kindLabel}</span>
            {row.original.extra && (
              <span className={row.original.extra.className} style={{ fontSize: "0.7rem" }}>
                {row.original.extra.label}
              </span>
            )}
          </>
        ),
        meta: {
          searchValue: (_v, row) => `${row.kindLabel} ${row.extra?.label ?? ""}`,
        },
      }),
      column.accessor("documentNo", { header: t("allTransactions.columns.documentNo") }),
      column.accessor("amount", {
        header: t("allTransactions.columns.amount"),
        cell: ({ row }) => (
          <span className={row.original.amountClass}>{row.original.amountText}</span>
        ),
        meta: { className: "text-right", searchValue: (_v, row) => row.amountText },
      }),
      column.accessor("description", {
        header: t("allTransactions.columns.description"),
        meta: { cellClassName: "small" },
      }),
      column.accessor("createdBy", {
        header: t("allTransactions.columns.createdBy"),
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="at-createdby">
              <i className="fas fa-user-circle" aria-hidden="true" /> {getValue()}
            </span>
          ) : (
            <span className="text-muted">-</span>
          ),
        meta: { cellClassName: "small" },
      }),
      column.display({
        id: "action",
        header: t("allTransactions.columns.action"),
        enableSorting: false,
        meta: { cellClassName: "text-center", searchable: false, exportable: false },
        cell: ({ row }) => (
          <a
            className="btn btn-sm btn-outline-primary"
            target="_blank"
            rel="noopener noreferrer"
            href={accountTransactionsPath(row.original.accountId)}
            title={t("allTransactions.openTransactions")}
            aria-label={`${row.original.accountName}: ${t("allTransactions.openTransactions")} ${tr("common.a11y.opensInNewTab")}`}
          >
            <i className="fas fa-external-link-alt" aria-hidden="true" />
          </a>
        ),
      }),
    ],
    [t, tr],
  );

  // ---- Tablo alanı: yükleniyor / hata / aralık / çok büyük / boş / tablo ----
  const notReady = t("nav.notReady", { step: "12.4" });
  let tableArea: ReactNode;
  if (problem) {
    tableArea = (
      <StaticTable>
        <tr>
          <td colSpan={COLUMN_COUNT} className="text-center text-danger" role="status">
            {problem === "order"
              ? t("allTransactions.rangeOrder")
              : t("allTransactions.rangeTooLarge")}
          </td>
        </tr>
      </StaticTable>
    );
  } else if (query.isError) {
    tableArea = (
      <StaticTable>
        <tr>
          <td colSpan={COLUMN_COUNT} className="text-center text-danger" role="status">
            {errorText(query.error, {
              error: t("allTransactions.error"),
              errorOccurred: t("allTransactions.errorOccurred"),
            })}
          </td>
        </tr>
      </StaticTable>
    );
  } else if (query.data?.tooLarge) {
    tableArea = (
      <div className="alert alert-warning m-3" role="status">
        {t("allTransactions.tooLarge", { n: formatCount(query.data.total) })}
      </div>
    );
  } else if (!query.data || rows === null) {
    tableArea = (
      <StaticTable>
        <tr>
          <td colSpan={COLUMN_COUNT} className="text-center">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />{" "}
            {t("allTransactions.loading")}
          </td>
        </tr>
      </StaticTable>
    );
  } else if (rows.length === 0) {
    tableArea = (
      <StaticTable>
        <tr>
          <td colSpan={COLUMN_COUNT} style={EMPTY_CELL_STYLE}>
            <div className="at-empty-state" role="status">
              <div className="at-empty-icon">
                <i className="fas fa-calendar-check" aria-hidden="true" />
              </div>
              <h6>{t("allTransactions.emptyTitle")}</h6>
              <p>{t("allTransactions.emptyText")}</p>
              <button type="button" className="at-empty-cta" onClick={quickCari.open}>
                <i className="fas fa-bolt" aria-hidden="true" /> {t("allTransactions.quickCari")}
              </button>
            </div>
          </td>
        </tr>
      </StaticTable>
    );
  } else {
    tableArea = (
      <ZtoDataTable
        id="allCustomerTransactionsTable"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        tableClassName="table table-bordered table-hover table-sm mb-0"
        pageLength={25}
        lengthMenu={[10, 25, 50, 100]}
        order={[{ id: "date", desc: true }]}
        language={language}
      />
    );
  }

  function renderCard(key: CardKey) {
    if (!groups) return null;
    const items: FacetItem[] = groups[key];
    if (items.length === 0) {
      return (
        <div className="stat-item stat-item-empty">
          <span className="stat-item-label">-</span>
        </div>
      );
    }
    return items.map((item) => {
      const active = selection[key] === item.value;
      return (
        <button
          key={item.value}
          type="button"
          ref={(element) => {
            const refKey = `${key}:${item.value}`;
            if (element) cardRefs.current.set(refKey, element);
            else cardRefs.current.delete(refKey);
          }}
          className={active ? "stat-item active" : "stat-item"}
          data-filter-key={FILTER_KEYS[key]}
          data-filter-value={item.label}
          aria-pressed={active}
          onClick={() => setSelection((current) => toggleSelection(current, key, item.value))}
        >
          <span className="stat-item-label" title={item.label}>
            {item.label}
          </span>
          <span className="stat-item-value">{item.count}</span>
        </button>
      );
    });
  }

  const headerSearch = (
    <div style={HEADER_SEARCH_STYLE}>
      <ZtoAccountSearch
        variant="atcs"
        ids={AT_HEADER_SEARCH_IDS}
        placeholder={t("allTransactions.headerSearchPlaceholder")}
        emptyText={t("allTransactions.noResults")}
        delayMs={250}
        wrapStyle={{ maxWidth: "none" }}
        onSelect={(hit) => navigate(accountTransactionsPath(hit.id))}
        renderItem={(hit) => (
          <>
            <div className="atcs-ri-icon">
              <i className={`fas ${groupIcon("atcs", hit.subGroupName)}`} aria-hidden="true" />
            </div>
            <div className="atcs-ri-main">
              <div className="atcs-ri-name">{hit.name}</div>
              <div className="atcs-ri-sub">
                {hit.code} · <span className="atcs-ri-group">{hit.subGroupName}</span>
              </div>
            </div>
            <div className="atcs-ri-actions">
              <a
                className="atcs-act atcs-act-primary"
                href={accountTransactionsPath(hit.id)}
                tabIndex={-1}
              >
                <i className="fas fa-list" aria-hidden="true" /> {t("allTransactions.actMovements")}
              </a>
              <a
                className="atcs-act atcs-act-ekstre"
                href={statementPath(hit.id)}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={-1}
                onClick={stopPropagation}
              >
                <i className="fas fa-file-invoice" aria-hidden="true" />{" "}
                {t("allTransactions.actStatement")}
              </a>
              {canManage && (
                <a
                  className="atcs-act atcs-act-edit"
                  href={accountEditPath(hit.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("allTransactions.actEditTitle")}
                  aria-label={t("allTransactions.actEditTitle")}
                  tabIndex={-1}
                  onClick={stopPropagation}
                >
                  <i className="fas fa-pen" aria-hidden="true" />
                </a>
              )}
            </div>
          </>
        )}
      />
      {canManage && (
        <a
          href={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.newAccount}`}
          target="_blank"
          rel="noopener noreferrer"
          className="atcs-new-btn"
          title={t("allTransactions.newAccount")}
          aria-label={`${t("allTransactions.newAccount")} ${tr("common.a11y.opensInNewTab")}`}
        >
          <i className="fas fa-plus" aria-hidden="true" />
          <i className="fas fa-user-tie" aria-hidden="true" />
        </a>
      )}
    </div>
  );

  const headerActions = (
    <>
      <ZtoTooltip content={notReady}>
        <button
          type="button"
          className="at-tool-btn mr-2"
          aria-disabled="true"
          aria-label={t("allTransactions.heatmapTitle")}
        >
          <i className="fas fa-chart-area text-danger" aria-hidden="true" />
          <span className="d-none d-xl-inline">{t("allTransactions.heatmap")}</span>
        </button>
      </ZtoTooltip>
      <ZtoTooltip content={notReady}>
        <button
          type="button"
          id="btnFinanceReminder"
          className="at-tool-btn mr-2"
          aria-disabled="true"
          aria-label={t("allTransactions.reminderTitle")}
        >
          <i className="fas fa-bell text-warning" aria-hidden="true" />
        </button>
      </ZtoTooltip>
    </>
  );

  return (
    <div className="container-fluid bank-statement-page" style={PAGE_STYLE}>
      <ZtoTopPanel
        title={t("allTransactions.panelTitle")}
        subtitle={t("allTransactions.panelSubtitle")}
      />
      <div className="card mb-3 at-header-card">
        <ZtoPageHeader
          variant="panel"
          icon="fas fa-calendar-day"
          title={t("allTransactions.title")}
          breadcrumb={[
            { icon: "fas fa-home", label: t("allTransactions.breadcrumbRoot") },
            { icon: "fas fa-file-invoice-dollar", label: t("allTransactions.breadcrumbCurrent") },
          ]}
          actions={headerActions}
          back={{
            to: `${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`,
            title: t("allTransactions.backTitle"),
            label: t("allTransactions.back"),
          }}
        >
          {headerSearch}
        </ZtoPageHeader>
      </div>

      <div
        className="at-filter-card"
        id="allTransactionsFilters"
        data-default-start={dates.from}
        data-default-end={dates.to}
      >
        <div className="at-toprow">
          <div className="at-quick-range" role="group" aria-label={tr("common.a11y.dateRange")}>
            <span className="at-quick-label">
              <i className="far fa-calendar-alt" aria-hidden="true" />
            </span>
            {QUICK_RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={range === item.key ? "at-range-btn active" : "at-range-btn"}
                data-range={item.dataRange}
                aria-pressed={range === item.key}
                onClick={() => applyRange(item.key)}
              >
                {t(`allTransactions.ranges.${item.key}`)}
              </button>
            ))}
          </div>

          <div className="at-inline-controls">
            <div className="at-ic-pill" title={t("allTransactions.startDate")}>
              <i className="far fa-calendar-alt at-ic-lead" aria-hidden="true" />
              <label className="sr-only" htmlFor="filterStartDate">
                {t("allTransactions.startDate")}
              </label>
              <input
                type="date"
                id="filterStartDate"
                className="at-bare-input"
                value={dates.from}
                title={t("allTransactions.startDate")}
                aria-invalid={problem !== null && problem !== "missing"}
                onChange={(event) => changeDate("from", event.target.value)}
              />
            </div>
            <i
              className="fas fa-arrow-right at-range-arrow"
              title={t("allTransactions.rangeArrow")}
              aria-hidden="true"
            />
            <div className="at-ic-pill" title={t("allTransactions.endDate")}>
              <i className="far fa-calendar-check at-ic-lead" aria-hidden="true" />
              <label className="sr-only" htmlFor="filterEndDate">
                {t("allTransactions.endDate")}
              </label>
              <input
                type="date"
                id="filterEndDate"
                className="at-bare-input"
                value={dates.to}
                title={t("allTransactions.endDate")}
                aria-invalid={problem !== null && problem !== "missing"}
                onChange={(event) => changeDate("to", event.target.value)}
              />
            </div>
            <AtCariFilter
              value={account}
              onSelect={(hit) => changeAccount({ id: hit.id, label: hit.name })}
              onClear={() => changeAccount(null)}
            />
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm at-ic-clear"
              id="btnClear"
              title={t("allTransactions.reset")}
              aria-label={t("allTransactions.reset")}
              onClick={reset}
            >
              <i className="fas fa-redo-alt" aria-hidden="true" />
            </button>
          </div>

          <div
            className="at-currency"
            id="currencyToggle"
            role="group"
            aria-label={t("allTransactions.currency")}
          >
            <span className="at-cur-label">{t("allTransactions.currency")}:</span>
            <button
              type="button"
              className={currency === "" ? "at-cur-btn active" : "at-cur-btn"}
              data-currency="0"
              aria-pressed={currency === ""}
              onClick={() => changeCurrency("")}
            >
              {t("allTransactions.all")}
            </button>
            {(currencies.data ?? []).map((item) => (
              <button
                key={item.code}
                type="button"
                className={currency === item.code ? "at-cur-btn active" : "at-cur-btn"}
                data-currency={item.code}
                title={item.name}
                aria-pressed={currency === item.code}
                onClick={() => changeCurrency(item.code)}
              >
                {currencySymbol(item.code)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dynamic-filter-cards" id="atDynamicFilterCards">
        {CARD_HEADERS.map((card) => (
          <div className="stat-main-card" key={card.key}>
            <div className="stat-main-header">
              <i className={card.icon} aria-hidden="true" />{" "}
              <span>{t(`allTransactions.${card.label}`)}</span>
            </div>
            <div className="stat-items-wrapper" id={CARD_IDS[card.key]}>
              {renderCard(card.key)}
            </div>
          </div>
        ))}
      </div>
      <div id="atDynamicFilterIndicator" className="at-dynamic-indicator">
        {chips.map((chip, index) => {
          const label = t(`allTransactions.chips.${chip.key}`);
          return (
            <span key={chip.key}>
              {index > 0 && " "}
              <span className="at-filter-chip">
                <i className="fas fa-filter" aria-hidden="true" /> {label}:{" "}
                <strong>{chip.value}</strong>{" "}
                <button
                  type="button"
                  className="at-chip-clear"
                  data-clear={FILTER_KEYS[chip.key]}
                  aria-label={tr("common.a11y.removeFilter", { filter: `${label}: ${chip.value}` })}
                  onClick={() => removeChip(chip.key)}
                >
                  <i className="fas fa-times-circle" aria-hidden="true" />
                </button>
              </span>
            </span>
          );
        })}
      </div>

      <div className="card" aria-busy={query.isFetching || (!!sourceRows && rows === null)}>
        <div className="card-body p-0">
          <div className="table-responsive">{tableArea}</div>
        </div>
      </div>
    </div>
  );
}

/** Veri yokken (yükleniyor, hata, boş) ZTO'nun DataTables'sız tablosu (ajs: tbody.html(...)). */
function StaticTable({ children }: { children: ReactNode }) {
  const { t } = useTranslation("ztoFinans");
  const keys = [
    "date",
    "branch",
    "code",
    "name",
    "group",
    "kind",
    "documentNo",
    "amount",
    "description",
    "createdBy",
    "action",
  ] as const;
  return (
    <table
      className="table table-bordered table-hover table-sm mb-0"
      id="allCustomerTransactionsTable"
    >
      <thead className="thead-light">
        <tr>
          {keys.map((key) => (
            <th key={key} className={key === "amount" ? "text-right" : undefined}>
              {t(`allTransactions.columns.${key}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

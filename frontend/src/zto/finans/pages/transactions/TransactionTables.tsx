import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import type {
  Account,
  AccountRollover,
  AccountTransactionRow,
} from "../../../../pages/finance/types";
import {
  ZtoDataTable,
  currencySymbol,
  formatDate,
  formatDateTime,
  formatN2,
} from "../../../components";
import {
  KIND_AMOUNT_CLASS,
  KIND_BADGE,
  canVoid,
  documentTypeBadge,
  extraBadge,
  isoToTr,
  nextTabIndex,
  rowsOfTab,
  seasonMarkers,
  signedAmount,
  type TabKey,
} from "./transactionsLogic";

const TAB_META: Record<TabKey, { id: string; pane: string; table: string; icon: string }> = {
  ALL: { id: "all-tab", pane: "all", table: "allTransactionsTable", icon: "fas fa-list" },
  DEBT: { id: "debts-tab", pane: "debts", table: "debtsTable", icon: "fas fa-hand-holding-usd" },
  PAYMENT: {
    id: "payments-tab",
    pane: "payments",
    table: "paymentsTable",
    icon: "fas fa-money-bill",
  },
  RECEIVABLE: { id: "credits-tab", pane: "credits", table: "creditsTable", icon: "fas fa-receipt" },
  COLLECTION: {
    id: "collections-tab",
    pane: "collections",
    table: "collectionsTable",
    icon: "fas fa-cash-register",
  },
};

export type TransactionTablesProps = {
  account: Account;
  tabs: TabKey[];
  tab: TabKey;
  onTab: (tab: TabKey) => void;
  rows: AccountTransactionRow[];
  balances: Map<string, number>;
  seasons: AccountRollover[];
  seasonSelected: boolean;
  loading: boolean;
  showInvoiceDate: boolean;
  typeName: (row: AccountTransactionRow) => string;
  canVoidRows: boolean;
  canEditDocuments: boolean;
  onDetail: (row: AccountTransactionRow) => void;
  onEdit: (row: AccountTransactionRow) => void;
  onDelete: (row: AccountTransactionRow) => void;
  /** Sekme satırının sağındaki Cari Devir / Cari Taşıma düğmeleri. */
  tabActions: ReactNode;
};

const column = createColumnHelper<AccountTransactionRow>();

/**
 * Sekmeler ve tablolar (ZTO Transactions.cshtml:925-1300; tjs dataTablesConfig :966-1004). ZTO
 * `ul.nav-tabs > li > a.nav-link` işaretlemesi; üzerine tablist/tab/tabpanel rolleri ve roving tabindex
 * (MWG `tabs`; `focusgroup` Baseline değil). Sekmeler istemcide `kind` süzgecidir. Tablo istemci modu,
 * 25 satır, ISO tarih ve işaretli tutarla sıralama; sezon işaretçileri pageDecorator ile.
 */
export function TransactionTables(props: TransactionTablesProps) {
  const { t } = useTranslation("ztoFinans");
  const { account, tabs, tab, onTab, rows, balances, seasons, showInvoiceDate, typeName } = props;
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const tabRows = useMemo(() => rowsOfTab(rows, tab), [rows, tab]);
  const orderedDesc = tabRows;
  const orderedAsc = useMemo(
    () => tabRows.slice().sort((a, b) => a.transactionDate.localeCompare(b.transactionDate)),
    [tabRows],
  );

  const onTabKey = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const next = nextTabIndex(index, event.key, tabs.length);
    if (next === null) return;
    event.preventDefault();
    onTab(tabs[next]);
    tabRefs.current[next]?.focus();
  };

  const kindCell = (row: AccountTransactionRow) => {
    const extra = extraBadge(row);
    return (
      <>
        <span className={`badge ${KIND_BADGE[row.kind]}`}>
          {t(`transactions.kind.${row.kind}`)}
        </span>
        {extra && (
          <span className={`badge ${extra.className} ml-1`} style={{ fontSize: "0.7rem" }}>
            {t(`transactions.extraBadge.${extra.key}`)}
          </span>
        )}
        {row.reversal && (
          <span className="badge badge-secondary ml-1">{t("transactions.table.reversal")}</span>
        )}
        {row.transferredOut && (
          <span className="badge badge-dark ml-1">{t("transactions.table.transferred")}</span>
        )}
        {row.transferRole === "IN" && (
          <span className="badge badge-info ml-1">{t("transactions.table.transferIn")}</span>
        )}
      </>
    );
  };

  const typeCell = (row: AccountTransactionRow) => {
    const name = typeName(row);
    if (!name) return <span className="text-muted">-</span>;
    const badge = documentTypeBadge(name);
    return (
      <span className={`badge ${badge.className} ml-1`} style={{ fontSize: "0.7rem" }}>
        <i className={`fas ${badge.icon} mr-1`} aria-hidden="true" />
        {name}
      </span>
    );
  };

  const amountCell = (row: AccountTransactionRow) => (
    <>
      <span className={KIND_AMOUNT_CLASS[row.kind]}>
        {formatN2(signedAmount(row))} {currencySymbol(row.currency)}
      </span>
      {row.reversed && (
        <small className="d-block text-muted" style={{ textDecoration: "none" }}>
          {t("transactions.table.reversed")}
        </small>
      )}
    </>
  );

  const balanceCell = (row: AccountTransactionRow) => {
    const value = balances.get(row.id) ?? 0;
    const cls = value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-secondary";
    const icon = value > 0 ? "+" : value < 0 ? "-" : "=";
    return (
      <span className={cls}>
        <span className="mr-1 font-weight-bold">{icon}</span>
        {formatN2(Math.abs(value))} {currencySymbol(row.currency)}
      </span>
    );
  };

  const actionsCell = (row: AccountTransactionRow) => (
    <span className="text-nowrap">
      <button
        type="button"
        className="btn btn-sm btn-info mr-1 btn-detail"
        title={t("transactions.table.detail")}
        aria-label={`${t("transactions.table.detail")}: ${t(`transactions.kind.${row.kind}`)} ${formatDate(row.transactionDate)}`}
        onClick={() => props.onDetail(row)}
      >
        <i className="fas fa-eye" aria-hidden="true" />
      </button>
      {props.canEditDocuments &&
        row.sourceType === "ACCOUNT_DOCUMENT" &&
        // 12.8 (§5.11, OK-12.8-1): kur farkı belgesi düzenlenemez; iptal edip yeniden kesilir.
        row.documentType !== "KUR_FARKI" &&
        !row.reversal &&
        !row.reversed &&
        !row.transferredOut && (
          <button
            type="button"
            className="btn btn-sm btn-warning mr-1"
            title={t("transactions.table.edit")}
            aria-label={`${t("transactions.table.edit")}: ${row.documentNo ?? ""}`}
            onClick={() => props.onEdit(row)}
          >
            <i className="fas fa-edit" aria-hidden="true" />
          </button>
        )}
      {props.canVoidRows && canVoid(row) && (
        <button
          type="button"
          className="btn btn-sm btn-danger"
          title={t("transactions.table.delete")}
          aria-label={`${t("transactions.table.delete")}: ${t(`transactions.kind.${row.kind}`)} ${formatDate(row.transactionDate)}`}
          onClick={() => props.onDelete(row)}
        >
          <i className="fas fa-trash" aria-hidden="true" />
        </button>
      )}
    </span>
  );

  const dateCol = (header: string) =>
    column.accessor("transactionDate", {
      id: "transactionDate",
      header,
      cell: (c) => formatDate(c.getValue()),
      meta: { searchValue: (v: string) => `${v} ${isoToTr(v)}` },
    });
  const branchCol = column.accessor((r) => r.branchName || "-", {
    id: "branch",
    header: t("transactions.table.workplace"),
  });
  const docNoCol = column.accessor((r) => r.documentNo ?? "", {
    id: "documentNo",
    header: t("transactions.table.documentNo"),
    cell: (c) => c.getValue() || "-",
  });
  const invoiceDateCol = column.accessor((r) => r.documentDate ?? "", {
    id: "documentDate",
    header: t("transactions.table.invoiceDate"),
    cell: (c) => (c.getValue() ? formatDate(c.getValue()) : "-"),
  });
  const typeCol = column.accessor((r) => typeName(r), {
    id: "type",
    header: t("transactions.table.type"),
    cell: (c) => typeCell(c.row.original),
  });
  const descCol = column.accessor((r) => r.description ?? "", {
    id: "description",
    header: t("transactions.table.description"),
    cell: (c) => (
      <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.getValue() || "-"}</span>
    ),
    meta: { cellClassName: "atx-desc-cell" },
  });
  const amountCol = column.accessor((r) => signedAmount(r), {
    id: "amount",
    header: t("transactions.table.amount"),
    cell: (c) => amountCell(c.row.original),
    meta: { className: "text-right text-nowrap", cellClassName: "" },
  });
  const methodCol = column.accessor(
    (r) =>
      r.paymentMethod
        ? t(`translation:finance.paymentMethod.${r.paymentMethod}`, {
            defaultValue: r.paymentMethod,
          })
        : "-",
    { id: "method", header: t("transactions.table.method") },
  );
  const actionsCol = column.display({
    id: "actions",
    header: t("transactions.table.actions"),
    enableSorting: false,
    cell: (c) => actionsCell(c.row.original),
    meta: { searchable: false, exportable: false },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TanStack sütun değer tipleri karışık
  const columns = useMemo((): ColumnDef<AccountTransactionRow, any>[] => {
    if (tab === "ALL") {
      return [
        column.accessor("createdAt", {
          id: "createdAt",
          header: t("transactions.table.createdAt"),
          cell: (c) => formatDateTime(c.getValue()),
          meta: { cellClassName: "text-center" },
        }),
        dateCol(t("transactions.table.date")),
        branchCol,
        column.accessor((r) => t(`transactions.kind.${r.kind}`), {
          id: "kind",
          header: t("transactions.table.kind"),
          cell: (c) => kindCell(c.row.original),
        }),
        docNoCol,
        ...(showInvoiceDate ? [invoiceDateCol] : []),
        typeCol,
        descCol,
        amountCol,
        methodCol,
        column.accessor((r) => balances.get(r.id) ?? 0, {
          id: "balance",
          header: t("transactions.table.balance"),
          cell: (c) => balanceCell(c.row.original),
          meta: { cellClassName: "font-weight-bold text-right text-nowrap atx-balance-cell" },
        }),
        actionsCol,
      ];
    }
    if (tab === "DEBT" || tab === "RECEIVABLE") {
      return [
        dateCol(t("transactions.table.actions")),
        branchCol,
        column.accessor((r) => r.dueDate ?? "", {
          id: "dueDate",
          header: t("transactions.table.due"),
          cell: (c) => (c.getValue() ? formatDate(c.getValue()) : "-"),
        }),
        docNoCol,
        ...(showInvoiceDate ? [invoiceDateCol] : []),
        typeCol,
        amountCol,
        descCol,
        actionsCol,
      ];
    }
    return [
      dateCol(t("transactions.table.plainDate")),
      branchCol,
      docNoCol,
      ...(showInvoiceDate ? [invoiceDateCol] : []),
      amountCol,
      methodCol,
      column.accessor(
        (r) => t(`translation:finance.source.${r.sourceType}`, { defaultValue: r.sourceType }),
        { id: "source", header: t("transactions.table.source") },
      ),
      descCol,
      actionsCol,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hücre işleyicileri props'tan; sütun kümesi sekme ve bakiyeye bağlı
  }, [tab, showInvoiceDate, balances, t, typeName, props.canVoidRows, props.canEditDocuments]);

  const meta = TAB_META[tab];
  return (
    <>
      <ul
        className="nav nav-tabs nav-tabs-sm"
        id="transactionTabs"
        role="tablist"
        aria-label={t("translation:common.a11y.txTabs")}
      >
        {tabs.map((key, index) => {
          const selected = key === tab;
          return (
            <li className="nav-item" role="presentation" key={key}>
              <a
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                className={selected ? "nav-link active" : "nav-link"}
                id={TAB_META[key].id}
                href={`#${TAB_META[key].pane}`}
                role="tab"
                aria-selected={selected}
                aria-controls={TAB_META[key].pane}
                tabIndex={selected ? 0 : -1}
                onClick={(e) => {
                  e.preventDefault();
                  onTab(key);
                }}
                onKeyDown={(e) => onTabKey(e, index)}
              >
                <i className={TAB_META[key].icon} aria-hidden="true" />{" "}
                {t(`transactions.tabs.${key}`)}
              </a>
            </li>
          );
        })}
        <li
          className="nav-item ml-auto d-flex align-items-center"
          role="presentation"
          style={{ gap: 6 }}
        >
          {props.tabActions}
        </li>
      </ul>
      <div className="tab-content" id="transactionTabsContent">
        <div
          className="tab-pane fade show active"
          id={meta.pane}
          role="tabpanel"
          aria-labelledby={meta.id}
        >
          <div className={tab === "ALL" ? "table-responsive mt-1" : "table-responsive mt-2"}>
            <ZtoDataTable
              key={tab}
              id={meta.table}
              columns={columns}
              data={tabRows}
              getRowId={(r) => r.id}
              tableClassName="table table-compact table-bordered table-striped table-hover"
              dom={
                '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>rt<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>'
              }
              pageLength={25}
              lengthMenu={[10, 25, 50, 100, -1]}
              order={[{ id: "transactionDate", desc: true }]}
              processing={props.loading}
              emptyText={t(
                props.seasonSelected
                  ? "transactions.table.emptySeason"
                  : "transactions.table.emptyAccount",
              )}
              rowClassName={(r) => (r.reversed ? "atx-reversed-row" : undefined)}
              pageDecorator={(pageRows, ctx) =>
                seasonMarkers(
                  pageRows,
                  ctx.sorting[0]?.desc === false ? orderedAsc : orderedDesc,
                  seasons,
                  ctx.sorting,
                  "transactionDate",
                ).map((m) => ({
                  beforeIndex: m.beforeIndex,
                  key: m.key,
                  node:
                    m.kind === "season" ? (
                      <tr className="atx-season-row" data-atxmarker="1">
                        <td colSpan={ctx.columnsCount} className="atx-season-cell">
                          <i className="fas fa-calendar-check" aria-hidden="true" />{" "}
                          <Trans
                            t={t}
                            i18nKey="transactions.table.seasonMarker"
                            values={{
                              name: m.season.seasonName,
                              date: isoToTr(m.season.rolloverDate),
                            }}
                            components={{
                              b: <strong />,
                              date: <span className="atx-season-date" />,
                            }}
                          />
                          {m.season.active && (
                            <span className="badge badge-success ml-1">
                              {t("transactions.rollover.active")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      <tr className="atx-opening-row" data-atxmarker="1">
                        <td colSpan={ctx.columnsCount} className="atx-opening-cell">
                          <i className="fas fa-flag-checkered" aria-hidden="true" />{" "}
                          <Trans
                            t={t}
                            i18nKey="transactions.table.openingMarker"
                            values={{
                              group: account.subGroupName,
                              name: account.name,
                              date: formatDate(account.createdAt),
                            }}
                            components={{ b: <strong /> }}
                          />
                        </td>
                      </tr>
                    ),
                }))
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}

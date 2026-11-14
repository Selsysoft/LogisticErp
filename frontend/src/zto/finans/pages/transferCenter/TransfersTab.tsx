import { createColumnHelper } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import { useAuthStore } from "../../../../auth/authStore";
import {
  TRANSFERS_MAX_SIZE,
  useTransferSummary,
  useTransfers,
} from "../../../../pages/finance/fundApi";
import type { TransferListRow, TransferListType } from "../../../../pages/finance/types";
import {
  ZtoBranchSelect,
  ZtoDataTable,
  currencySymbol,
  formatDate,
  formatMoney,
  formatN2,
  toPageRequest,
  type DataTableState,
} from "../../../components";
import { accountTransactionsPath, fundTransactionsPath } from "../../navItems";
import {
  SUMMARY_CARDS,
  TRANSFERS_LANGUAGE,
  collectionBadge,
  linkRange,
  rateText,
  rowTypeKey,
  summaryCount,
  transferBadgeClass,
  typeFilterOptions,
} from "./transferCenterLogic";

type Props = {
  /** Kaynak belge bağlantısından gelen arama (`?tab=transfers&q=<kod>`). */
  initialQuery: string;
  /** Bağlantıdaki transfer tarihi (`&from&to`, F-12.2-R2); "" → varsayılan aralık. */
  initialFrom?: string;
  initialTo?: string;
  multiCompany: boolean;
  canWrite: boolean;
  onEdit: (row: TransferListRow) => void;
  onDelete: (row: TransferListRow) => void;
  onCount: (count: number) => void;
};

type Filters = {
  branchId: string;
  /** "" = Tümü (konsolide); şirket kimliği. */
  companyId: string;
  type: TransferListType | "";
  from: string;
  to: string;
  q: string;
};

const DOM = '<"d-flex justify-content-between align-items-center mb-1"l<"ml-auto"f>>tpi';
const LENGTHS = [10, 25, 50, 100, -1];
const column = createColumnHelper<TransferListRow>();

/**
 * İlk süzgeçler. Kaynak belge bağlantısıyla (`q`) açılışta tarih aralığı bağlantıdaki transfer
 * tarihi, şirket "Tümü" — başka şirketin ya da eski tarihli transferi gizlenmesin (F-12.2-R2).
 */
function initialFilters(q: string, companyId: string | null, from = "", to = ""): Filters {
  return {
    branchId: "",
    companyId: q ? "" : (companyId ?? ""),
    type: "",
    ...linkRange(from, to),
    q,
  };
}

/**
 * "Transferler" sekmesi (ZTO BS:1087-1200, bsjs `loadTransfers` :3362-3517): süzgeçler, özet kartları
 * (B12 "Virman / EFT / Havale"), 13 sütunlu sunucu sayfalı tablo. Toplu yansıtma ve mükerrer temizleme
 * düğmeleri yazılmaz (C9); şirketler arası satırda yalnız Sil (= ters kayıt).
 */
export function TransfersTab({
  initialQuery,
  initialFrom = "",
  initialTo = "",
  multiCompany,
  canWrite,
  onEdit,
  onDelete,
  onCount,
}: Props) {
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.${key}`);
  const activeCompanyId = useActiveCompanyId();
  const companies = activeCompanies(useAuthStore((state) => state.me?.companies));
  const [draft, setDraft] = useState<Filters>(() =>
    initialFilters(initialQuery, activeCompanyId, initialFrom, initialTo),
  );
  const [applied, setApplied] = useState<Filters>(draft);
  const [table, setTable] = useState<DataTableState>({
    start: 0,
    length: 25,
    search: "",
    sorting: [],
  });
  const request = toPageRequest(table, TRANSFERS_MAX_SIZE);

  const params = {
    companyId: multiCompany ? applied.companyId || null : undefined,
    branchIds: applied.branchId ? [applied.branchId] : undefined,
    transferType: applied.type || undefined,
    from: applied.from,
    to: applied.to,
    // Tablo araması süzgeç metnini ezer (sunucuda tek `q`).
    q: request.search || applied.q || undefined,
  };
  const transfers = useTransfers(params, request.page, request.size);
  const summary = useTransferSummary(params);
  const total = transfers.data?.totalElements;
  useEffect(() => {
    if (total !== undefined) onCount(total);
  }, [total, onCount]);

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.shortName ?? "";

  const columns = useMemo(
    () => [
      column.accessor("transferDate", {
        header: () => tc("transfers.date"),
        cell: (info) => formatDate(info.getValue()),
      }),
      column.accessor("code", {
        header: () => tc("transfers.code"),
        cell: (info) => <strong>{info.getValue()}</strong>,
      }),
      column.display({
        id: "type",
        header: () => tc("transfers.type"),
        meta: { className: "transfer-type-col", cellClassName: "transfer-type-cell" },
        cell: ({ row }) => (
          <span className={`transfer-badge ${transferBadgeClass(row.original)}`}>
            {t(`transferCenter.${rowTypeKey(row.original)}`)}
            {row.original.recordType === "INTERCOMPANY" &&
              ` ${t(`transferCenter.types.${row.original.transferType}`)}`}
          </span>
        ),
      }),
      column.display({
        id: "source",
        header: () => tc("transfers.source"),
        cell: ({ row }) => (
          <FundLink
            kind={row.original.fromKind}
            id={row.original.fromFundId}
            name={row.original.fromFundName}
            company={multiCompany ? companyName(row.original.companyId) : ""}
          />
        ),
      }),
      column.display({
        id: "sourceAmount",
        header: () => tc("transfers.sourceAmount"),
        meta: { className: "text-right", cellClassName: "text-danger font-weight-bold" },
        cell: ({ row }) =>
          formatMoney(row.original.sourceMoney.amount, row.original.sourceMoney.currency),
      }),
      column.display({
        id: "rate",
        header: () => tc("transfers.rateDirection"),
        meta: { className: "text-center", cellClassName: "p-1" },
        cell: ({ row }) => {
          const r = row.original;
          const fx = r.recordType === "FUND_TRANSFER" && r.transferType === "FX_EXCHANGE";
          const rate = rateText(
            r.rate,
            r.rateOperation,
            r.sourceMoney.currency,
            r.targetMoney.currency,
          );
          return (
            <span style={{ whiteSpace: "nowrap" }}>
              <i className="fas fa-arrow-right text-primary" aria-hidden="true" />
              {fx && (
                <div style={{ fontSize: 9, marginTop: 2, color: "#6b7280", whiteSpace: "nowrap" }}>
                  {rate.symbol} <span style={{ fontWeight: 700 }}>{rate.value}</span>{" "}
                  <span style={{ color: "#7c3aed" }}>{rate.currency}</span>
                </div>
              )}
            </span>
          );
        },
      }),
      column.display({
        id: "target",
        header: () => tc("transfers.target"),
        cell: ({ row }) => (
          <FundLink
            kind={row.original.toKind}
            id={row.original.toFundId}
            name={row.original.toFundName}
            company={
              multiCompany ? companyName(row.original.toCompanyId ?? row.original.companyId) : ""
            }
          />
        ),
      }),
      column.display({
        id: "targetAmount",
        header: () => tc("transfers.targetAmount"),
        meta: { className: "text-right", cellClassName: "text-success font-weight-bold" },
        cell: ({ row }) =>
          formatMoney(row.original.targetMoney.amount, row.original.targetMoney.currency),
      }),
      column.display({
        id: "cost",
        header: () => tc("transfers.cost"),
        meta: { className: "text-right" },
        cell: ({ row }) =>
          row.original.costTotalTl > 0 ? `${formatN2(row.original.costTotalTl)} ₺` : "-",
      }),
      column.display({
        id: "costBank",
        header: () => tc("transfers.costBank"),
        meta: { cellClassName: "small" },
        cell: ({ row }) => row.original.costFundNames || "-",
      }),
      column.display({
        id: "collection",
        header: () => tc("transfers.collection"),
        meta: { cellClassName: "small" },
        cell: ({ row }) => <CollectionCell row={row.original} />,
      }),
      column.display({
        id: "description",
        header: () => tc("transfers.description"),
        meta: { cellClassName: "small text-muted" },
        cell: ({ row }) => (
          <span
            title={row.original.description ?? ""}
            style={{
              display: "inline-block",
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.original.description || "-"}
          </span>
        ),
      }),
      column.display({
        id: "actions",
        header: () => tc("transfers.actions"),
        meta: { className: "text-center" },
        cell: ({ row }) => {
          const r = row.original;
          if (r.status === "REVERSED") {
            return <span className="badge badge-secondary">{tc("transfers.cancelled")}</span>;
          }
          if (!canWrite) return null;
          return (
            <div className="d-flex flex-column align-items-center gap-1">
              <div className="btn-group" role="group">
                {r.recordType === "FUND_TRANSFER" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary mr-1"
                    title={tc("transfers.edit")}
                    aria-label={`${tc("transfers.edit")} ${r.code}`}
                    onClick={() => onEdit(r)}
                  >
                    <i className="fas fa-edit" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  title={tc("transfers.delete")}
                  aria-label={`${tc("transfers.delete")} ${r.code}`}
                  onClick={() => onDelete(r)}
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, multiCompany, canWrite, companies, onEdit, onDelete],
  );

  function apply() {
    setApplied(draft);
    setTable((s) => ({ ...s, start: 0 }));
  }

  function clear() {
    const reset = initialFilters("", activeCompanyId);
    setDraft(reset);
    setApplied(reset);
    setTable((s) => ({ ...s, start: 0 }));
  }

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      <div className="filter-section">
        <div className="row align-items-end">
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor="transferFilterWorkPlace">
              {tc("transfers.workPlace")}
            </label>
            <ZtoBranchSelect
              id="transferFilterWorkPlace"
              className="form-control form-control-sm"
              value={draft.branchId}
              onChange={(value) => set("branchId", value)}
              allowAll
              companyId={multiCompany ? draft.companyId || null : "active"}
            />
          </div>
          {multiCompany && (
            <div className="col-md-2 col-6 mb-2">
              <label className="form-label" htmlFor="transferFilterCompany">
                {tc("transfers.company")}
              </label>
              <select
                id="transferFilterCompany"
                className="form-control form-control-sm"
                value={draft.companyId}
                onChange={(event) => set("companyId", event.target.value)}
              >
                <option value="">{tc("transfers.all")}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.shortName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor="transferFilterType">
              {tc("transfers.type")}
            </label>
            <select
              id="transferFilterType"
              className="form-control form-control-sm"
              value={draft.type}
              onChange={(event) => set("type", event.target.value as Filters["type"])}
            >
              {typeFilterOptions(multiCompany).map((value) => (
                <option key={value || "all"} value={value}>
                  {value ? tc(`types.${value}`) : tc("transfers.all")}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor="transferFilterStartDate">
              {tc("transfers.start")}
            </label>
            <input
              type="date"
              id="transferFilterStartDate"
              className="form-control form-control-sm"
              value={draft.from}
              onChange={(event) => set("from", event.target.value)}
            />
          </div>
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor="transferFilterEndDate">
              {tc("transfers.end")}
            </label>
            <input
              type="date"
              id="transferFilterEndDate"
              className="form-control form-control-sm"
              value={draft.to}
              onChange={(event) => set("to", event.target.value)}
            />
          </div>
          <div className="col-md-2 col-6 mb-2">
            <input
              type="text"
              id="transferFilterText"
              className="form-control form-control-sm"
              placeholder={tc("transfers.search")}
              aria-label={tc("transfers.search")}
              value={draft.q}
              onChange={(event) => set("q", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") apply();
              }}
            />
          </div>
          <div className="col-md-2 col-6 mb-2">
            <button
              type="button"
              className="btn btn-primary btn-sm mr-1"
              id="btnTransferFilter"
              aria-label={tc("transfers.filter")}
              onClick={apply}
            >
              <i className="fas fa-search" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              id="btnTransferClear"
              aria-label={tc("transfers.clear")}
              onClick={clear}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="row mb-2" id="transferSummaryCards">
        {SUMMARY_CARDS.filter((card) => !card.multiOnly || multiCompany).map((card) => (
          <div className="col-6 col-md-2 mb-2" key={card.group}>
            <div className={`summary-card ${card.className}`}>
              <div className="small">{tc(card.key)}</div>
              <div className="h5 mb-0">{summaryCount(summary.data, card.group)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header py-2 d-flex justify-content-between align-items-center">
          <span className="font-weight-bold text-secondary" id="transfersListTitle">
            <i className="fas fa-list" aria-hidden="true" /> {tc("transfers.listTitle")}
          </span>
        </div>
        <div className="card-body p-0">
          <div
            className="table-responsive"
            role="region"
            aria-labelledby="transfersListTitle"
            tabIndex={0}
          >
            {transfers.isError ? (
              <div className="alert alert-danger m-2" role="alert">
                {tc("transfers.loadError")}
              </div>
            ) : (
              <ZtoDataTable
                id="transfersTable"
                columns={columns}
                data={transfers.data?.content ?? []}
                getRowId={(row) => `${row.recordType}:${row.id}`}
                tableClassName="table table-bordered table-hover table-sm mb-0"
                dom={DOM}
                pageLength={25}
                lengthMenu={LENGTHS}
                ordering={false}
                manualPagination
                recordsTotal={transfers.data?.totalElements ?? 0}
                processing={transfers.isFetching}
                onStateChange={setTable}
                language={TRANSFERS_LANGUAGE}
                searchPlaceholder={tc("transfers.tableSearch")}
                emptyText={TRANSFERS_LANGUAGE.emptyTable}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function FundLink({
  kind,
  id,
  name,
  company,
}: {
  kind: "BANK" | "CASH";
  id: string;
  name: string | null;
  company: string;
}) {
  const { t } = useTranslation("ztoFinans");
  if (!name) return <>-</>;
  const cash = kind === "CASH";
  return (
    <>
      <Link
        to={fundTransactionsPath(kind, { fundId: id })}
        target="_blank"
        rel="noopener noreferrer"
        className={cash ? "statement-cash-link" : "statement-bank-link"}
        title={t(
          cash ? "transferCenter.transfers.openCashTx" : "transferCenter.transfers.openBankTx",
        )}
      >
        <i
          className={`fas ${cash ? "fa-cash-register" : "fa-university"} mr-1`}
          aria-hidden="true"
        />
        {name}
      </Link>
      {company && <div className="small text-muted">{company}</div>}
    </>
  );
}

function CollectionCell({ row }: { row: TransferListRow }) {
  const { t } = useTranslation("ztoFinans");
  const collection = row.collection;
  if (!collection || collection.state === "NONE") return <>-</>;
  const badge = collectionBadge(collection.state);
  const sym = currencySymbol(row.sourceMoney.currency);
  return (
    <>
      <div className="collection-info">
        <div className="collection-doc">{t("transferCenter.transfers.noDocument")}</div>
        <div className="collection-date small text-muted">{formatDate(collection.date)}</div>
        <div className="collection-amount small">
          {formatN2(collection.amount)} {sym}
        </div>
      </div>
      <div className="customer-info">
        {collection.accountId ? (
          <div className="customer-code small text-muted">
            <Link
              to={accountTransactionsPath(collection.accountId)}
              target="_blank"
              rel="noopener noreferrer"
              className="statement-account-link"
              title={t("transferCenter.transfers.openAccount")}
            >
              <i className="fas fa-user-circle mr-1" aria-hidden="true" />
              {collection.accountName}
            </Link>
          </div>
        ) : (
          <div className="customer-name">{collection.accountName ?? "-"}</div>
        )}
      </div>
      <span className={badge.className}>{t(`transferCenter.${badge.key}`)}</span>
    </>
  );
}

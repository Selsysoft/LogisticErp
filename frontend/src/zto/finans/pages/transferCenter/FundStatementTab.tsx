import { createColumnHelper } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import { useAuthStore } from "../../../../auth/authStore";
import { useCurrencies } from "../../../../pages/finance/common";
import {
  FUND_TRANSACTIONS_MAX_SIZE,
  useFundList,
  useFundTransactions,
} from "../../../../pages/finance/fundApi";
import type { FundKind, FundTransactionRow } from "../../../../pages/finance/types";
import {
  ZtoBranchSelect,
  ZtoDataTable,
  currencySymbol,
  formatDate,
  formatN2,
  toPageRequest,
  type DataTableState,
} from "../../../components";
import { fundTransactionsPath } from "../../navItems";
import {
  STATEMENT_LANGUAGE,
  defaultRange,
  statementBadgeClass,
  statementTypeKey,
} from "./transferCenterLogic";

type Props = {
  kind: FundKind;
  /** Sekme görünür mü: ZTO her gösterimde yeniden yükler. */
  active: boolean;
  multiCompany: boolean;
  onCount: (count: number) => void;
};

type Filters = {
  branchId: string;
  companyId: string;
  fundId: string;
  currency: string;
  from: string;
  to: string;
  q: string;
};

/** Blackrose sayfalaması (OK-12.2-24): 100 satır, bilgi + sayfalama altta. */
const DOM = 'rt<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>';
const PAGE_SIZE = 100;
const column = createColumnHelper<FundTransactionRow>();

function initialFilters(companyId: string | null): Filters {
  return {
    branchId: "",
    companyId: companyId ?? "",
    fundId: "",
    currency: "",
    q: "",
    ...defaultRange(),
  };
}

/**
 * "Tüm Banka Ekstreleri" / "Tüm Kasa Ekstreleri" (ZTO BS:917-1085, bsjs `loadStatement` :4112-4197):
 * süzgeçler ve 9 sütunlu ekstre; yürüyen bakiye sunucuda (B10). Temizle her iki sekmede de yeniden
 * yükler (B15). ≥ 2 şirkette Şirket süzgeci ve sütunu (§5.12).
 */
export function FundStatementTab({ kind, active, multiCompany, onCount }: Props) {
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.${key}`);
  const bank = kind === "BANK";
  const prefix = bank ? "" : "Cash";
  const activeCompanyId = useActiveCompanyId();
  const companies = activeCompanies(useAuthStore((state) => state.me?.companies));
  const currencies = useCurrencies();
  const [draft, setDraft] = useState<Filters>(() => initialFilters(activeCompanyId));
  const [applied, setApplied] = useState<Filters>(draft);
  const [table, setTable] = useState<DataTableState>({
    start: 0,
    length: PAGE_SIZE,
    search: "",
    sorting: [],
  });
  const request = toPageRequest(table, FUND_TRANSACTIONS_MAX_SIZE);
  const companyParam = multiCompany ? draft.companyId || null : undefined;
  const funds = useFundList({ kind, companyId: companyParam });
  const fundOptions = (funds.data ?? []).filter(
    (fund) => !draft.branchId || fund.branchId === draft.branchId,
  );

  const params = {
    kind,
    companyId: multiCompany ? applied.companyId || null : undefined,
    branchIds: applied.branchId ? [applied.branchId] : undefined,
    fundIds: applied.fundId ? [applied.fundId] : undefined,
    currency: applied.currency || undefined,
    from: applied.from,
    to: applied.to,
    q: applied.q || undefined,
  };
  const transactions = useFundTransactions(params, request.page, request.size);
  const { refetch } = transactions;
  const total = transactions.data?.totalElements;
  useEffect(() => {
    if (total !== undefined) onCount(total);
  }, [total, onCount]);
  // Sekme her gösterildiğinde tazelenir (ZTO shown.bs.tab → loadStatement).
  useEffect(() => {
    if (active) void refetch();
  }, [active, refetch]);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.shortName ?? "";

  const columns = useMemo(
    () => [
      column.accessor("transactionDate", {
        header: () => tc("statement.date"),
        cell: (info) => formatDate(info.getValue()),
      }),
      column.display({
        id: "fund",
        header: () => (bank ? tc("statement.bank") : tc("statement.cash")),
        cell: ({ row }) => (
          <Link
            to={fundTransactionsPath(kind, { fundId: row.original.fundAccountId })}
            target="_blank"
            rel="noopener noreferrer"
            className={bank ? "statement-bank-link" : "statement-cash-link"}
            title={bank ? tc("statement.openBank") : tc("statement.openCash")}
          >
            <i
              className={`fas ${bank ? "fa-university" : "fa-cash-register"} mr-1`}
              aria-hidden="true"
            />
            {bank ? (row.original.bankName ?? row.original.fundName) : row.original.fundName}
          </Link>
        ),
      }),
      ...(multiCompany
        ? [
            column.display({
              id: "company",
              header: () => tc("statement.company"),
              cell: ({ row }) => companyName(row.original.companyId),
            }),
          ]
        : []),
      column.display({
        id: "type",
        header: () => tc("statement.type"),
        meta: { className: "text-center statement-type-col", cellClassName: "statement-type-cell" },
        cell: ({ row }) => (
          <span className={`transfer-badge ${statementBadgeClass(row.original)}`}>
            {tc(statementTypeKey(row.original))}
          </span>
        ),
      }),
      column.display({
        id: "in",
        header: () => tc("statement.in"),
        meta: { className: "text-right", cellClassName: "text-success" },
        cell: ({ row }) => (row.original.direction === "IN" ? formatN2(row.original.amount) : ""),
      }),
      column.display({
        id: "out",
        header: () => tc("statement.out"),
        meta: { className: "text-right", cellClassName: "text-danger" },
        cell: ({ row }) => (row.original.direction === "OUT" ? formatN2(row.original.amount) : ""),
      }),
      column.accessor("runningBalance", {
        header: () => tc("statement.balance"),
        meta: { className: "text-right", cellClassName: "font-weight-bold" },
        cell: (info) => formatN2(info.getValue()),
      }),
      column.accessor("currency", {
        header: () => tc("statement.currency"),
        cell: (info) => currencySymbol(info.getValue()),
      }),
      column.accessor("description", {
        header: () => tc("statement.description"),
        meta: { cellClassName: "small" },
        cell: (info) => info.getValue() ?? "",
      }),
      column.accessor("transferCode", {
        header: () => tc("statement.ref"),
        cell: (info) => info.getValue() ?? "",
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, bank, kind, multiCompany, companies],
  );

  function apply() {
    setApplied(draft);
    setTable((s) => ({ ...s, start: 0 }));
  }

  function clear() {
    const reset = initialFilters(activeCompanyId);
    setDraft(reset);
    setApplied(reset);
    setTable((s) => ({ ...s, start: 0 }));
    void refetch();
  }

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const titleId = bank ? "bankStatementTitle" : "cashStatementTitle";

  return (
    <>
      <div className="filter-section" id={bank ? "statementFilters" : undefined}>
        <div className="row align-items-end">
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor={`filter${prefix}WorkPlace`}>
              {tc("statement.workPlace")}
            </label>
            <ZtoBranchSelect
              id={`filter${prefix}WorkPlace`}
              className="form-control form-control-sm"
              value={draft.branchId}
              onChange={(value) => setDraft((d) => ({ ...d, branchId: value, fundId: "" }))}
              allowAll
              companyId={multiCompany ? draft.companyId || null : "active"}
            />
          </div>
          {multiCompany && (
            <div className="col-md-2 col-6 mb-2">
              <label className="form-label" htmlFor={`filter${prefix}Company`}>
                {tc("statement.company")}
              </label>
              <select
                id={`filter${prefix}Company`}
                className="form-control form-control-sm"
                value={draft.companyId}
                onChange={(event) =>
                  setDraft((d) => ({
                    ...d,
                    companyId: event.target.value,
                    branchId: "",
                    fundId: "",
                  }))
                }
              >
                <option value="">{tc("statement.all")}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.shortName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor={bank ? "filterBank" : "filterCash"}>
              {bank ? tc("statement.bank") : tc("statement.cash")}
            </label>
            <select
              id={bank ? "filterBank" : "filterCash"}
              className="form-control form-control-sm"
              value={draft.fundId}
              onChange={(event) => set("fundId", event.target.value)}
            >
              <option value="">{tc("statement.all")}</option>
              {fundOptions.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {`${bank ? (fund.bankName ?? fund.name) : fund.name} (${fund.currency})`}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor={`filter${prefix}Currency`}>
              {tc("statement.currency")}
            </label>
            <select
              id={`filter${prefix}Currency`}
              className="form-control form-control-sm"
              value={draft.currency}
              onChange={(event) => set("currency", event.target.value)}
            >
              <option value="">{tc("statement.all")}</option>
              {(currencies.data ?? []).map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currencySymbol(currency.code)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor={`filter${prefix}StartDate`}>
              {tc("statement.start")}
            </label>
            <input
              type="date"
              id={`filter${prefix}StartDate`}
              className="form-control form-control-sm"
              value={draft.from}
              onChange={(event) => set("from", event.target.value)}
            />
          </div>
          <div className="col-md-2 col-6 mb-2">
            <label className="form-label" htmlFor={`filter${prefix}EndDate`}>
              {tc("statement.end")}
            </label>
            <input
              type="date"
              id={`filter${prefix}EndDate`}
              className="form-control form-control-sm"
              value={draft.to}
              onChange={(event) => set("to", event.target.value)}
            />
          </div>
          <div className="col-md-2 col-6 mb-2">
            <div className="input-group input-group-sm">
              <input
                type="text"
                id={`filter${prefix}Text`}
                className="form-control"
                placeholder={tc("statement.search")}
                aria-label={tc("statement.search")}
                value={draft.q}
                onChange={(event) => set("q", event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") apply();
                }}
              />
              <div className="input-group-append">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  id={bank ? "btnFilter" : "btnCashFilter"}
                  onClick={apply}
                >
                  <i className="fas fa-search" aria-hidden="true" /> {tc("statement.filter")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  id={bank ? "btnClear" : "btnCashClear"}
                  aria-label={tc("statement.clear")}
                  onClick={clear}
                >
                  <i className="fas fa-times" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          <span className="sr-only" id={titleId}>
            {bank ? tc("statement.bank") : tc("statement.cash")}
          </span>
          <div className="table-responsive" role="region" aria-labelledby={titleId} tabIndex={0}>
            {transactions.isError ? (
              <table className="table table-bordered table-hover table-sm mb-0">
                <tbody>
                  <tr>
                    <td className="text-center text-danger">
                      {bank ? tc("statement.bankLoadError") : tc("statement.cashLoadError")}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <ZtoDataTable
                id={bank ? "bankStatementTable" : "cashStatementTable"}
                columns={columns}
                data={transactions.data?.content ?? []}
                getRowId={(row) => row.id}
                tableClassName="table table-bordered table-hover table-sm mb-0"
                dom={DOM}
                pageLength={PAGE_SIZE}
                searchable={false}
                ordering={false}
                lengthChange={false}
                manualPagination
                recordsTotal={transactions.data?.totalElements ?? 0}
                processing={transactions.isFetching}
                onStateChange={setTable}
                language={STATEMENT_LANGUAGE}
                emptyText={STATEMENT_LANGUAGE.emptyTable}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

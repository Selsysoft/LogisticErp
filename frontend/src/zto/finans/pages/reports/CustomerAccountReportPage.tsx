import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import { useAccountGroups } from "../../../../pages/finance/accountApi";
import { useCan, useCurrencies, useMultiCompany } from "../../../../pages/finance/common";
import { useInstrumentList } from "../../../../pages/finance/instrumentApi";
import {
  useAccountPerformance,
  useAgingReport,
  useCurrencyPosition,
  type AccountPerformanceParams,
  type AgingParams,
} from "../../../../pages/finance/reportApi";
import type {
  AgingBasis,
  InstrumentKind,
  InstrumentListItem,
  InstrumentStatus,
} from "../../../../pages/finance/types";
import {
  ZtoAccountSearch,
  ZtoChartLazy,
  ZtoSelect,
  currencySymbol,
  exportExcel,
  formatDate,
  formatMoney,
  formatNumber,
  useZtoSnackbar,
  type ZtoSelectOption,
} from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import { billEditPath, checkEditPath, type CustomerAccountReportTab } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { addDaysIso, localToday } from "../../reports/reportDates";
import {
  AGING_BUCKETS,
  BILL_FILTER_ORDER,
  BILL_STATUS_FILTERS,
  CAR_EXCEL_FILES,
  CAR_TABS,
  CHECK_FILTER_ORDER,
  CHECK_STATUS_FILTERS,
  MATURITY_BADGE,
  POSITION_BADGE,
  POSITION_NET_CLASS,
  addMonthsIso,
  agingTlTotal,
  agingTotals,
  balanceClass,
  daysLeft,
  excelNumber,
  instrumentSummary,
  isCollateral,
  maturityGroup,
  nextTabIndex,
  parseCarTab,
  partyOf,
  positionChart,
  positionView,
  scoreBadge,
  sortByDue,
  statusBadge,
  totalsText,
  unmatchedTotal,
  type BillStatusFilter,
  type CheckStatusFilter,
} from "./customerAccountReportLogic";

/** Seçili cari (ZtoAccountSearch). */
type PickedAccount = { id: string; label: string } | null;

/** Aynı süzgeçle yeniden "Raporu Getir": anahtar değişmediği için sorgu elle yenilenir (ZTO yeniden yükler). */
function sameParams(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Sorgu hatası ZtoSnackbar'da da gösterilir (satırdaki ZTO iletisine ek). */
function useErrorSnackbar(error: Error | null) {
  const snackbar = useZtoSnackbar();
  const { t } = useTranslation("ztoFinans");
  useEffect(() => {
    if (error) snackbar.show(errorMessage(error, t("customerAccountReport.noData")), "error");
  }, [error, snackbar, t]);
}

/** Şirket seçeneği değeri → API `companyId` (çok şirketli değilse aktif şirket: undefined). */
function companyParam(multiCompany: boolean, value: string): string | null | undefined {
  if (!multiCompany) return undefined;
  return value === "" ? null : value;
}

/** "Konsolide" + aktif şirketler (Blackrose eki şirket seçici). */
function useCompanyOptions(): ZtoSelectOption[] {
  const { t } = useTranslation("ztoFinans");
  const companies = useAuthStore((state) => state.me?.companies);
  const consolidated = t("customerAccountReport.consolidated");
  return useMemo(
    () => [
      { value: "", label: consolidated },
      ...activeCompanies(companies).map((c) => ({ value: c.id, label: c.shortName })),
    ],
    [companies, consolidated],
  );
}

// ---------------------------------------------------------------------------------------------
// Ortak kartlar (CAR:54-115)
// ---------------------------------------------------------------------------------------------

function FilterCard(props: {
  titleId: string;
  onSubmit: () => void;
  children: ReactNode;
  extraRow?: ReactNode;
}) {
  const { t } = useTranslation("ztoFinans");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <div className="card">
      <div className="card-header bg-light">
        <h6 className="mb-0" id={props.titleId}>
          <i className="fas fa-filter" aria-hidden="true" /> {t("customerAccountReport.filters")}
        </h6>
      </div>
      <div className="card-body">
        <form onSubmit={submit} aria-labelledby={props.titleId}>
          <div className="row">
            {props.children}
            <div className="col-md-3">
              <div className="form-group">
                <label aria-hidden="true">&nbsp;</label>
                <div>
                  <button type="submit" className="btn btn-primary btn-block">
                    <i className="fas fa-search" aria-hidden="true" />{" "}
                    {t("customerAccountReport.getReport")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {props.extraRow}
        </form>
      </div>
    </div>
  );
}

function ReportCard(props: {
  titleId: string;
  title: string;
  onExcel: () => void;
  excelDisabled: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="card mt-3">
      <div className="card-header bg-light">
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0" id={props.titleId}>
            <i className="fas fa-table" aria-hidden="true" /> {props.title}
          </h6>
          <button
            type="button"
            className="btn btn-success btn-sm"
            disabled={props.excelDisabled}
            onClick={props.onExcel}
          >
            <i className="fas fa-file-excel" aria-hidden="true" />{" "}
            {t("customerAccountReport.excel")}
          </button>
        </div>
      </div>
      <div className="card-body">{props.children}</div>
    </div>
  );
}

/** `div.table-responsive` kaydırma bölgesi (MWG `responsive-table`: ad + klavyeyle kaydırma). */
function TableRegion({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div className="table-responsive" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      {children}
    </div>
  );
}

/** Tek hücreli durum satırı (ilk durum / yükleniyor / veri yok). */
function StateRow({ colSpan, state }: { colSpan: number; state: "initial" | "loading" | "empty" }) {
  const { t } = useTranslation("ztoFinans");
  if (state === "initial") {
    return (
      <tr>
        <td colSpan={colSpan} className="text-center">
          <i className="fas fa-info-circle" aria-hidden="true" />{" "}
          {t("customerAccountReport.initial")}
        </td>
      </tr>
    );
  }
  if (state === "loading") {
    return (
      <tr>
        <td colSpan={colSpan} className="text-center text-muted">
          {t("customerAccountReport.loading")}
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-danger">
        {t("customerAccountReport.noData")}
      </td>
    </tr>
  );
}

function rowState(
  applied: boolean,
  query: { isFetching: boolean; isError: boolean; data?: readonly unknown[] },
): "initial" | "loading" | "empty" | "rows" {
  if (!applied) return "initial";
  if (query.isError) return "empty";
  if (!query.data) return query.isFetching ? "loading" : "empty";
  return query.data.length === 0 ? "empty" : "rows";
}

function AccountField(props: {
  inputId: string;
  value: PickedAccount;
  onChange: (value: PickedAccount) => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const labelId = `${props.inputId}Label`;
  return (
    <div className="form-group">
      <label id={labelId} htmlFor={props.inputId}>
        {t("customerAccountReport.account")}
      </label>
      <ZtoAccountSearch
        variant="listGroup"
        ids={{ input: props.inputId, results: `${props.inputId}Results` }}
        placeholder={t("customerAccountReport.allAccounts")}
        emptyText={t("customerAccountReport.accountEmpty")}
        value={props.value}
        ariaLabelledBy={labelId}
        labelOf={(hit) => `${hit.code} - ${hit.name}`}
        renderItem={(hit) => `${hit.code} - ${hit.name}`}
        onSelect={(hit) => props.onChange({ id: hit.id, label: `${hit.code} - ${hit.name}` })}
        onClear={() => props.onChange(null)}
        onInputChange={() => props.onChange(null)}
      />
    </div>
  );
}

function DateField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="form-group">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        type="date"
        id={props.id}
        name={props.id}
        className="form-control"
        required
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Sekme 1 — Cari Yaşlandırma (CAR:50-153, 600-661)
// ---------------------------------------------------------------------------------------------

const BUCKET_HEADERS = ["0-30", "31-60", "61-90", "90+"] as const;

function AgingPane() {
  const { t } = useTranslation("ztoFinans");
  const a = (key: string) => t(`customerAccountReport.aging.${key}`);
  const today = useMemo(() => localToday(), []);
  const multiCompany = useMultiCompany();
  const activeCompanyId = useActiveCompanyId();
  const employeeVisible = useCan("FINANCE_EMPLOYEE_VIEW");
  const groups = useAccountGroups();
  const companyOptions = useCompanyOptions();
  const [account, setAccount] = useState<PickedAccount>(null);
  const [group, setGroup] = useState("");
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE");
  const [basis, setBasis] = useState<AgingBasis>("DUE");
  const [company, setCompany] = useState(activeCompanyId ?? "");
  const [applied, setApplied] = useState<AgingParams | null>(null);
  const query = useAgingReport(applied ?? { type: "RECEIVABLE", asOf: "" }, {
    enabled: applied !== null,
  });
  useErrorSnackbar(query.error);

  const allGroupsLabel = a("allGroups");
  const groupOptions = useMemo<ZtoSelectOption[]>(
    () => [
      { value: "", label: allGroupsLabel },
      ...(groups.data ?? [])
        .filter((g) => g.active && (employeeVisible || g.accountType !== "EMPLOYEE"))
        .slice()
        .sort((x, y) => x.sortOrder - y.sortOrder)
        .map((g) => ({ value: g.code, label: g.name })),
    ],
    [groups.data, employeeVisible, allGroupsLabel],
  );

  const submit = () => {
    const next: AgingParams = {
      type: direction,
      asOf: date,
      basis,
      companyId: companyParam(multiCompany, company),
      accountId: account?.id,
      subGroups: group ? [group] : undefined,
    };
    if (applied && sameParams(applied, next)) void query.refetch();
    else setApplied(next);
  };

  const rows = query.data ?? [];
  const state = rowState(applied !== null, query);
  const totals = state === "rows" ? agingTotals(rows) : [];
  const tlTotal = state === "rows" ? agingTlTotal(rows) : null;

  const exportRows = () =>
    exportExcel({
      fileName: CAR_EXCEL_FILES.aging,
      title: a("reportTitle"),
      headers: [
        a("code"),
        a("name"),
        a("group"),
        a("phone"),
        a("currency"),
        a("current"),
        ...BUCKET_HEADERS,
        a("total"),
      ],
      rows: rows.map((row) => [
        row.accountCode,
        row.accountName,
        row.subGroupName,
        row.phone ?? "",
        row.currency,
        ...AGING_BUCKETS.map((key) => excelNumber(row[key])),
        excelNumber(row.total),
      ]),
    });

  return (
    <>
      <FilterCard
        titleId="agingFiltersTitle"
        onSubmit={submit}
        extraRow={
          // Blackrose eki (OK-12.8-19): yön, taban, şirket.
          <div className="row">
            <div className="col-md-3">
              <div className="form-group">
                <label htmlFor="agingType">{a("direction")}</label>
                <ZtoSelect
                  id="agingType"
                  placeholder={null}
                  value={direction}
                  onChange={(value) => setDirection(value === "PAYABLE" ? "PAYABLE" : "RECEIVABLE")}
                  options={[
                    { value: "RECEIVABLE", label: a("receivable") },
                    { value: "PAYABLE", label: a("payable") },
                  ]}
                />
              </div>
            </div>
            <div className="col-md-3">
              <div className="form-group">
                <label htmlFor="agingBasis">{a("basis")}</label>
                <ZtoSelect
                  id="agingBasis"
                  placeholder={null}
                  value={basis}
                  onChange={(value) => setBasis(value === "TRANSACTION" ? "TRANSACTION" : "DUE")}
                  options={[
                    { value: "DUE", label: a("basisDue") },
                    { value: "TRANSACTION", label: a("basisTransaction") },
                  ]}
                />
              </div>
            </div>
            {multiCompany && (
              <div className="col-md-3">
                <div className="form-group">
                  <label htmlFor="agingCompany">{t("customerAccountReport.company")}</label>
                  <ZtoSelect
                    id="agingCompany"
                    placeholder={null}
                    value={company}
                    onChange={setCompany}
                    options={companyOptions}
                  />
                </div>
              </div>
            )}
          </div>
        }
      >
        <div className="col-md-3">
          <AccountField inputId="agingCustomerId" value={account} onChange={setAccount} />
        </div>
        <div className="col-md-3">
          <div className="form-group">
            <label htmlFor="agingAccountGroup">{a("group")}</label>
            <ZtoSelect
              id="agingAccountGroup"
              placeholder={null}
              value={group}
              onChange={setGroup}
              options={groupOptions}
            />
          </div>
        </div>
        <div className="col-md-3">
          <DateField id="agingDate" label={a("date")} value={date} onChange={setDate} />
        </div>
      </FilterCard>

      <ReportCard
        titleId="agingReportTitle"
        title={a("reportTitle")}
        onExcel={() => void exportRows()}
        excelDisabled={state !== "rows"}
      >
        <TableRegion labelledBy="agingReportTitle">
          <table
            className="table table-bordered table-striped table-hover"
            id="agingReportTable"
            aria-busy={query.isFetching}
          >
            <thead className="thead-dark">
              <tr>
                <th rowSpan={2} scope="col">
                  {a("code")}
                </th>
                <th rowSpan={2} scope="col">
                  {a("name")}
                </th>
                <th rowSpan={2} scope="col">
                  {a("group")}
                </th>
                <th rowSpan={2} scope="col">
                  {a("phone")}
                </th>
                <th colSpan={5} scope="colgroup" className="text-center">
                  {a("buckets")}
                </th>
                <th rowSpan={2} scope="col">
                  {a("total")}
                </th>
              </tr>
              <tr>
                <th scope="col" className="text-center">
                  {a("current")}
                </th>
                {BUCKET_HEADERS.map((label) => (
                  <th key={label} scope="col" className="text-center">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state === "rows" ? (
                rows.map((row) => (
                  <tr key={`${row.accountId}-${row.currency}`}>
                    <td>{row.accountCode}</td>
                    <td>
                      <strong>{row.accountName}</strong>
                    </td>
                    <td>
                      <span className="badge badge-secondary">{row.subGroupName}</span>
                    </td>
                    <td>{row.phone || "-"}</td>
                    {AGING_BUCKETS.map((key) => (
                      <td key={key} className="text-right">
                        {formatMoney(row[key], row.currency)}
                      </td>
                    ))}
                    <td className={`text-right ${balanceClass(row.total)} font-weight-bold`}>
                      {formatMoney(row.total, row.currency)}
                    </td>
                  </tr>
                ))
              ) : (
                <StateRow colSpan={10} state={state} />
              )}
            </tbody>
            <tfoot className="font-weight-bold bg-light">
              {totals.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-right">
                    {a("grandTotal")}
                  </td>
                  {[...AGING_BUCKETS, "total"].map((key) => (
                    <td key={key} className="text-right">
                      {formatNumber(0)}
                    </td>
                  ))}
                </tr>
              ) : (
                totals.map((total) => (
                  <tr key={total.currency}>
                    <td colSpan={4} className="text-right">
                      {a("grandTotal")}
                    </td>
                    {AGING_BUCKETS.map((key) => (
                      <td key={key} className="text-right">
                        {formatMoney(total.buckets[key], total.currency)}
                      </td>
                    ))}
                    <td className="text-right">{formatMoney(total.total, total.currency)}</td>
                  </tr>
                ))
              )}
              {tlTotal !== null && (
                <tr>
                  <td colSpan={9} className="text-right">
                    {a("tlTotal")}
                  </td>
                  <td className="text-right">{formatMoney(tlTotal, "TRY")}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </TableRegion>
      </ReportCard>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Sekme 2/3 — Çek / Senet Vadesi (CAR:157-409, 670-858)
// ---------------------------------------------------------------------------------------------

type InstrumentApplied = { dueFrom: string; dueTo: string; statuses: InstrumentStatus[] };

const PANE_IDS = {
  CHECK: {
    prefix: "check",
    title: "checkMaturityTitle",
    filters: "checkFiltersTitle",
    table: "checkMaturityTable",
    part: "checks",
    count: "checkTotalCount",
    amount: "checkTotalAmount",
    week: "checkThisWeek",
    overdue: "checkOverdue",
  },
  NOTE: {
    prefix: "bill",
    title: "billMaturityTitle",
    filters: "billFiltersTitle",
    table: "billMaturityTable",
    part: "bills",
    count: "billTotalCount",
    amount: "billTotalAmount",
    week: "billThisWeek",
    overdue: "billOverdue",
  },
} as const;

function InfoBox(props: { color: string; icon: string; label: string; id: string; value: string }) {
  return (
    <div className="col-md-3">
      <div className={`info-box ${props.color}`}>
        <span className="info-box-icon" aria-hidden="true">
          <i className={props.icon} />
        </span>
        <div className="info-box-content">
          <span className="info-box-text">{props.label}</span>
          <span className="info-box-number" id={props.id}>
            {props.value}
          </span>
        </div>
      </div>
    </div>
  );
}

function InstrumentPane({ kind }: { kind: InstrumentKind }) {
  const { t } = useTranslation("ztoFinans");
  const ids = PANE_IDS[kind];
  const p = (key: string, options?: Record<string, unknown>) =>
    t(`customerAccountReport.${ids.part}.${key}`, options);
  const c = (key: string, options?: Record<string, unknown>) =>
    t(`customerAccountReport.${key}`, options);
  const today = useMemo(() => localToday(), []);
  const canManage = useCan("FINANCE_MANAGE");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => addDaysIso(today, 90));
  const [filter, setFilter] = useState<string>("all");
  const [applied, setApplied] = useState<InstrumentApplied | null>(null);
  const query = useInstrumentList(applied ? { kind, ...applied } : { kind }, {
    enabled: applied !== null,
  });
  useErrorSnackbar(query.error);

  const filterOrder: readonly string[] = kind === "CHECK" ? CHECK_FILTER_ORDER : BILL_FILTER_ORDER;
  const statusesOf = (value: string): InstrumentStatus[] =>
    kind === "CHECK"
      ? [...(CHECK_STATUS_FILTERS[value as CheckStatusFilter] ?? [])]
      : [...(BILL_STATUS_FILTERS[value as BillStatusFilter] ?? [])];

  const submit = () => {
    const next: InstrumentApplied = { dueFrom: start, dueTo: end, statuses: statusesOf(filter) };
    if (applied && sameParams(applied, next)) void query.refetch();
    else setApplied(next);
  };

  const rows = useMemo(() => sortByDue(query.data?.rows ?? []), [query.data]);
  const state = rowState(applied !== null, {
    isFetching: query.isFetching,
    isError: query.isError,
    data: query.data?.rows,
  });
  const summary = instrumentSummary(state === "rows" ? rows : [], today);
  const isCheck = kind === "CHECK";
  const colSpan = isCheck ? 10 : 11;

  const partyCell = (row: InstrumentListItem) => {
    const party = partyOf(row);
    if (party.masked) return <span className="text-muted">{c("employeeMasked")}</span>;
    return (
      <>
        {party.code}
        <br />
        <small>{party.name}</small>
      </>
    );
  };

  const exportRows = () => {
    const headers = isCheck
      ? [
          p("number"),
          p("bank"),
          p("branch"),
          p("drawerCode"),
          p("drawer"),
          p("amount"),
          p("currency"),
          p("issueDate"),
          p("dueDate"),
          p("daysLeft"),
          p("maturityGroup"),
          c("status"),
        ]
      : [
          p("number"),
          p("type"),
          p("draweeCode"),
          p("drawee"),
          p("amount"),
          p("currency"),
          p("issueDate"),
          p("dueDate"),
          p("daysLeft"),
          p("maturityGroup"),
          c("status"),
          p("collateral"),
        ];
    const data = rows.map((row) => {
      const party = partyOf(row);
      const code = party.masked ? "" : party.code;
      const name = party.masked ? c("employeeMasked") : party.name;
      const status = t(statusBadge(kind, row.status).labelKey);
      const group = c(`maturity.${maturityGroup(row.dueDate, today)}`);
      const days = daysLeft(row.dueDate, today);
      const common = [
        excelNumber(row.money.amount),
        row.money.currency,
        formatDate(row.issueDate),
        formatDate(row.dueDate),
        days,
        group,
        status,
      ];
      return isCheck
        ? [row.number, row.bankName ?? "", row.bankBranch ?? "", code, name, ...common]
        : [
            row.number,
            row.noteType ? t(`instruments.noteType.${row.noteType}`) : "",
            code,
            name,
            ...common,
            isCollateral(row) ? p("collateral") : "",
          ];
    });
    return exportExcel({
      fileName: isCheck ? CAR_EXCEL_FILES.checks : CAR_EXCEL_FILES.bills,
      title: p("reportTitle"),
      headers,
      rows: data,
    });
  };

  return (
    <>
      <FilterCard titleId={ids.filters} onSubmit={submit}>
        <div className="col-md-3">
          <DateField
            id={`${ids.prefix}StartDate`}
            label={c("startDate")}
            value={start}
            onChange={setStart}
          />
        </div>
        <div className="col-md-3">
          <DateField
            id={`${ids.prefix}EndDate`}
            label={c("endDate")}
            value={end}
            onChange={setEnd}
          />
        </div>
        <div className="col-md-3">
          <div className="form-group">
            <label htmlFor={`${ids.prefix}Status`}>{c("status")}</label>
            <ZtoSelect
              id={`${ids.prefix}Status`}
              placeholder={null}
              value={filter}
              onChange={setFilter}
              options={filterOrder.map((value) => ({ value, label: p(`filter.${value}`) }))}
            />
          </div>
        </div>
      </FilterCard>

      <ReportCard
        titleId={ids.title}
        title={p("reportTitle")}
        onExcel={() => void exportRows()}
        excelDisabled={state !== "rows"}
      >
        <div className="row mb-3">
          <InfoBox
            color={isCheck ? "bg-info" : "bg-warning"}
            icon={isCheck ? "fas fa-money-check" : "fas fa-file-invoice-dollar"}
            label={p("totalCount")}
            id={ids.count}
            value={String(summary.count)}
          />
          <InfoBox
            color="bg-success"
            icon="fas fa-dollar-sign"
            label={c("cards.totalAmount")}
            id={ids.amount}
            value={totalsText(summary.totals)}
          />
          <InfoBox
            color={isCheck ? "bg-warning" : "bg-info"}
            icon="fas fa-clock"
            label={c("cards.thisWeek")}
            id={ids.week}
            value={String(summary.thisWeek)}
          />
          <InfoBox
            color="bg-danger"
            icon="fas fa-exclamation-triangle"
            label={c("cards.overdue")}
            id={ids.overdue}
            value={String(summary.overdue)}
          />
        </div>

        <TableRegion labelledBy={ids.title}>
          <table
            className="table table-bordered table-striped table-hover"
            id={ids.table}
            aria-busy={query.isFetching}
          >
            <thead className="thead-dark">
              <tr>
                <th scope="col">{p("number")}</th>
                {isCheck ? <th scope="col">{p("bank")}</th> : <th scope="col">{p("type")}</th>}
                <th scope="col">{isCheck ? p("drawer") : p("drawee")}</th>
                <th scope="col">{p("amount")}</th>
                <th scope="col">{p("issueDate")}</th>
                <th scope="col">{p("dueDate")}</th>
                <th scope="col">{p("daysLeft")}</th>
                <th scope="col">{p("maturityGroup")}</th>
                <th scope="col">{c("status")}</th>
                {!isCheck && <th scope="col">{p("collateral")}</th>}
                <th scope="col">{p("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {state === "rows" ? (
                rows.map((row) => {
                  const group = maturityGroup(row.dueDate, today);
                  const status = statusBadge(kind, row.status);
                  const days = daysLeft(row.dueDate, today);
                  const editLabel = `${c("edit")} ${row.number}`;
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.number}</strong>
                      </td>
                      {isCheck ? (
                        <td>
                          {row.bankName ?? ""}
                          {row.bankBranch && (
                            <>
                              <br />
                              <small>{row.bankBranch}</small>
                            </>
                          )}
                        </td>
                      ) : (
                        <td>{row.noteType ? t(`instruments.noteType.${row.noteType}`) : "-"}</td>
                      )}
                      <td>{partyCell(row)}</td>
                      <td className="text-right font-weight-bold">
                        {formatMoney(row.money.amount, row.money.currency)}
                      </td>
                      <td>{formatDate(row.issueDate)}</td>
                      <td className="font-weight-bold">{formatDate(row.dueDate)}</td>
                      <td className="text-center">
                        {days === null ? "" : c("days", { count: days })}
                      </td>
                      <td>
                        <span className={`badge ${MATURITY_BADGE[group]}`}>
                          {c(`maturity.${group}`)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${status.className}`}>{t(status.labelKey)}</span>
                      </td>
                      {!isCheck && (
                        <td className="text-center">
                          {isCollateral(row) ? (
                            <span className="badge badge-warning">
                              <i className="fas fa-shield-alt" aria-hidden="true" />{" "}
                              {p("collateral")}
                            </span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                      )}
                      <td>
                        {canManage && (
                          <Link
                            to={isCheck ? checkEditPath(row.id) : billEditPath(row.id)}
                            className="btn btn-sm btn-warning"
                            title={c("edit")}
                            aria-label={editLabel}
                          >
                            <i className="fas fa-edit" aria-hidden="true" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <StateRow colSpan={colSpan} state={state} />
              )}
            </tbody>
          </table>
        </TableRegion>
        {query.data?.truncated && state === "rows" && (
          <p className="text-muted small mb-0" role="note">
            {c("truncated")}
          </p>
        )}
      </ReportCard>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Sekme 4 — Ödeme Performansı (CAR:412-499, 867-908)
// ---------------------------------------------------------------------------------------------

function PerformancePane() {
  const { t } = useTranslation("ztoFinans");
  const p = (key: string, options?: Record<string, unknown>) =>
    t(`customerAccountReport.performance.${key}`, options);
  const c = (key: string) => t(`customerAccountReport.${key}`);
  const today = useMemo(() => localToday(), []);
  const [start, setStart] = useState(() => addMonthsIso(today, -1));
  const [end, setEnd] = useState(today);
  const [account, setAccount] = useState<PickedAccount>(null);
  const [applied, setApplied] = useState<AccountPerformanceParams | null>(null);
  const query = useAccountPerformance(applied ?? { from: "", to: "" }, {
    enabled: applied !== null,
  });
  useErrorSnackbar(query.error);

  const submit = () => {
    const next: AccountPerformanceParams = { from: start, to: end, accountId: account?.id };
    if (applied && sameParams(applied, next)) void query.refetch();
    else setApplied(next);
  };

  const rows = query.data ?? [];
  const state = rowState(applied !== null, query);
  const unmatched = state === "rows" ? unmatchedTotal(rows) : 0;
  const avgText = (value: string | null) =>
    value === null || value === "" ? "-" : formatNumber(value, 1);

  const exportRows = () =>
    exportExcel({
      fileName: CAR_EXCEL_FILES.performance,
      title: p("reportTitle"),
      headers: [
        p("code"),
        p("name"),
        p("group"),
        p("currency"),
        p("paymentCount"),
        p("collectionCount"),
        p("paymentAmount"),
        p("collectionAmount"),
        p("avgDelay"),
        p("late"),
        p("onTime"),
        p("score"),
      ],
      rows: rows.map((row) => [
        row.accountCode,
        row.accountName,
        row.subGroupName,
        row.currency,
        row.paymentCount,
        row.collectionCount,
        excelNumber(row.paymentAmount),
        excelNumber(row.collectionAmount),
        excelNumber(row.avgDelayDays),
        row.lateCount,
        row.onTimeCount,
        row.score,
      ]),
    });

  return (
    <>
      <FilterCard titleId="perfFiltersTitle" onSubmit={submit}>
        <div className="col-md-3">
          <DateField id="perfStartDate" label={c("startDate")} value={start} onChange={setStart} />
        </div>
        <div className="col-md-3">
          <DateField id="perfEndDate" label={c("endDate")} value={end} onChange={setEnd} />
        </div>
        <div className="col-md-3">
          <AccountField inputId="perfCustomerId" value={account} onChange={setAccount} />
        </div>
      </FilterCard>

      <ReportCard
        titleId="performanceTitle"
        title={p("reportTitle")}
        onExcel={() => void exportRows()}
        excelDisabled={state !== "rows"}
      >
        <TableRegion labelledBy="performanceTitle">
          <table
            className="table table-bordered table-striped table-hover"
            id="performanceTable"
            aria-busy={query.isFetching}
          >
            <thead className="thead-dark">
              <tr>
                <th scope="col">{p("code")}</th>
                <th scope="col">{p("name")}</th>
                <th scope="col">{p("group")}</th>
                <th scope="col">{p("paymentCount")}</th>
                <th scope="col">{p("collectionCount")}</th>
                <th scope="col">{p("paymentAmount")}</th>
                <th scope="col">{p("collectionAmount")}</th>
                <th scope="col">{p("avgDelay")}</th>
                <th scope="col">{p("late")}</th>
                <th scope="col">{p("onTime")}</th>
                <th scope="col">{p("score")}</th>
              </tr>
            </thead>
            <tbody>
              {state === "rows" ? (
                rows.map((row) => {
                  const score = scoreBadge(row.score);
                  return (
                    <tr key={`${row.accountId}-${row.currency}`}>
                      <td>{row.accountCode}</td>
                      <td>
                        <strong>{row.accountName}</strong>
                      </td>
                      <td>
                        <span className="badge badge-secondary">{row.subGroupName}</span>
                      </td>
                      <td className="text-center">{row.paymentCount}</td>
                      <td className="text-center">{row.collectionCount}</td>
                      <td className="text-right">{formatMoney(row.paymentAmount, row.currency)}</td>
                      <td className="text-right">
                        {formatMoney(row.collectionAmount, row.currency)}
                      </td>
                      <td className="text-center">{avgText(row.avgDelayDays)}</td>
                      <td className="text-center text-danger">{row.lateCount}</td>
                      <td className="text-center text-success">{row.onTimeCount}</td>
                      <td className="text-center">
                        <span className={`badge ${score.className} font-weight-bold`}>
                          {score.text}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <StateRow colSpan={11} state={state} />
              )}
            </tbody>
          </table>
        </TableRegion>
        {state === "rows" && (
          <small className="text-muted">{p("unmatchedNote", { count: unmatched })}</small>
        )}
      </ReportCard>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Sekme 5 — Döviz Pozisyonu (CAR:502-548, 917-1004)
// ---------------------------------------------------------------------------------------------

function PositionPane() {
  const { t } = useTranslation("ztoFinans");
  const p = (key: string) => t(`customerAccountReport.position.${key}`);
  const multiCompany = useMultiCompany();
  const activeCompanyId = useActiveCompanyId();
  const companyOptions = useCompanyOptions();
  const currencies = useCurrencies();
  const [company, setCompany] = useState(activeCompanyId ?? "");
  const [loaded, setLoaded] = useState(false);
  const query = useCurrencyPosition(
    { companyId: companyParam(multiCompany, company), byCompany: false },
    { enabled: loaded },
  );
  useErrorSnackbar(query.error);

  const load = () => {
    if (loaded) void query.refetch();
    else setLoaded(true);
  };

  const views = useMemo(() => (query.data ?? []).map(positionView), [query.data]);
  const names = useMemo(
    () => new Map((currencies.data ?? []).map((c) => [c.code.toUpperCase(), c.name])),
    [currencies.data],
  );
  const state = rowState(loaded, query);
  const receivableLabel = p("chartReceivable");
  const payableLabel = p("chartPayable");
  const chartData = useMemo(
    () => positionChart(views, { receivable: receivableLabel, payable: payableLabel }),
    [views, receivableLabel, payableLabel],
  );

  return (
    <div className="card">
      <div className="card-header bg-light">
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0" id="currencyPositionTitle">
            <i className="fas fa-dollar-sign" aria-hidden="true" /> {p("reportTitle")}
          </h6>
          <button type="button" className="btn btn-primary" onClick={load}>
            <i className="fas fa-sync-alt" aria-hidden="true" /> {p("refresh")}
          </button>
        </div>
      </div>
      <div className="card-body">
        {multiCompany && (
          // Blackrose eki: şirket seçici (≥ 2 aktif şirket; "Konsolide" grup şirketi carilerini dışlar).
          <div className="row">
            <div className="col-md-3">
              <div className="form-group">
                <label htmlFor="positionCompany">{t("customerAccountReport.company")}</label>
                <ZtoSelect
                  id="positionCompany"
                  placeholder={null}
                  value={company}
                  onChange={setCompany}
                  options={companyOptions}
                />
              </div>
            </div>
          </div>
        )}
        <div className="alert alert-info">
          <i className="fas fa-info-circle" aria-hidden="true" /> <strong>{p("infoLabel")}</strong>{" "}
          {p("info")}
        </div>

        <TableRegion labelledBy="currencyPositionTitle">
          <table
            className="table table-bordered table-striped"
            id="currencyPositionTable"
            aria-busy={query.isFetching}
          >
            <thead className="thead-dark">
              <tr>
                <th scope="col">{p("currency")}</th>
                <th scope="col">{p("symbol")}</th>
                <th scope="col" className="text-right">
                  {p("receivable")}
                </th>
                <th scope="col" className="text-right">
                  {p("payable")}
                </th>
                <th scope="col" className="text-right">
                  {p("net")}
                </th>
                <th scope="col">{p("status")}</th>
              </tr>
            </thead>
            <tbody>
              {state === "initial" ? (
                <tr>
                  <td colSpan={6} className="text-center">
                    <button type="button" className="btn btn-primary" onClick={load}>
                      <i className="fas fa-sync-alt" aria-hidden="true" /> {p("load")}
                    </button>
                  </td>
                </tr>
              ) : state === "rows" ? (
                views.map((row) => (
                  <tr key={row.currency}>
                    <td>
                      <strong>{names.get(row.currency.toUpperCase()) ?? row.currency}</strong>
                    </td>
                    <td className="text-center">
                      <h5 className="mb-0">{currencySymbol(row.currency)}</h5>
                    </td>
                    <td className="text-right text-success">
                      {formatMoney(row.receivable, row.currency)}
                    </td>
                    <td className="text-right text-danger">
                      {formatMoney(row.payable, row.currency)}
                    </td>
                    <td className={`text-right font-weight-bold ${POSITION_NET_CLASS[row.kind]}`}>
                      {formatMoney(row.net, row.currency)}
                    </td>
                    <td className="text-center">
                      <span className={`badge ${POSITION_BADGE[row.kind]}`}>
                        {t(`customerAccountReport.position.kind.${row.kind}`)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <StateRow colSpan={6} state={state} />
              )}
            </tbody>
          </table>
        </TableRegion>

        <div className="mt-4">
          {state === "rows" && (
            <Suspense fallback={null}>
              <ZtoChartLazy
                type="bar"
                data={chartData}
                title={p("chartTitle")}
                legend="top"
                colorize={false}
                ariaLabel={p("chartLabel")}
                options={{ aspectRatio: 3, scales: { y: { beginAtZero: true } } }}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Sayfa (CAR:1-46)
// ---------------------------------------------------------------------------------------------

function paneOf(id: CustomerAccountReportTab): ReactNode {
  switch (id) {
    case "aging":
      return <AgingPane />;
    case "checks":
      return <InstrumentPane kind="CHECK" />;
    case "bills":
      return <InstrumentPane kind="NOTE" />;
    case "performance":
      return <PerformancePane />;
    case "position":
      return <PositionPane />;
  }
}

/**
 * Cari Hesap Raporları (ZTO Views/CustomerAccountReport/Reports.cshtml; 12.8_TASARIM §5.4). Beş sekme;
 * sekme `?tab=` ile (geçmişe yazılmaz). Sayfa açılışında rapor yüklenmez (CAR:593-595): her sekmede
 * "Raporu Getir" ilk isteği başlatır. Paneller hep bağlı kalır (gizli olanlar `hidden`), böylece
 * sekme değişiminde süzgeç ve sonuç korunur (ZTO BS4 sekme davranışı).
 *
 * MWG `tabs`: `a.nav-link` (ZTO) üzerine `role="tab"` + roving tabindex; ←/→/Home/End odak taşır,
 * seçim etkinleştirmeyle (Enter keydown, Space keyup; sekme URL'yi değiştirir).
 */
export function CustomerAccountReportPage() {
  useZtoRootClass("zto-page-customer-account-report");
  const { t } = useTranslation("ztoFinans");
  const [search, setSearch] = useSearchParams();
  const tab = parseCarTab(search.get("tab"));
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const select = (id: CustomerAccountReportTab) => {
    if (id === tab) return;
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (event.key === "Enter") {
      event.preventDefault();
      select(CAR_TABS[index].id);
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      return;
    }
    const next = nextTabIndex(index, event.key, CAR_TABS.length);
    if (next === null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
  };

  const onKeyUp = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (event.key === " ") {
      event.preventDefault();
      select(CAR_TABS[index].id);
    }
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h5 className="card-title mb-0">
                <i className="fas fa-chart-bar" aria-hidden="true" />{" "}
                {t("customerAccountReport.title")}
              </h5>
            </div>
            <div className="card-body">
              <ul
                className="nav nav-tabs"
                id="reportTabs"
                role="tablist"
                aria-label={t("customerAccountReport.title")}
              >
                {CAR_TABS.map((item, index) => {
                  const active = item.id === tab;
                  return (
                    <li key={item.id} className="nav-item" role="presentation">
                      <a
                        ref={(element) => {
                          tabRefs.current[index] = element;
                        }}
                        className={active ? "nav-link active" : "nav-link"}
                        id={item.tabId}
                        role="tab"
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={(event) => {
                          event.preventDefault();
                          select(item.id);
                        }}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        onKeyUp={(event) => onKeyUp(event, index)}
                      >
                        <i className={item.icon} aria-hidden="true" />{" "}
                        {t(`customerAccountReport.tabs.${item.id}`)}
                      </a>
                    </li>
                  );
                })}
              </ul>

              <div className="tab-content mt-3" id="reportTabsContent">
                {CAR_TABS.map((item) => {
                  const active = item.id === tab;
                  return (
                    <div
                      key={item.id}
                      className={active ? "tab-pane fade show active" : "tab-pane fade"}
                      id={item.paneId}
                      role="tabpanel"
                      aria-labelledby={item.tabId}
                      hidden={!active}
                    >
                      {paneOf(item.id)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

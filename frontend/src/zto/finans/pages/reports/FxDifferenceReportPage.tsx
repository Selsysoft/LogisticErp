import { FormEvent, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import { useCan, useCurrencies, useMultiCompany } from "../../../../pages/finance/common";
import {
  createFxCutKeyRegistry,
  useCreateFxDifference,
  useFxDifferenceReport,
  useRefreshRates,
} from "../../../../pages/finance/reportApi";
import type { FxCutState, FxDifferenceRow } from "../../../../pages/finance/types";
import { ZtoAccountSearch, ZtoConfirmModal, useZtoSnackbar } from "../../../components";
import { ZtoRcpTable, type ZtoRcpTableRow } from "../../../components/ZtoRcpTable";
import { currencySymbol, formatDate, formatN2 } from "../../../format";
import { accountTransactionsPath, financeReportPath } from "../../navItems";
import { localToday } from "../../reports/reportDates";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  confirmValues,
  cutBlock,
  cutBlockTitle,
  cutErrorMessage,
  defaultFxFilters,
  differenceClass,
  directionBadge,
  foreignCurrencies,
  formatAmount,
  formatDifference,
  formatRate,
  fxParams,
  isTruncated,
  rowSearchText,
  shouldNotifyRefreshError,
  sourceLabel,
  type FxFilters,
} from "./fxReportLogic";

const CUT_STATES: FxCutState[] = ["ALL", "OPEN", "CUT"];
const KICKER_STYLE = {
  fontSize: 11,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  opacity: 0.85,
} as const;
const SUB_STYLE = { fontSize: 10, color: "#64748b" } as const;
const EMPTY_CELL_STYLE = { color: "#94a3b8", padding: 24 } as const;

/**
 * Kur Farkı Raporu (ZTO Views/RecipeFinance/FxReport.cshtml; 12.8_TASARIM §5.7). Açılışta kurlar
 * getirilmeden listelenir (Güncel Kur / TL (güncel) / Fark "-", Kes pasif); "Güncel Kurları Getir"
 * MANAGE yetkisinde önce TCMB yenilemesini ister, ardından aynı süzgeçle `withRates` sorgulanır. Fark
 * sunucuda hesaplanır; "Kes" onayı onaylanan farkı `expectedDifference` olarak gönderir (OK-12.8-5).
 * Tablo ZTO `rcpDtInit` karşılığı `ZtoRcpTable` (Rev 1 FE-RCPDT-TABLE).
 */
export function FxDifferenceReportPage() {
  useZtoRootClass("zto-page-fx-report");
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const formId = useId();
  const canCut = useCan("FINANCE_PAYMENT_CREATE");
  const canManage = useCan("FINANCE_MANAGE");
  const multiCompany = useMultiCompany();
  const companies = useAuthStore((state) => state.me?.companies);
  const activeCompanyId = useActiveCompanyId();
  const currencies = useCurrencies();
  const today = localToday();
  const initial = useMemo(
    () => defaultFxFilters(today, multiCompany ? (activeCompanyId ?? "") : ""),
    // Yalnız ilk açılış: sonraki şirket değişimi süzgeci sıfırlamaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [form, setForm] = useState<FxFilters>(initial);
  const [applied, setApplied] = useState<FxFilters>(initial);
  const [withRates, setWithRates] = useState(false);
  const [pending, setPending] = useState<{ row: FxDifferenceRow; key: string } | null>(null);
  const keys = useRef(createFxCutKeyRegistry());

  const report = useFxDifferenceReport(fxParams(applied, withRates, multiCompany));
  const refresh = useRefreshRates();
  const create = useCreateFxDifference();
  const data = report.data;
  const shownWithRates = data?.withRates ?? false;
  const valuationDate = data?.valuationDate ?? applied.valuationDate;
  const id = (name: string) => `${formId}-${name}`;

  const set = <K extends keyof FxFilters>(key: K, value: FxFilters[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setApplied(form);
  };

  const loadRates = async () => {
    if (canManage) {
      try {
        await refresh.mutateAsync();
      } catch (error) {
        if (shouldNotifyRefreshError(error)) snackbar.show(t("fxReport.refreshFailed"), "error");
      }
    }
    if (withRates) {
      await report.refetch();
    } else {
      setWithRates(true);
    }
  };

  const confirmCut = async () => {
    if (!pending) return;
    const { row, key } = pending;
    const difference = row.difference;
    if (difference === null) return;
    const values = confirmValues(row);
    try {
      await create.mutateAsync({
        body: {
          sourceTransactionId: row.transactionId,
          valuationDate,
          expectedDifference: difference,
        },
        idempotencyKey: key,
      });
      keys.current.release(row.transactionId, valuationDate);
      snackbar.show(
        t("fxReport.success", {
          amount: values.amount,
          direction: t(values.same ? "fxReport.sameSide" : "fxReport.oppositeSide"),
        }),
        "success",
      );
    } catch (error) {
      const mapped = cutErrorMessage(error);
      snackbar.show(mapped.key ? t(mapped.key, mapped.values) : (mapped.message ?? ""), "error");
      if (mapped.refetch) void report.refetch();
    } finally {
      setPending(null);
    }
  };

  const headers = {
    direction: t("fxReport.col.direction"),
    date: t("fxReport.col.date"),
    account: t("fxReport.col.account"),
    document: t("fxReport.col.document"),
    amount: t("fxReport.col.amount"),
    currency: t("fxReport.col.currency"),
    rate: t("fxReport.col.rate"),
    tl: t("fxReport.col.tl"),
    currentRate: t("fxReport.col.currentRate"),
    currentTl: t("fxReport.col.currentTl"),
    difference: t("fxReport.col.difference"),
    action: t("fxReport.col.action"),
  };

  const sourceText = (row: FxDifferenceRow) =>
    sourceLabel(row, (type) => t(`fxReport.source.${type}`, { defaultValue: type }));

  const cutCell = (row: FxDifferenceRow) => {
    if (row.cut) {
      return (
        <>
          <span className="text-success" title={t("fxReport.cutDone")}>
            <i className="fas fa-check" aria-hidden="true" />
            <span className="sr-only">{t("fxReport.cutDone")}</span>
          </span>{" "}
          <Link to={accountTransactionsPath(row.accountId)}>{row.cut.documentNo}</Link>
        </>
      );
    }
    if (!canCut) return null;
    const block = cutBlock(row, shownWithRates);
    const blockTitle = cutBlockTitle(block, row);
    const title = blockTitle ? t(blockTitle.key, blockTitle.values) : t("fxReport.cutTitle");
    return (
      <button
        type="button"
        className="btn btn-outline-dark btn-sm fx-cut"
        style={{ padding: "1px 8px", fontSize: 10 }}
        disabled={block !== null || create.isPending}
        title={title}
        aria-label={`${title}: ${row.accountName} ${formatDate(row.transactionDate)}`}
        onClick={() =>
          setPending({ row, key: keys.current.keyFor(row.transactionId, valuationDate) })
        }
      >
        <i className="fas fa-cut" aria-hidden="true" /> {t("fxReport.cut")}
      </button>
    );
  };

  const rows: ZtoRcpTableRow[] = (data?.rows ?? []).map((row) => {
    const badge = directionBadge(row.direction);
    const kind = t(`fxReport.kind.${badge.key}`);
    const source = sourceText(row);
    const blocked = row.valuationBlock !== null;
    return {
      key: row.transactionId,
      text: rowSearchText(row, kind, source),
      node: (
        <tr key={row.transactionId}>
          <td data-label={headers.direction}>
            <span className={badge.className} style={{ fontSize: 9 }}>
              {kind}
            </span>
          </td>
          <td data-label={headers.date}>{formatDate(row.transactionDate) || "-"}</td>
          <td data-label={headers.account}>
            <strong>{row.accountName}</strong>
            <div style={SUB_STYLE}>{row.accountCode}</div>
          </td>
          <td data-label={headers.document} style={{ fontSize: 11 }}>
            {row.documentNo ?? ""}
            <div style={SUB_STYLE}>{source}</div>
          </td>
          <td data-label={headers.amount} className="text-right">
            {formatN2(row.amount)}
          </td>
          <td data-label={headers.currency}>{currencySymbol(row.currency)}</td>
          <td data-label={headers.rate} className="text-right">
            {formatRate(row.transactionRate)}
          </td>
          <td data-label={headers.tl} className="text-right">
            {formatN2(row.tlAmount)}
          </td>
          <td data-label={headers.currentRate} className="text-right fx-cur">
            {blocked ? "-" : formatRate(row.currentRate)}
          </td>
          <td data-label={headers.currentTl} className="text-right fx-curtl">
            {blocked ? "-" : formatAmount(row.currentTl)}
          </td>
          <td data-label={headers.difference} className={differenceClass(row)}>
            {blocked ? "-" : formatDifference(row.difference)}
          </td>
          <td data-label={headers.action} className="text-center no-print">
            {cutCell(row)}
          </td>
        </tr>
      ),
    };
  });

  const emptyText = report.isPending
    ? t("fxReport.loading")
    : report.isError
      ? t("fxReport.loadError", { message: report.error.message })
      : t("fxReport.empty");
  const emptyRow =
    rows.length === 0 ? (
      <tr>
        <td colSpan={12} className="text-center" style={EMPTY_CELL_STYLE}>
          {emptyText}
        </td>
      </tr>
    ) : undefined;

  const confirm = pending ? confirmValues(pending.row) : null;

  return (
    <div className="rcp-page">
      <ol className="rcp-breadcrumb no-print" aria-label={t("fxReport.breadcrumbLabel")}>
        <li>
          <Link to={financeReportPath()}>
            <i className="fas fa-coins" style={{ marginRight: 4 }} aria-hidden="true" />
            {t("fxReport.breadcrumbRoot")}
          </Link>
        </li>
        <li className="divider" aria-hidden="true" />
        <li className="active" aria-current="page">
          {t("fxReport.title")}
        </li>
      </ol>

      <div className="fx-hero rcp-hero">
        <div style={KICKER_STYLE}>
          <i className="fas fa-exchange-alt" aria-hidden="true" /> {t("fxReport.heroKicker")}
        </div>
        <div role="heading" aria-level={1} style={{ fontSize: 20, fontWeight: 800 }}>
          {t("fxReport.title")}
        </div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>{t("fxReport.heroText")}</div>
      </div>

      <form className="form-row no-print" aria-label={t("fxReport.filter.label")} onSubmit={submit}>
        {multiCompany && (
          <div className="form-group col-md-2">
            <label htmlFor={id("company")}>{t("fxReport.filter.company")}</label>
            <select
              id={id("company")}
              className="form-control form-control-sm"
              value={form.companyId}
              onChange={(event) => set("companyId", event.target.value)}
            >
              <option value="">{t("fxReport.filter.allCompanies")}</option>
              {activeCompanies(companies).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.shortName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group col-md-3">
          <label id={id("account-label")} htmlFor={id("account")}>
            {t("fxReport.filter.account")}
          </label>
          <ZtoAccountSearch
            variant="listGroup"
            ids={{ input: id("account") }}
            placeholder={t("fxReport.filter.accountPlaceholder")}
            emptyText={t("fxReport.filter.accountEmpty")}
            minLength={2}
            delayMs={300}
            ariaLabelledBy={id("account-label")}
            value={form.accountId ? { id: form.accountId, label: form.accountLabel } : null}
            labelOf={(hit) => `${hit.code} - ${hit.name}`}
            onSelect={(hit) =>
              setForm((current) => ({
                ...current,
                accountId: hit.id,
                accountLabel: `${hit.code} - ${hit.name}`,
              }))
            }
            onClear={() => setForm((current) => ({ ...current, accountId: "", accountLabel: "" }))}
          />
        </div>
        <div className="form-group col-md-2">
          <label htmlFor={id("currency")}>{t("fxReport.filter.currency")}</label>
          <select
            id={id("currency")}
            className="form-control form-control-sm"
            value={form.currency}
            onChange={(event) => set("currency", event.target.value)}
          >
            <option value="">{t("fxReport.filter.allCurrencies")}</option>
            {foreignCurrencies(currencies.data ?? []).map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group col-md-2">
          <label htmlFor={id("cut-state")}>{t("fxReport.filter.cutState")}</label>
          <select
            id={id("cut-state")}
            className="form-control form-control-sm"
            value={form.cutState}
            onChange={(event) => set("cutState", event.target.value as FxCutState)}
          >
            {CUT_STATES.map((state) => (
              <option key={state} value={state}>
                {t(`fxReport.filter.cutStates.${state}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group col-md-2">
          <label htmlFor={id("valuation")}>{t("fxReport.filter.valuationDate")}</label>
          <input
            id={id("valuation")}
            type="date"
            className="form-control form-control-sm"
            max={today}
            required
            value={form.valuationDate}
            onChange={(event) => set("valuationDate", event.target.value)}
          />
        </div>
        <div className="form-group col-md-1 d-flex align-items-end">
          <button type="submit" className="btn btn-primary btn-sm">
            <i className="fas fa-filter" aria-hidden="true" /> {t("fxReport.filter.submit")}
          </button>
        </div>
      </form>

      <div className="card" style={{ borderRadius: 10 }}>
        <div className="card-body" style={{ padding: 12 }}>
          <div className="d-flex justify-content-between no-print" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              <i className="fas fa-info-circle" aria-hidden="true" /> {t("fxReport.info")}
            </div>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              disabled={refresh.isPending || (withRates && report.isFetching)}
              aria-busy={refresh.isPending || report.isFetching}
              onClick={() => void loadRates()}
            >
              <i className="fas fa-sync-alt" aria-hidden="true" /> {t("fxReport.loadRates")}
            </button>
          </div>
          {shownWithRates && (data?.missingRates.length ?? 0) > 0 && (
            <div className="alert alert-warning" role="status">
              {t("fxReport.missingRates", { list: data?.missingRates.join(", ") })}
            </div>
          )}
          {data && isTruncated(data.totalElements, data.rows.length) && (
            <div className="alert alert-info" role="status">
              {t("fxReport.truncated")}
            </div>
          )}
          <ZtoRcpTable
            id="fxTable"
            resetKey={JSON.stringify(applied)}
            tableClassName="table table-bordered table-hover fx-phone-card-table"
            label={t("fxReport.tableLabel")}
            head={
              <thead>
                <tr>
                  <th>{headers.direction}</th>
                  <th>{headers.date}</th>
                  <th>{headers.account}</th>
                  <th>{headers.document}</th>
                  <th className="text-right">{headers.amount}</th>
                  <th>{headers.currency}</th>
                  <th className="text-right">{headers.rate}</th>
                  <th className="text-right">{headers.tl}</th>
                  <th className="text-right">{headers.currentRate}</th>
                  <th className="text-right">{headers.currentTl}</th>
                  <th className="text-right">{headers.difference}</th>
                  <th className="no-print" style={{ width: 70 }}>
                    <span className="sr-only">{headers.action}</span>
                  </th>
                </tr>
              </thead>
            }
            rows={rows}
            emptyRow={emptyRow}
            columnCount={12}
          />
        </div>
      </div>

      <ZtoConfirmModal
        show={pending !== null}
        variant="primary"
        title={t("fxReport.confirm.title")}
        message={
          confirm && (
            <>
              {t("fxReport.confirm.message")}
              <br />
              <small>
                {t("fxReport.confirm.detail", {
                  amount: confirm.amount,
                  side: t(`fxReport.side.${confirm.side}`),
                  direction: t(confirm.same ? "fxReport.sameSide" : "fxReport.oppositeSide"),
                  rate: confirm.rate,
                  date: confirm.date,
                })}
              </small>
              {confirm.partial && (
                <>
                  <br />
                  <small className="text-warning">
                    {t("fxReport.confirm.partial", confirm.partial)}
                  </small>
                </>
              )}
            </>
          )
        }
        note={null}
        confirmText={t("fxReport.confirm.confirm")}
        cancelText={t("fxReport.confirm.cancel")}
        busyText={t("fxReport.confirm.busy")}
        initialFocus="cancel"
        onConfirm={confirmCut}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

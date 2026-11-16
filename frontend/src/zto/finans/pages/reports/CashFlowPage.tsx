import { FormEvent, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import { useCurrencies, useMultiCompany } from "../../../../pages/finance/common";
import { useCashFlow } from "../../../../pages/finance/reportApi";
import { ZtoRcpTable, type ZtoRcpTableRow } from "../../../components/ZtoRcpTable";
import { financeReportPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  cashFlowParams,
  cashFlowRows,
  cashFlowSearchText,
  type CashFlowFilters,
} from "./cashFlowLogic";

const KICKER_STYLE = {
  fontSize: 11,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  opacity: 0.85,
} as const;
const EMPTY_CELL_STYLE = { color: "#94a3b8", padding: 24 } as const;
const IN_BG = { background: "#f0fdf4" } as const;
const OUT_BG = { background: "#fef2f2" } as const;
const NOTE_STYLE = { fontSize: 11, color: "#64748b", marginTop: 6 } as const;

/**
 * Nakit Akış Projeksiyonu (ZTO Views/RecipeFinance/CashFlow.cshtml; 12.8_TASARIM §5.8). 8 hafta;
 * Giriş = vadeli cari alacakların FIFO açık kalanı + alınan çekler, Çıkış = kendi çeklerimiz, senet
 * bilgi (Net'e girmez). Varsayılan TL karşılığı (ZTO `N0`); para birimi seçilince o birimin tutarları.
 * Tablo ZTO `rcpDtInit('cfTable')` karşılığı `ZtoRcpTable` (şerit 8 satırda da görünür).
 */
export function CashFlowPage() {
  useZtoRootClass("zto-page-cash-flow");
  const { t } = useTranslation("ztoFinans");
  const formId = useId();
  const multiCompany = useMultiCompany();
  const companies = useAuthStore((state) => state.me?.companies);
  const activeCompanyId = useActiveCompanyId();
  const currencies = useCurrencies();
  const initial = useMemo<CashFlowFilters>(
    () => ({ companyId: multiCompany ? (activeCompanyId ?? "") : "", currency: "" }),
    // Yalnız ilk açılış.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [form, setForm] = useState<CashFlowFilters>(initial);
  const [applied, setApplied] = useState<CashFlowFilters>(initial);
  const flow = useCashFlow(cashFlowParams(applied, multiCompany));
  const data = flow.data;
  const id = (name: string) => `${formId}-${name}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setApplied(form);
  };

  const headers = {
    week: t("cashFlow.col.week"),
    receivableDue: t("cashFlow.col.receivableDue"),
    receivedChecks: t("cashFlow.col.receivedChecks"),
    issuedChecks: t("cashFlow.col.issuedChecks"),
    notes: t("cashFlow.col.notes"),
    net: t("cashFlow.col.net"),
    cumulative: t("cashFlow.col.cumulative"),
  };

  const display = data ? cashFlowRows(data.rows, data.currency) : [];
  const rows: ZtoRcpTableRow[] = display.map((row) => ({
    key: row.key,
    text: cashFlowSearchText(row),
    node: (
      <tr key={row.key}>
        <td data-label={headers.week}>
          <strong>{row.label}</strong>
        </td>
        <td data-label={headers.receivableDue} className="text-right">
          {row.receivableDue}
        </td>
        <td data-label={headers.receivedChecks} className="text-right">
          {row.receivedChecks}
        </td>
        <td data-label={headers.issuedChecks} className="text-right">
          {row.issuedChecks}
        </td>
        <td data-label={headers.notes} className="text-right" style={{ color: "#64748b" }}>
          {row.notes}
        </td>
        <td data-label={headers.net} className={`text-right ${row.netClass}`}>
          {row.net}
        </td>
        <td data-label={headers.cumulative} className={`text-right ${row.cumulativeClass}`}>
          {row.cumulative}
        </td>
      </tr>
    ),
  }));

  const emptyText = flow.isPending
    ? t("cashFlow.loading")
    : flow.isError
      ? t("cashFlow.loadError", { message: flow.error.message })
      : t("cashFlow.empty");
  const emptyRow =
    rows.length === 0 ? (
      <tr>
        <td colSpan={7} className="text-center" style={EMPTY_CELL_STYLE}>
          {emptyText}
        </td>
      </tr>
    ) : undefined;

  const currencyMode = data?.currency ?? null;

  return (
    <div className="rcp-page">
      <ol className="rcp-breadcrumb no-print" aria-label={t("cashFlow.breadcrumbLabel")}>
        <li>
          <Link to={financeReportPath()}>
            <i className="fas fa-coins" style={{ marginRight: 4 }} aria-hidden="true" />
            {t("cashFlow.breadcrumbRoot")}
          </Link>
        </li>
        <li className="divider" aria-hidden="true" />
        <li className="active" aria-current="page">
          {t("cashFlow.title")}
        </li>
      </ol>

      <div className="cf-hero rcp-hero">
        <div style={KICKER_STYLE}>
          <i className="fas fa-water" aria-hidden="true" /> {t("cashFlow.heroKicker")}
        </div>
        <div role="heading" aria-level={1} style={{ fontSize: 20, fontWeight: 800 }}>
          {t("cashFlow.heroTitle")}
        </div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>{t("cashFlow.heroText")}</div>
      </div>

      <form className="form-row no-print" aria-label={t("cashFlow.filter.label")} onSubmit={submit}>
        {multiCompany && (
          <div className="form-group col-md-3">
            <label htmlFor={id("company")}>{t("cashFlow.filter.company")}</label>
            <select
              id={id("company")}
              className="form-control form-control-sm"
              value={form.companyId}
              onChange={(event) =>
                setForm((current) => ({ ...current, companyId: event.target.value }))
              }
            >
              <option value="">{t("cashFlow.filter.allCompanies")}</option>
              {activeCompanies(companies).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.shortName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group col-md-3">
          <label htmlFor={id("currency")}>{t("cashFlow.filter.currency")}</label>
          <select
            id={id("currency")}
            className="form-control form-control-sm"
            value={form.currency}
            onChange={(event) =>
              setForm((current) => ({ ...current, currency: event.target.value }))
            }
          >
            <option value="">{t("cashFlow.filter.tlEquivalent")}</option>
            {(currencies.data ?? []).map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group col-md-2 d-flex align-items-end">
          <button type="submit" className="btn btn-primary btn-sm">
            <i className="fas fa-filter" aria-hidden="true" /> {t("cashFlow.filter.submit")}
          </button>
        </div>
      </form>

      <div className="card" style={{ borderRadius: 10 }}>
        <div className="card-body" style={{ padding: 12 }}>
          {currencyMode === null && (data?.missingRates.length ?? 0) > 0 && (
            <div className="alert alert-warning" role="status">
              {t("cashFlow.missingRates", { list: data?.missingRates.join(", ") })}
            </div>
          )}
          <ZtoRcpTable
            id="cfTable"
            resetKey={JSON.stringify(applied)}
            tableClassName="table table-bordered table-hover cf-phone-card-table"
            label={t("cashFlow.tableLabel")}
            head={
              <thead>
                <tr>
                  <th>{headers.week}</th>
                  <th className="text-right" style={IN_BG}>
                    {headers.receivableDue}
                  </th>
                  <th className="text-right" style={IN_BG}>
                    {headers.receivedChecks}
                  </th>
                  <th className="text-right" style={OUT_BG}>
                    {headers.issuedChecks}
                  </th>
                  <th className="text-right">{headers.notes}</th>
                  <th className="text-right">{headers.net}</th>
                  <th className="text-right">{headers.cumulative}</th>
                </tr>
              </thead>
            }
            rows={rows}
            emptyRow={emptyRow}
            columnCount={7}
          />
          <div style={NOTE_STYLE}>
            <i className="fas fa-info-circle" aria-hidden="true" />{" "}
            {currencyMode === null
              ? t("cashFlow.note")
              : t("cashFlow.noteCurrency", { currency: currencyMode })}
            {data?.planExcluded && <> {t("cashFlow.planExcluded")}</>}
          </div>
        </div>
      </div>
    </div>
  );
}

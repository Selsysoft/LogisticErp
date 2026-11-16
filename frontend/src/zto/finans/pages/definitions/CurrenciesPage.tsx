import { createColumnHelper } from "@tanstack/react-table";
import { CSSProperties, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCan, useCurrencies } from "../../../../pages/finance/common";
import { useExchangeRates, useRefreshRates } from "../../../../pages/finance/reportApi";
import { ZtoDataTable, ZtoDefinitionBreadcrumb, useZtoSnackbar } from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import { localToday } from "../../reports/reportDates";
import { currencyRows, rateDateText, rateValueText, type CurrencyRow } from "./currenciesLogic";

const column = createColumnHelper<CurrencyRow>();

// ZTO Currency/Index.cshtml:11-17 satır içi stilleri.
const HEADER_ROW: CSSProperties = {
  margin: 2,
  display: "flex",
  justifyContent: "space-between",
  flexDirection: "row",
  alignItems: "center",
};
const ALIGN_CENTER: CSSProperties = { alignItems: "center" };
const TITLE: CSSProperties = { margin: 0, alignItems: "center" };

/**
 * Para Birimleri (ZTO Views/Currency/Index.cshtml; 12.8_TASARIM §5.9, OK-12.8-13). Salt okunur:
 * `GET /finance/currencies` + bugünün kurları (`useExchangeRates`, MUI Tanımlar ile ortak anahtar).
 * "Yeni Kayıt" ve İşlemler sütunu yok (ISO kodu, platform geneli tablo); FINANCE_MANAGE sahibine
 * "Kurları Yenile" (202). Kök sınıf yok (sayfa CSS'i yok; §5.3).
 */
export function CurrenciesPage() {
  const { t } = useTranslation("ztoFinans");
  const c = (key: string, options?: Record<string, unknown>) => t(`currencies.${key}`, options);
  const snackbar = useZtoSnackbar();
  const canManage = useCan("FINANCE_MANAGE");
  const today = useMemo(() => localToday(), []);
  const currencies = useCurrencies();
  const rates = useExchangeRates(today);
  const refresh = useRefreshRates({
    onSuccess: () => snackbar.show(t("currencies.refreshed"), "success"),
    onError: (error) =>
      snackbar.show(t("currencies.refreshFailed", { message: errorMessage(error, "-") }), "error"),
  });

  const rows = useMemo(
    () => currencyRows(currencies.data ?? [], rates.data ?? []),
    [currencies.data, rates.data],
  );

  const columns = useMemo(() => {
    const h = (key: string) => t(`currencies.${key}`);
    const rateText = (row: CurrencyRow) =>
      row.base
        ? "—"
        : row.rate === null
          ? h("noRate")
          : t("currencies.rateText", { code: row.code, rate: rateValueText(row.rate) });
    return [
      column.accessor("name", { id: "name", header: h("name") }),
      column.accessor("symbolText", { id: "symbol", header: h("symbol") }),
      column.accessor((row) => rateText(row), {
        id: "rate",
        header: h("rate"),
        cell: ({ row }) =>
          !row.original.base && row.original.rate === null ? (
            <span className="text-muted">{rateText(row.original)}</span>
          ) : (
            rateText(row.original)
          ),
      }),
      column.accessor((row) => row.rateDate ?? "", {
        id: "rateDate",
        header: h("rateDate"),
        meta: {
          exportValue: (row: CurrencyRow) => rateDateText(row.rateDate),
          searchValue: (_value: string, row: CurrencyRow) => rateDateText(row.rateDate),
        },
        cell: ({ row }) => rateDateText(row.original.rateDate),
      }),
    ];
  }, [t]);

  const loadError = currencies.error ?? rates.error;

  return (
    <>
      <br />
      <ZtoDefinitionBreadcrumb
        items={[{ label: c("crumbRoot") }, { label: c("crumb") }]}
        title={c("heading")}
        icon="fas fa-dollar-sign"
      />
      <div className="row">
        <div className="col-xl-12">
          <section className="card custom-card">
            <header className="card-header custom-card-header">
              <div style={HEADER_ROW}>
                <div style={ALIGN_CENTER}>
                  <h5 id="currencyListTitle" style={TITLE}>
                    {c("title")}
                    &nbsp;
                    <i className="fas fa-list-ul" aria-hidden="true" />
                  </h5>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={refresh.isPending}
                    onClick={() => refresh.mutate()}
                  >
                    <i className="fas fa-sync-alt" aria-hidden="true" /> {c("refresh")}
                  </button>
                )}
              </div>
            </header>
            <div className="card-body">
              {loadError && (
                <div className="alert alert-danger" role="alert">
                  {c("loadFailed", { message: errorMessage(loadError, "-") })}
                </div>
              )}
              <div className="table-responsive">
                <ZtoDataTable
                  id="dataTable"
                  tableClassName="table table-hover"
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.code}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

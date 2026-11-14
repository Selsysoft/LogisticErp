import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../../../api/client";
import { useDocumentSeries } from "../../../../pages/organization/api";
import type { DocumentSeries, DocumentType } from "../../../../pages/organization/types";
import { ZtoAlert, ZtoDataTable, ZtoModal } from "../../../components";
import { errorMessage, seriesPrefixInput, seriesSample } from "../../../components/definitionLogic";
import { validateSeries } from "./definitionForms";
import { useCan } from "./definitionHooks";

const column = createColumnHelper<DocumentSeries>();
const RED = { color: "red" } as const;

/** Belge türü → etiket anahtarı (12.2: VRM ve SVR serileri de listelenir). */
const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  FREIGHT_INVOICE: "companies.docFreight",
  WAREHOUSE_INVOICE: "companies.docWarehouse",
  FUND_TRANSFER: "companies.docFundTransfer",
  INTERCOMPANY_TRANSFER: "companies.docIntercompanyTransfer",
};

export type CompanySeriesTabProps = { companyId: string };

/**
 * Şirket › Seriler (12.1a §6.12): navlun ve depo faturası numara serileri. Düzenleme yalnız
 * COMPANY_MANAGE; sıradaki numara yalnız ileri alınabilir (sunucu 422 DOCUMENT_SERIES_BACKWARDS).
 */
export function CompanySeriesTab({ companyId }: CompanySeriesTabProps) {
  const { t } = useTranslation("ztoFinans");
  const canManage = useCan("COMPANY_MANAGE");
  const series = useDocumentSeries(companyId);
  const [editing, setEditing] = useState<DocumentSeries | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const columns = useMemo(
    () => [
      column.accessor((row) => t(DOC_TYPE_LABEL[row.docType]), {
        id: "docType",
        header: t("companies.seriesDocType"),
      }),
      column.accessor(
        (row) => (row.year === null ? t("companies.seriesAllYears") : String(row.year)),
        {
          id: "year",
          header: t("companies.seriesYear"),
        },
      ),
      column.accessor("prefix", { header: t("companies.seriesPrefix") }),
      column.accessor("nextValue", { header: t("companies.seriesNext") }),
      column.accessor("sample", { header: t("companies.seriesSample") }),
      ...(canManage
        ? [
            column.display({
              id: "actions",
              header: t("definitions.actions"),
              enableSorting: false,
              cell: ({ row }) => (
                <button
                  type="button"
                  className="btn btn-success definition-icon-action"
                  title={t("companies.seriesEdit")}
                  aria-label={t("companies.seriesEdit")}
                  onClick={() => {
                    setEditing(row.original);
                    setOpen(true);
                  }}
                >
                  <i className="fas fa-edit" />
                </button>
              ),
            }),
          ]
        : []),
    ],
    [t, canManage],
  );

  return (
    <>
      {notice && <ZtoAlert variant="success" message={notice} onClose={() => setNotice(null)} />}
      {series.isError && (
        <div className="alert alert-danger" role="alert">
          {series.error.message}
        </div>
      )}
      <div className="table-responsive">
        <ZtoDataTable
          id="seriesTable"
          columns={columns}
          data={series.data ?? []}
          getRowId={(row) => row.id}
          tableClassName="table table-hover"
          searchable={false}
          paging={false}
          info={false}
          order={[]}
          processing={series.isPending}
        />
      </div>
      {editing && (
        <SeriesModal
          key={editing.id}
          show={open}
          series={editing}
          companyId={companyId}
          onHide={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setNotice(t("companies.seriesSaved"));
          }}
        />
      )}
    </>
  );
}

function SeriesModal({
  show,
  series,
  companyId,
  onHide,
  onSaved,
}: {
  show: boolean;
  series: DocumentSeries;
  companyId: string;
  onHide: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const client = useQueryClient();
  const [prefix, setPrefix] = useState(series.prefix);
  const [nextValue, setNextValue] = useState(String(series.nextValue));
  const [errors, setErrors] = useState<{ prefix?: string; nextValue?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      apiRequest<DocumentSeries>(
        "PUT",
        `/organization/companies/${companyId}/document-series/${series.id}`,
        { prefix, nextValue: Number(nextValue) },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["companies", "document-series", companyId] });
      onSaved();
    },
    onError: (error) => setFailure(errorMessage(error, t("definitions.error"))),
  });

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const found = validateSeries(prefix, nextValue, series.nextValue);
    setErrors(found);
    setFailure(null);
    if (found.prefix || found.nextValue) return;
    save.mutate();
  };

  const preview =
    prefix && /^\d+$/.test(nextValue)
      ? seriesSample(
          prefix,
          series.year ?? new Date().getFullYear(),
          Number(nextValue),
          series.padding,
        )
      : "";

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      centered
      title={
        <>
          <i className="fas fa-edit" /> {t("companies.seriesEdit")}
        </>
      }
      closeDisabled={save.isPending}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onHide}
            disabled={save.isPending}
          >
            {t("common.dismiss")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => submit()}
            disabled={save.isPending}
          >
            {t("common.save")}
          </button>
        </>
      }
    >
      {failure && <ZtoAlert variant="danger" message={failure} onClose={() => setFailure(null)} />}
      <form noValidate onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="seriesPrefix">
            {t("companies.seriesPrefix")} <span style={RED}>*</span>
          </label>
          <input
            type="text"
            id="seriesPrefix"
            className={errors.prefix ? "form-control is-invalid" : "form-control"}
            maxLength={10}
            value={prefix}
            onChange={(event) => setPrefix(seriesPrefixInput(event.target.value))}
          />
          {errors.prefix && <div className="invalid-feedback d-block">{t(errors.prefix)}</div>}
        </div>
        <div className="form-group">
          <label htmlFor="seriesNext">
            {t("companies.seriesNext")} <span style={RED}>*</span>
          </label>
          <input
            type="number"
            id="seriesNext"
            className={errors.nextValue ? "form-control is-invalid" : "form-control"}
            min={series.nextValue}
            value={nextValue}
            onChange={(event) => setNextValue(event.target.value)}
          />
          {errors.nextValue && (
            <div className="invalid-feedback d-block">{t(errors.nextValue)}</div>
          )}
        </div>
        {preview && (
          <p className="mb-2">
            {t("companies.seriesSample")}: <strong>{preview}</strong>
          </p>
        )}
        <div className="alert alert-warning mb-0">
          <i className="fas fa-exclamation-triangle" /> {t("companies.seriesForwardOnly")}
        </div>
      </form>
    </ZtoModal>
  );
}

import { Button, Link, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  today,
  useCan,
  useCurrencies,
} from "../finance/common";
import {
  customerName,
  customerOptions,
  orNull,
  useCustomers,
  useTariffs,
  useTaxRates,
} from "./common";
import { TariffLine } from "./types";

export function TariffsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CRM_EDIT");
  const tariffs = useTariffs();
  const taxRates = useTaxRates();
  const customers = useCustomers();
  const currencies = useCurrencies();
  const [dialog, setDialog] = useState<"tariff" | "tax" | null>(null);
  const refresh = () => {
    setDialog(null);
    void client.invalidateQueries({ queryKey: ["crm"] });
  };

  return (
    <Stack spacing={4}>
      <div>
        <SectionHeader title={t("crm.tabs.tariffs")}>
          {canEdit && (
            <Button variant="contained" onClick={() => setDialog("tariff")}>
              {t("crm.action.newTariff")}
            </Button>
          )}
        </SectionHeader>
        <QueryState isPending={tariffs.isPending} error={tariffs.error} />
        {tariffs.data && (
          <DataTable
            rows={tariffs.data}
            rowKey={(row) => row.id}
            columns={[
              {
                header: t("finance.field.code"),
                render: (r) => (
                  <Link component={RouterLink} to={`/crm/tariffs/${r.id}`}>
                    {r.code}
                  </Link>
                ),
              },
              { header: t("finance.field.name"), render: (r) => r.name },
              { header: t("finance.field.currency"), render: (r) => r.currency },
              {
                header: t("crm.field.customerSpecific"),
                render: (r) => (r.accountId ? customerName(customers.data, r.accountId) : "—"),
              },
              { header: t("crm.field.validFrom"), render: (r) => formatDate(r.validFrom) },
              {
                header: t("crm.field.validTo"),
                render: (r) => (r.validTo ? formatDate(r.validTo) : ""),
              },
              {
                header: t("crm.field.fuelPercent"),
                align: "right",
                render: (r) => (r.fuelSurchargePercent ? formatAmount(r.fuelSurchargePercent) : ""),
              },
            ]}
          />
        )}
      </div>
      <div>
        <SectionHeader title={t("crm.sections.taxRates")}>
          {canEdit && (
            <Button variant="outlined" onClick={() => setDialog("tax")}>
              {t("crm.action.newTaxRate")}
            </Button>
          )}
        </SectionHeader>
        <QueryState isPending={taxRates.isPending} error={taxRates.error} />
        {taxRates.data && (
          <DataTable
            rows={taxRates.data}
            rowKey={(row) => row.id}
            columns={[
              { header: t("finance.field.code"), render: (r) => r.code },
              { header: t("finance.field.name"), render: (r) => r.name },
              {
                header: t("crm.field.vatPercent"),
                align: "right",
                render: (r) => formatAmount(r.vatPercent),
              },
              {
                header: t("crm.field.withholding"),
                align: "right",
                render: (r) => `${r.withholdingNumerator}/${r.withholdingDenominator}`,
              },
            ]}
          />
        )}
      </div>
      {dialog === "tariff" && (
        <FormDialog
          title={t("crm.action.newTariff")}
          fields={[
            { name: "code", label: t("finance.field.code"), required: true },
            { name: "name", label: t("finance.field.name"), required: true },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "TRY",
              options: (currencies.data ?? []).map((c) => ({ value: c.code, label: c.code })),
            },
            {
              name: "accountId",
              label: t("crm.field.customerSpecific"),
              type: "select",
              options: customerOptions(customers.data),
            },
            {
              name: "validFrom",
              label: t("crm.field.validFrom"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "validTo", label: t("crm.field.validTo"), type: "date" },
            { name: "active", label: t("crm.field.active"), type: "checkbox", defaultValue: true },
            { name: "fuelSurchargePercent", label: t("crm.field.fuelPercent"), type: "amount" },
            { name: "waitingHourlyFee", label: t("crm.field.waitingFee"), type: "amount" },
            { name: "extraStopFee", label: t("crm.field.extraStopFee"), type: "amount" },
            { name: "adrPercent", label: t("crm.field.adrPercent"), type: "amount" },
            { name: "insurancePercent", label: t("crm.field.insurancePercent"), type: "amount" },
            {
              name: "taxRateId",
              label: t("crm.field.taxRate"),
              type: "select",
              options: (taxRates.data ?? []).map((x) => ({ value: x.id, label: x.name })),
            },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values, flags) =>
            apiRequest("POST", "/crm/tariffs", {
              code: values.code,
              name: values.name,
              currency: values.currency,
              accountId: orNull(values.accountId),
              validFrom: values.validFrom,
              validTo: orNull(values.validTo),
              active: flags.active,
              fuelSurchargePercent: orNull(values.fuelSurchargePercent),
              waitingHourlyFee: orNull(values.waitingHourlyFee),
              extraStopFee: orNull(values.extraStopFee),
              adrPercent: orNull(values.adrPercent),
              insurancePercent: orNull(values.insurancePercent),
              taxRateId: orNull(values.taxRateId),
            })
          }
          onSaved={refresh}
        />
      )}
      {dialog === "tax" && (
        <FormDialog
          title={t("crm.action.newTaxRate")}
          fields={[
            { name: "code", label: t("finance.field.code"), required: true },
            { name: "name", label: t("finance.field.name"), required: true },
            {
              name: "vatPercent",
              label: t("crm.field.vatPercent"),
              type: "amount",
              required: true,
            },
            {
              name: "withholdingNumerator",
              label: t("crm.field.withholdingNumerator"),
              required: true,
              defaultValue: "0",
            },
            {
              name: "withholdingDenominator",
              label: t("crm.field.withholdingDenominator"),
              required: true,
              defaultValue: "10",
            },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values) => apiRequest("POST", "/crm/tax-rates", values)}
          onSaved={refresh}
        />
      )}
    </Stack>
  );
}

export function TariffDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const canEdit = useCan("CRM_EDIT");
  const tariffs = useTariffs();
  const tariff = tariffs.data?.find((item) => item.id === id);
  const [adding, setAdding] = useState(false);

  const lines = useQuery({
    queryKey: ["crm", "tariff-lines", id],
    queryFn: () => apiGet<TariffLine[]>(`/crm/tariffs/${id}/lines`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["crm", "tariff-lines", id] });
  const remove = useMutation({
    mutationFn: (lineId: string) => apiRequest("DELETE", `/crm/tariff-lines/${lineId}`),
    onSuccess: refresh,
  });

  return (
    <>
      <SectionHeader title={tariff ? `${tariff.code} · ${tariff.name}` : ""}>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("crm.action.newLine")}
          </Button>
        )}
      </SectionHeader>
      {remove.isError && <ErrorState error={remove.error} />}
      <QueryState isPending={lines.isPending} error={lines.error} />
      {lines.data && (
        <DataTable
          rows={lines.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("crm.field.kind"), render: (r) => t(`crm.lineKind.${r.kind}`) },
            { header: t("crm.field.origin"), render: (r) => r.origin },
            { header: t("crm.field.destination"), render: (r) => r.destination },
            { header: t("crm.field.vehicleType"), render: (r) => r.vehicleType },
            { header: t("crm.field.unit"), render: (r) => t(`crm.unit.${r.unit}`) },
            {
              header: t("crm.field.unitPrice"),
              align: "right",
              render: (r) => formatAmount(r.unitPrice),
            },
            {
              header: t("crm.field.minAmount"),
              align: "right",
              render: (r) => (r.minAmount ? formatAmount(r.minAmount) : ""),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canEdit && (
                  <Button size="small" color="error" onClick={() => remove.mutate(r.id)}>
                    {t("common.delete")}
                  </Button>
                ),
            },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("crm.action.newLine")}
          fields={[
            {
              name: "kind",
              label: t("crm.field.kind"),
              type: "select",
              required: true,
              defaultValue: "ROUTE",
              options: ["ROUTE", "DISTANCE"].map((value) => ({
                value,
                label: t(`crm.lineKind.${value}`),
              })),
            },
            { name: "origin", label: t("crm.field.origin") },
            { name: "destination", label: t("crm.field.destination") },
            { name: "vehicleType", label: t("crm.field.vehicleType") },
            {
              name: "unit",
              label: t("crm.field.unit"),
              type: "select",
              required: true,
              defaultValue: "TRIP",
              options: ["TRIP", "TON", "PALLET", "KM"].map((value) => ({
                value,
                label: t(`crm.unit.${value}`),
              })),
            },
            { name: "unitPrice", label: t("crm.field.unitPrice"), type: "amount", required: true },
            { name: "minAmount", label: t("crm.field.minAmount"), type: "amount" },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/crm/tariffs/${id}/lines`, {
              kind: values.kind,
              origin: orNull(values.origin),
              destination: orNull(values.destination),
              vehicleType: orNull(values.vehicleType),
              unit: values.unit,
              unitPrice: values.unitPrice,
              minAmount: orNull(values.minAmount),
            })
          }
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
    </>
  );
}

import { Button, Link } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { orNull } from "../crm/common";
import {
  DataTable,
  FormDialog,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  today,
  useCan,
  useCurrencies,
} from "../finance/common";
import { useCustomsOptions } from "./common";
import { Crossing } from "./types";

export function CrossingsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CUSTOMS_EDIT");
  const options = useCustomsOptions();
  const currencies = useCurrencies();
  const [adding, setAdding] = useState(false);
  const crossings = useQuery({
    queryKey: ["customs", "crossings"],
    queryFn: () => apiGet<Crossing[]>("/customs/crossings"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/customs/crossings/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["customs"] }),
  });

  return (
    <>
      <SectionHeader title={t("customs.tabs.crossings")}>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("customs.action.newCrossing")}
          </Button>
        )}
      </SectionHeader>
      {remove.isError && <ErrorState error={remove.error} />}
      <QueryState isPending={crossings.isPending} error={crossings.error} />
      {crossings.data && (
        <DataTable
          rows={crossings.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.date"), render: (r) => formatDate(r.crossedOn) },
            {
              header: t("customs.field.shipment"),
              render: (r) => (
                <Link component={RouterLink} to={`/operations/shipments/${r.shipmentId}`}>
                  {r.shipmentNumber}
                </Link>
              ),
            },
            { header: t("customs.field.gate"), render: (r) => r.gate },
            {
              header: t("customs.field.direction"),
              render: (r) => t(`customs.direction.${r.direction}`),
            },
            { header: t("customs.field.account"), render: (r) => r.accountName },
            {
              header: t("customs.field.fee"),
              align: "right",
              render: (r) => (r.fee ? formatMoney(r.fee) : ""),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                r.posted
                  ? t("operations.field.posted")
                  : canEdit && (
                      <Button size="small" color="error" onClick={() => remove.mutate(r.id)}>
                        {t("common.delete")}
                      </Button>
                    ),
            },
          ]}
        />
      )}
      {adding && options.data && currencies.data && (
        <FormDialog
          title={t("customs.action.newCrossing")}
          fields={[
            {
              name: "shipmentId",
              label: t("customs.field.shipment"),
              type: "select",
              required: true,
              options: options.data.shipments.map((s) => ({ value: s.id, label: s.label })),
            },
            { name: "gate", label: t("customs.field.gate"), required: true },
            {
              name: "direction",
              label: t("customs.field.direction"),
              type: "select",
              required: true,
              defaultValue: "EXIT",
              options: ["EXIT", "ENTRY"].map((value) => ({
                value,
                label: t(`customs.direction.${value}`),
              })),
            },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "amount",
              label: t("customs.field.fee"),
              type: "amount",
              helperText: t("customs.notice.feeToCost"),
            },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "EUR",
              options: currencies.data.map((c) => ({ value: c.code, label: c.code })),
            },
            {
              name: "accountId",
              label: t("customs.field.account"),
              type: "select",
              options: options.data.feeAccounts.map((a) => ({ value: a.id, label: a.label })),
            },
            { name: "note", label: t("operations.field.note") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/customs/crossings", {
              shipmentId: values.shipmentId,
              gate: values.gate,
              direction: values.direction,
              date: values.date,
              fee: values.amount ? { amount: values.amount, currency: values.currency } : null,
              accountId: orNull(values.accountId),
              note: orNull(values.note),
            })
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["customs"] });
          }}
        />
      )}
    </>
  );
}

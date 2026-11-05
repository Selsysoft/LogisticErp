import { Button, Chip, Link } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  useCan,
  useCurrencies,
} from "../finance/common";
import { useCustomsOptions } from "./common";
import { Transit } from "./types";

const KINDS = ["T1", "T2", "TIR"];
const DEFAULT_TRANSIT_DAYS = 8;

export function TransitsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CUSTOMS_EDIT");
  const options = useCustomsOptions();
  const currencies = useCurrencies();
  const [adding, setAdding] = useState(false);
  const [discharging, setDischarging] = useState<Transit | null>(null);
  const transits = useQuery({
    queryKey: ["customs", "transits"],
    queryFn: () => apiGet<Transit[]>("/customs/transits"),
  });
  const refresh = () => {
    setAdding(false);
    setDischarging(null);
    void client.invalidateQueries({ queryKey: ["customs"] });
  };
  const cancel = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/customs/transits/${id}/cancel`),
    onSuccess: refresh,
  });

  return (
    <>
      <SectionHeader title={t("customs.tabs.transits")}>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("customs.action.newTransit")}
          </Button>
        )}
      </SectionHeader>
      {cancel.isError && <ErrorState error={cancel.error} />}
      <QueryState isPending={transits.isPending} error={transits.error} />
      {transits.data && (
        <DataTable
          rows={transits.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("customs.field.kind"), render: (r) => r.kind },
            { header: t("customs.field.documentNo"), render: (r) => r.documentNo },
            {
              header: t("customs.field.shipment"),
              render: (r) => (
                <Link component={RouterLink} to={`/operations/shipments/${r.shipmentId}`}>
                  {r.shipmentNumber}
                </Link>
              ),
            },
            {
              header: t("customs.field.route"),
              render: (r) => `${r.departureOffice} → ${r.destinationOffice}`,
            },
            {
              header: t("customs.field.guarantee"),
              align: "right",
              render: (r) => formatMoney(r.guarantee),
            },
            { header: t("customs.field.deadline"), render: (r) => formatDate(r.deadline) },
            {
              header: t("finance.field.status"),
              render: (r) => (
                <Chip
                  size="small"
                  color={r.overdue ? "error" : r.status === "OPEN" ? "warning" : "default"}
                  label={
                    r.overdue ? t("customs.field.overdue") : t(`customs.transitStatus.${r.status}`)
                  }
                />
              ),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canEdit &&
                r.status === "OPEN" && (
                  <>
                    <Button size="small" onClick={() => setDischarging(r)}>
                      {t("customs.action.discharge")}
                    </Button>
                    <Button size="small" color="error" onClick={() => cancel.mutate(r.id)}>
                      {t("customs.action.cancelTransit")}
                    </Button>
                  </>
                ),
            },
          ]}
        />
      )}
      {adding && options.data && currencies.data && (
        <FormDialog
          title={t("customs.action.newTransit")}
          fields={[
            {
              name: "shipmentId",
              label: t("customs.field.shipment"),
              type: "select",
              required: true,
              options: options.data.shipments.map((s) => ({ value: s.id, label: s.label })),
            },
            {
              name: "kind",
              label: t("customs.field.kind"),
              type: "select",
              required: true,
              defaultValue: "T1",
              options: KINDS.map((value) => ({ value, label: value })),
            },
            { name: "documentNo", label: t("customs.field.documentNo"), required: true },
            { name: "departureOffice", label: t("customs.field.departure"), required: true },
            { name: "destinationOffice", label: t("customs.field.destination"), required: true },
            { name: "amount", label: t("customs.field.guarantee"), type: "amount", required: true },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "EUR",
              options: currencies.data.map((c) => ({ value: c.code, label: c.code })),
            },
            {
              name: "issuedOn",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "deadline",
              label: t("customs.field.deadline"),
              type: "date",
              required: true,
              defaultValue: shiftDays(today(), DEFAULT_TRANSIT_DAYS),
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/customs/transits", {
              shipmentId: values.shipmentId,
              kind: values.kind,
              documentNo: values.documentNo,
              departureOffice: values.departureOffice,
              destinationOffice: values.destinationOffice,
              guarantee: { amount: values.amount, currency: values.currency },
              issuedOn: values.issuedOn,
              deadline: values.deadline,
            })
          }
          onSaved={refresh}
        />
      )}
      {discharging && (
        <FormDialog
          title={`${t("customs.action.discharge")} · ${discharging.documentNo}`}
          fields={[
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
          ]}
          onClose={() => setDischarging(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/customs/transits/${discharging.id}/discharge`, values)
          }
          onSaved={refresh}
        />
      )}
    </>
  );
}

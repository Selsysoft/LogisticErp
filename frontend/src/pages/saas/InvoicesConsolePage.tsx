import { Alert, Button, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  today,
} from "../finance/common";
import { adminGet, adminRequest } from "./adminApi";
import { SaasInvoice } from "./types";

export function InvoicesConsolePage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [paying, setPaying] = useState<SaasInvoice | null>(null);
  const [voiding, setVoiding] = useState<SaasInvoice | null>(null);
  const invoices = useQuery({
    queryKey: ["saas", "invoices"],
    queryFn: () => adminGet<SaasInvoice[]>("/invoices"),
  });
  const refresh = () => {
    setPaying(null);
    setVoiding(null);
    void client.invalidateQueries({ queryKey: ["saas"] });
  };
  const run = useMutation({
    mutationFn: () => adminRequest<{ processed: number; failed: number }>("POST", "/billing/run"),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["saas"] }),
  });

  return (
    <Stack spacing={2}>
      <SectionHeader title={t("saas.tabs.invoices")}>
        <Button variant="outlined" disabled={run.isPending} onClick={() => run.mutate()}>
          {t("saas.action.runBilling")}
        </Button>
      </SectionHeader>
      <Alert severity="info">{t("saas.invoiceNote")}</Alert>
      {run.isError && <ErrorState error={run.error} />}
      {run.data && (
        <Alert severity={run.data.failed > 0 ? "warning" : "success"}>
          {t("saas.billingResult", run.data)}
        </Alert>
      )}
      <QueryState isPending={invoices.isPending} error={invoices.error} />
      {invoices.data && (
        <DataTable
          rows={invoices.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("saas.field.number"), render: (row) => row.number },
            { header: t("saas.field.code"), render: (row) => row.tenantCode ?? "—" },
            { header: t("saas.field.plan"), render: (row) => row.planName },
            {
              header: t("saas.field.period"),
              render: (row) => `${formatDate(row.periodStart)} - ${formatDate(row.periodEnd)}`,
            },
            {
              header: t("saas.field.amount"),
              align: "right",
              render: (row) => `${formatAmount(row.amount)} ${row.currency}`,
            },
            { header: t("saas.field.dueOn"), render: (row) => formatDate(row.dueOn) },
            {
              header: t("saas.field.status"),
              render: (row) => t(`saas.invoiceStatus.${row.status}`),
            },
            {
              header: t("saas.field.attempts"),
              align: "right",
              render: (row) => `${row.failedAttempts} / ${row.reminderCount}`,
            },
            {
              header: "",
              render: (row) =>
                row.status === "ISSUED" && (
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" onClick={() => setPaying(row)}>
                      {t("saas.action.markPaid")}
                    </Button>
                    <Button size="small" color="error" onClick={() => setVoiding(row)}>
                      {t("saas.action.void")}
                    </Button>
                  </Stack>
                ),
            },
          ]}
        />
      )}
      {paying && (
        <FormDialog
          title={`${t("saas.action.markPaid")}: ${paying.number}`}
          fields={[
            {
              name: "date",
              label: t("saas.field.paidOn"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "reference", label: t("saas.field.reference"), required: true },
          ]}
          onClose={() => setPaying(null)}
          onSaved={refresh}
          onSubmit={(values) => adminRequest("POST", `/invoices/${paying.id}/pay`, values)}
        />
      )}
      {voiding && (
        <FormDialog
          title={t("saas.confirm.void", { number: voiding.number })}
          fields={[]}
          submitLabel={t("saas.action.void")}
          onClose={() => setVoiding(null)}
          onSaved={refresh}
          onSubmit={() => adminRequest("POST", `/invoices/${voiding.id}/void`)}
        />
      )}
    </Stack>
  );
}

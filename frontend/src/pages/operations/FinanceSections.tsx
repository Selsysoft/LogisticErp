import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiDownload, apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  useCan,
  useCurrencies,
} from "../finance/common";
import { orNull } from "../crm/common";
import { useShipmentOptions } from "./common";
import { FreightInvoice, LinkableExpense, Profit, Shipment, TripCost } from "./types";

const COST_KINDS = ["FUEL", "TOLL", "PER_DIEM", "OTHER"];
const DEFAULT_DUE_DAYS = 30;

export function InvoiceSection({ shipment }: { shipment: Shipment }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canInvoice = useCan("SHIPMENT_INVOICE");
  const [dialog, setDialog] = useState<"issue" | "cancel" | "close" | null>(null);
  const invoice = useQuery({
    queryKey: ["shipment", "invoice", shipment.id],
    queryFn: async () =>
      (await apiGet<FreightInvoice | undefined>(`/shipment/shipments/${shipment.id}/invoice`)) ??
      null,
  });
  const pdf = useMutation({
    mutationFn: (row: FreightInvoice) =>
      apiDownload(`/shipment/invoices/${row.id}/pdf`, `${row.number}.pdf`),
  });
  const refresh = () => {
    setDialog(null);
    void client.invalidateQueries({ queryKey: ["shipment"] });
    void client.invalidateQueries({ queryKey: ["finance"] });
  };
  const foreign = shipment.total.currency !== "TRY";

  return (
    <Box>
      <SectionHeader title={t("operations.sections.invoice")}>
        {canInvoice && shipment.status === "DELIVERED" && (
          <Button variant="contained" onClick={() => setDialog("issue")}>
            {t("operations.action.issueInvoice")}
          </Button>
        )}
        {canInvoice && shipment.status === "INVOICED" && (
          <>
            <Button color="error" onClick={() => setDialog("cancel")}>
              {t("operations.action.cancelInvoice")}
            </Button>
            <Button variant="contained" onClick={() => setDialog("close")}>
              {t("operations.action.close")}
            </Button>
          </>
        )}
      </SectionHeader>
      <QueryState isPending={invoice.isPending} error={invoice.error} />
      {pdf.isError && <ErrorState error={pdf.error} />}
      <Alert severity="info" sx={{ mb: 2 }}>
        {t("operations.notice.notLegalInvoice")}
      </Alert>
      {invoice.data && (
        <DataTable
          rows={[invoice.data]}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.number"), render: (r) => r.number },
            {
              header: t("operations.field.invoiceDate"),
              render: (r) => formatDate(r.invoiceDate),
            },
            { header: t("operations.field.dueDate"), render: (r) => formatDate(r.dueDate) },
            { header: t("crm.field.net"), align: "right", render: (r) => formatMoney(r.net) },
            { header: t("crm.field.vat"), align: "right", render: (r) => formatMoney(r.vat) },
            {
              header: t("crm.field.withholding"),
              align: "right",
              render: (r) => formatMoney(r.withholding),
            },
            { header: t("crm.field.total"), align: "right", render: (r) => formatMoney(r.total) },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) => (
                <Button size="small" onClick={() => pdf.mutate(r)}>
                  {t("operations.action.pdf")}
                </Button>
              ),
            },
          ]}
        />
      )}
      {dialog === "issue" && (
        <FormDialog
          title={t("operations.action.issueInvoice")}
          fields={[
            {
              name: "invoiceDate",
              label: t("operations.field.invoiceDate"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "dueDate",
              label: t("operations.field.dueDate"),
              type: "date",
              required: true,
              defaultValue: shiftDays(today(), DEFAULT_DUE_DAYS),
            },
            ...(foreign
              ? [
                  {
                    name: "exchangeRate",
                    label: t("operations.field.exchangeRate"),
                    type: "amount" as const,
                    helperText: t("operations.field.exchangeRateHelp"),
                  },
                ]
              : []),
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/shipment/shipments/${shipment.id}/invoice`, {
              invoiceDate: values.invoiceDate,
              dueDate: values.dueDate,
              exchangeRate: orNull(values.exchangeRate ?? ""),
            })
          }
          onSaved={refresh}
        />
      )}
      {dialog === "cancel" && invoice.data && (
        <FormDialog
          title={t("operations.action.cancelInvoice")}
          fields={[
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/shipment/invoices/${invoice.data?.id}/cancel`, {
              date: values.date,
            })
          }
          onSaved={refresh}
        />
      )}
      {dialog === "close" && (
        <FormDialog
          title={t("operations.action.close")}
          fields={[
            {
              name: "date",
              label: t("operations.field.closeDate"),
              type: "date",
              required: true,
              defaultValue: today(),
              helperText: t("operations.notice.closeExplain"),
            },
            {
              name: "dueDate",
              label: t("operations.field.closeDue"),
              type: "date",
              required: true,
              defaultValue: shiftDays(today(), DEFAULT_DUE_DAYS),
            },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/shipment/shipments/${shipment.id}/close`, {
              date: values.date,
              dueDate: values.dueDate,
            })
          }
          onSaved={refresh}
        />
      )}
    </Box>
  );
}

function LinkExpenseDialog({
  shipmentId,
  onClose,
  onSaved,
}: {
  shipmentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const expenses = useQuery({
    queryKey: ["shipment", "linkable", shipmentId],
    queryFn: () => apiGet<LinkableExpense[]>(`/shipment/shipments/${shipmentId}/linkable-expenses`),
  });
  if (!expenses.data) {
    return expenses.error ? <ErrorState error={expenses.error} /> : null;
  }
  return (
    <FormDialog
      title={t("operations.action.linkExpense")}
      fields={[
        {
          name: "vehicleExpenseId",
          label: t("operations.field.expense"),
          type: "select",
          required: true,
          options: expenses.data.map((expense) => ({
            value: expense.id,
            label: `${expense.plate} · ${formatDate(expense.date)} · ${formatMoney(expense.money)}`,
          })),
        },
        {
          name: "kind",
          label: t("operations.field.costKind"),
          type: "select",
          required: true,
          options: COST_KINDS.map((kind) => ({
            value: kind,
            label: t(`operations.costKind.${kind}`),
          })),
        },
      ]}
      onClose={onClose}
      onSubmit={(values) =>
        apiRequest("POST", `/shipment/shipments/${shipmentId}/costs`, {
          kind: values.kind,
          vehicleExpenseId: values.vehicleExpenseId,
        })
      }
      onSaved={onSaved}
    />
  );
}

function AddCostDialog({
  shipmentId,
  onClose,
  onSaved,
}: {
  shipmentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const options = useShipmentOptions();
  const currencies = useCurrencies();
  if (!options.data || !currencies.data) {
    return null;
  }
  return (
    <FormDialog
      title={t("operations.action.addCost")}
      fields={[
        {
          name: "kind",
          label: t("operations.field.costKind"),
          type: "select",
          required: true,
          options: COST_KINDS.map((kind) => ({
            value: kind,
            label: t(`operations.costKind.${kind}`),
          })),
        },
        {
          name: "accountId",
          label: t("operations.field.account"),
          type: "select",
          required: true,
          options: options.data.costAccounts.map((a) => ({ value: a.id, label: a.label })),
        },
        { name: "amount", label: t("finance.field.amount"), type: "amount", required: true },
        {
          name: "currency",
          label: t("finance.field.currency"),
          type: "select",
          required: true,
          defaultValue: "TRY",
          options: currencies.data.map((c) => ({ value: c.code, label: c.code })),
        },
        {
          name: "date",
          label: t("finance.field.date"),
          type: "date",
          required: true,
          defaultValue: today(),
        },
        { name: "description", label: t("finance.field.description") },
      ]}
      onClose={onClose}
      onSubmit={(values) =>
        apiRequest("POST", `/shipment/shipments/${shipmentId}/costs`, {
          kind: values.kind,
          accountId: values.accountId,
          money: { amount: values.amount, currency: values.currency },
          date: values.date,
          description: orNull(values.description),
        })
      }
      onSaved={onSaved}
    />
  );
}

export function CostsSection({ shipment }: { shipment: Shipment }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canDispatch = useCan("SHIPMENT_DISPATCH");
  const open = shipment.status !== "CLOSED" && shipment.status !== "CANCELLED";
  const [dialog, setDialog] = useState<"add" | "link" | null>(null);
  const costs = useQuery({
    queryKey: ["shipment", "costs", shipment.id],
    queryFn: () => apiGet<TripCost[]>(`/shipment/shipments/${shipment.id}/costs`),
  });
  const profit = useQuery({
    queryKey: ["shipment", "profit", shipment.id],
    queryFn: () => apiGet<Profit>(`/shipment/shipments/${shipment.id}/profit`),
  });
  const refresh = () => {
    setDialog(null);
    void client.invalidateQueries({ queryKey: ["shipment"] });
  };
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/shipment/costs/${id}`),
    onSuccess: refresh,
  });

  return (
    <Box>
      <SectionHeader title={t("operations.sections.costs")}>
        {canDispatch && open && (
          <>
            <Button variant="outlined" onClick={() => setDialog("link")}>
              {t("operations.action.linkExpense")}
            </Button>
            <Button variant="outlined" onClick={() => setDialog("add")}>
              {t("operations.action.addCost")}
            </Button>
          </>
        )}
      </SectionHeader>
      <QueryState isPending={costs.isPending} error={costs.error} />
      {remove.isError && <ErrorState error={remove.error} />}
      {costs.data && (
        <DataTable
          rows={costs.data}
          rowKey={(cost) => cost.id}
          columns={[
            {
              header: t("operations.field.costKind"),
              render: (c) => t(`operations.costKind.${c.kind}`),
            },
            {
              header: t("operations.field.account"),
              render: (c) => c.accountName ?? t("operations.field.expense"),
            },
            { header: t("finance.field.description"), render: (c) => c.description },
            {
              header: t("finance.field.amount"),
              align: "right",
              render: (c) => formatMoney(c.money),
            },
            {
              header: t("operations.field.tlAmount"),
              align: "right",
              render: (c) => formatAmount(c.tlAmount),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (c) =>
                c.postedAt ? (
                  t("operations.field.posted")
                ) : canDispatch && open && c.kind !== "SUBCONTRACTOR" ? (
                  <Button size="small" color="error" onClick={() => remove.mutate(c.id)}>
                    {t("common.delete")}
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
      {profit.data && (
        <Stack direction="row" spacing={3} useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
          <Typography variant="body2">
            {t("operations.field.revenue")}:{" "}
            {profit.data.revenueTl === null ? "—" : formatAmount(profit.data.revenueTl)}
            {!profit.data.invoiced && ` (${t("operations.field.estimated")})`}
          </Typography>
          <Typography variant="body2">
            {t("operations.field.cost")}: {formatAmount(profit.data.costTl)}
          </Typography>
          <Typography variant="subtitle2">
            {t("operations.field.margin")}:{" "}
            {profit.data.marginTl === null ? "—" : formatAmount(profit.data.marginTl)}
            {profit.data.marginPercent !== null && ` (%${formatAmount(profit.data.marginPercent)})`}
          </Typography>
        </Stack>
      )}
      {dialog === "add" && (
        <AddCostDialog shipmentId={shipment.id} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog === "link" && (
        <LinkExpenseDialog
          shipmentId={shipment.id}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
    </Box>
  );
}

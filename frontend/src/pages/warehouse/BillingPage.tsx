import { Alert, Box, Button, Chip, Link, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { apiDownload, apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { orNull } from "../crm/common";
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
import { HANDLING_KINDS, STORAGE_BASES, useWarehouseOptions, useWarehouses } from "./common";
import { Contract, Handling, InvoicePreview, Rate, WarehouseInvoice } from "./types";

const DEFAULT_DUE_DAYS = 30;
const DEFAULT_PERIOD_DAYS = 30;

export function BillingPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("WAREHOUSE_EDIT");
  const warehouses = useWarehouses();
  const options = useWarehouseOptions();
  const currencies = useCurrencies();
  const [adding, setAdding] = useState(false);
  const contracts = useQuery({
    queryKey: ["warehouse", "contracts"],
    queryFn: () => apiGet<Contract[]>("/warehouse/contracts"),
  });

  return (
    <>
      <SectionHeader title={t("warehouse.tabs.billing")}>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("warehouse.action.newContract")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={contracts.isPending} error={contracts.error} />
      {contracts.data && (
        <DataTable
          rows={contracts.data}
          rowKey={(row) => row.id}
          columns={[
            {
              header: t("warehouse.field.owner"),
              render: (r) => (
                <Link component={RouterLink} to={`/warehouse/billing/${r.id}`}>
                  {r.accountName}
                </Link>
              ),
            },
            { header: t("warehouse.field.warehouse"), render: (r) => r.warehouseName },
            {
              header: t("warehouse.field.period"),
              render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`,
            },
            {
              header: t("warehouse.field.storageRate"),
              align: "right",
              render: (r) =>
                `${formatAmount(r.storageRate)} ${r.currency} / ${t(`warehouse.basis.${r.storageBasis}`)}`,
            },
          ]}
        />
      )}
      {adding && warehouses.data && options.data && currencies.data && (
        <FormDialog
          title={t("warehouse.action.newContract")}
          fields={[
            {
              name: "accountId",
              label: t("warehouse.field.owner"),
              type: "select",
              required: true,
              options: options.data.customers.map((c) => ({ value: c.id, label: c.label })),
            },
            {
              name: "warehouseId",
              label: t("warehouse.field.warehouse"),
              type: "select",
              required: true,
              options: warehouses.data.map((w) => ({ value: w.id, label: w.name })),
            },
            {
              name: "startDate",
              label: t("finance.field.from"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "endDate",
              label: t("finance.field.to"),
              type: "date",
              required: true,
              defaultValue: shiftDays(today(), 365),
            },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "TRY",
              options: currencies.data.map((c) => ({ value: c.code, label: c.code })),
            },
            {
              name: "storageBasis",
              label: t("warehouse.field.storageBasis"),
              type: "select",
              required: true,
              defaultValue: "PALLET_DAY",
              options: STORAGE_BASES.map((value) => ({
                value,
                label: t(`warehouse.basis.${value}`),
              })),
            },
            {
              name: "storageRate",
              label: t("warehouse.field.storageRate"),
              type: "amount",
              required: true,
            },
            {
              name: "taxRateId",
              label: t("operations.field.taxRate"),
              type: "select",
              options: options.data.taxRates.map((r) => ({ value: r.id, label: r.label })),
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/warehouse/contracts", {
              ...values,
              taxRateId: orNull(values.taxRateId),
            })
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["warehouse"] });
          }}
        />
      )}
    </>
  );
}

function RatesSection({ contractId }: { contractId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("WAREHOUSE_EDIT");
  const [adding, setAdding] = useState(false);
  const key = ["warehouse", "rates", contractId];
  const rates = useQuery({
    queryKey: key,
    queryFn: () => apiGet<Rate[]>(`/warehouse/contracts/${contractId}/rates`),
  });
  return (
    <Box>
      <SectionHeader title={t("warehouse.sections.rates")}>
        {canEdit && (
          <Button variant="outlined" onClick={() => setAdding(true)}>
            {t("warehouse.action.saveRate")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={rates.isPending} error={rates.error} />
      {rates.data && (
        <DataTable
          rows={rates.data}
          rowKey={(row) => row.id}
          columns={[
            {
              header: t("warehouse.field.handlingKind"),
              render: (r) => t(`warehouse.handling.${r.kind}`),
            },
            {
              header: t("warehouse.field.unitPrice"),
              align: "right",
              render: (r) => formatAmount(r.unitPrice),
            },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("warehouse.action.saveRate")}
          fields={[
            {
              name: "kind",
              label: t("warehouse.field.handlingKind"),
              type: "select",
              required: true,
              options: HANDLING_KINDS.map((value) => ({
                value,
                label: t(`warehouse.handling.${value}`),
              })),
            },
            {
              name: "unitPrice",
              label: t("warehouse.field.unitPrice"),
              type: "amount",
              required: true,
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/warehouse/contracts/${contractId}/rates`, values)
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: key });
          }}
        />
      )}
    </Box>
  );
}

function HandlingSection({ contractId }: { contractId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("WAREHOUSE_EDIT");
  const options = useWarehouseOptions();
  const [adding, setAdding] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ["warehouse"] });
  const charges = useQuery({
    queryKey: ["warehouse", "handling", contractId],
    queryFn: () => apiGet<Handling[]>(`/warehouse/contracts/${contractId}/handling`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/warehouse/handling/${id}`),
    onSuccess: refresh,
  });
  return (
    <Box>
      <SectionHeader title={t("warehouse.sections.handling")}>
        {canEdit && (
          <Button variant="outlined" onClick={() => setAdding(true)}>
            {t("warehouse.action.addHandling")}
          </Button>
        )}
      </SectionHeader>
      {remove.isError && <ErrorState error={remove.error} />}
      <QueryState isPending={charges.isPending} error={charges.error} />
      {charges.data && (
        <DataTable
          rows={charges.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.date"), render: (r) => formatDate(r.chargedOn) },
            {
              header: t("warehouse.field.handlingKind"),
              render: (r) => t(`warehouse.handling.${r.kind}`),
            },
            {
              header: t("warehouse.field.quantity"),
              align: "right",
              render: (r) => formatAmount(r.quantity),
            },
            {
              header: t("warehouse.field.unitPrice"),
              align: "right",
              render: (r) => formatAmount(r.unitPrice),
            },
            {
              header: t("finance.field.amount"),
              align: "right",
              render: (r) => formatAmount(r.amount),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                r.invoiceId
                  ? t("warehouse.field.billed")
                  : canEdit && (
                      <Button size="small" color="error" onClick={() => remove.mutate(r.id)}>
                        {t("common.delete")}
                      </Button>
                    ),
            },
          ]}
        />
      )}
      {adding && options.data && (
        <FormDialog
          title={t("warehouse.action.addHandling")}
          fields={[
            {
              name: "kind",
              label: t("warehouse.field.handlingKind"),
              type: "select",
              required: true,
              options: HANDLING_KINDS.map((value) => ({
                value,
                label: t(`warehouse.handling.${value}`),
              })),
            },
            {
              name: "quantity",
              label: t("warehouse.field.quantity"),
              type: "amount",
              required: true,
            },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "shipmentId",
              label: t("warehouse.field.shipment"),
              type: "select",
              options: options.data.shipments.map((s) => ({ value: s.id, label: s.label })),
            },
            { name: "note", label: t("operations.field.note") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/warehouse/contracts/${contractId}/handling`, {
              kind: values.kind,
              quantity: values.quantity,
              date: values.date,
              shipmentId: orNull(values.shipmentId),
              note: orNull(values.note),
            })
          }
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
    </Box>
  );
}

function InvoicesSection({ contract }: { contract: Contract }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canInvoice = useCan("WAREHOUSE_INVOICE");
  const lastDay = today() < contract.endDate ? today() : contract.endDate;
  const earliest = shiftDays(lastDay, -DEFAULT_PERIOD_DAYS);
  const [from, setFrom] = useState(earliest < contract.startDate ? contract.startDate : earliest);
  const [to, setTo] = useState(lastDay);
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState<WarehouseInvoice | null>(null);

  const preview = useQuery({
    queryKey: ["warehouse", "preview", contract.id, from, to],
    queryFn: () =>
      apiGet<InvoicePreview>(
        `/warehouse/contracts/${contract.id}/invoice-preview?from=${from}&to=${to}`,
      ),
    enabled: !!from && !!to,
    retry: false,
  });
  const invoices = useQuery({
    queryKey: ["warehouse", "invoices", contract.id],
    queryFn: () => apiGet<WarehouseInvoice[]>(`/warehouse/contracts/${contract.id}/invoices`),
  });
  const pdf = useMutation({
    mutationFn: (row: WarehouseInvoice) =>
      apiDownload(`/warehouse/invoices/${row.id}/pdf`, `${row.number}.pdf`),
  });
  const refresh = () => {
    setIssuing(false);
    setCancelling(null);
    void client.invalidateQueries({ queryKey: ["warehouse"] });
    void client.invalidateQueries({ queryKey: ["finance"] });
  };
  const foreign = contract.currency !== "TRY";

  return (
    <Box>
      <SectionHeader title={t("warehouse.sections.invoices")}>
        <TextField
          size="small"
          type="date"
          label={t("finance.field.from")}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={t("finance.field.to")}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {canInvoice && (
          <Button
            variant="contained"
            disabled={!preview.data || Number(preview.data.net.amount) <= 0}
            onClick={() => setIssuing(true)}
          >
            {t("warehouse.action.issueInvoice")}
          </Button>
        )}
      </SectionHeader>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t("warehouse.notice.notLegalInvoice")}
      </Alert>
      {preview.isError && <ErrorState error={preview.error} />}
      {pdf.isError && <ErrorState error={pdf.error} />}
      {preview.data && (
        <Stack direction="row" spacing={3} useFlexGap sx={{ mb: 2, flexWrap: "wrap" }}>
          <Typography variant="body2">
            {t("warehouse.field.storageQuantity")}: {formatAmount(preview.data.storageQuantity)}
          </Typography>
          <Typography variant="body2">
            {t("warehouse.field.storage")}: {formatMoney(preview.data.storage)}
          </Typography>
          <Typography variant="body2">
            {t("warehouse.sections.handling")}: {formatMoney(preview.data.handling)}
          </Typography>
          <Typography variant="body2">
            {t("crm.field.vat")}: {formatMoney(preview.data.vat)}
          </Typography>
          {Number(preview.data.withholding.amount) > 0 && (
            <Typography variant="body2">
              {t("crm.field.withholding")}: −{formatMoney(preview.data.withholding)}
            </Typography>
          )}
          <Typography variant="subtitle2">
            {t("crm.field.total")}: {formatMoney(preview.data.total)}
          </Typography>
        </Stack>
      )}
      <QueryState isPending={invoices.isPending} error={invoices.error} />
      {invoices.data && (
        <DataTable
          rows={invoices.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.number"), render: (r) => r.number },
            {
              header: t("warehouse.field.period"),
              render: (r) => `${formatDate(r.periodFrom)} – ${formatDate(r.periodTo)}`,
            },
            { header: t("operations.field.dueDate"), render: (r) => formatDate(r.dueDate) },
            { header: t("crm.field.total"), align: "right", render: (r) => formatMoney(r.total) },
            {
              header: t("finance.field.status"),
              render: (r) => (
                <Chip
                  size="small"
                  color={r.status === "ISSUED" ? "success" : "default"}
                  label={t(`operations.invoiceStatus.${r.status}`)}
                />
              ),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) => (
                <>
                  <Button size="small" onClick={() => pdf.mutate(r)}>
                    {t("operations.action.pdf")}
                  </Button>
                  {canInvoice && r.status === "ISSUED" && (
                    <Button size="small" color="error" onClick={() => setCancelling(r)}>
                      {t("operations.action.cancelInvoice")}
                    </Button>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
      {issuing && (
        <FormDialog
          title={t("warehouse.action.issueInvoice")}
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
          onClose={() => setIssuing(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/warehouse/contracts/${contract.id}/invoices`, {
              from,
              to,
              invoiceDate: values.invoiceDate,
              dueDate: values.dueDate,
              exchangeRate: orNull(values.exchangeRate ?? ""),
            })
          }
          onSaved={refresh}
        />
      )}
      {cancelling && (
        <FormDialog
          title={`${t("operations.action.cancelInvoice")} · ${cancelling.number}`}
          fields={[
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
          ]}
          onClose={() => setCancelling(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/warehouse/invoices/${cancelling.id}/cancel`, {
              date: values.date,
            })
          }
          onSaved={refresh}
        />
      )}
    </Box>
  );
}

export function ContractDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const contracts = useQuery({
    queryKey: ["warehouse", "contracts"],
    queryFn: () => apiGet<Contract[]>("/warehouse/contracts"),
  });
  const contract = contracts.data?.find((row) => row.id === id);
  if (!contract) {
    return <QueryState isPending={contracts.isPending} error={contracts.error} />;
  }
  return (
    <Stack spacing={4}>
      <Box>
        <SectionHeader title={`${contract.accountName} · ${contract.warehouseName}`} />
        <Typography variant="body2">
          {formatDate(contract.startDate)} – {formatDate(contract.endDate)} ·{" "}
          {formatAmount(contract.storageRate)} {contract.currency} /{" "}
          {t(`warehouse.basis.${contract.storageBasis}`)}
        </Typography>
      </Box>
      <RatesSection contractId={id} />
      <HandlingSection contractId={id} />
      <InvoicesSection contract={contract} />
    </Stack>
  );
}

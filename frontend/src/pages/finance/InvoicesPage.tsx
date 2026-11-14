import { Alert, Button, Stack } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import { ErrorState } from "../../components/ErrorState";
import { companyOfBranch } from "./branchOptions";
import {
  type Column,
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  today,
  useAccounts,
  useBranchOptions,
  useCan,
  useCompanyName,
  useCurrencies,
  useMultiCompany,
  usePaging,
} from "./common";
import { withCompany } from "./companyQuery";
import { useInvoiceGaps } from "./fundApi";
import { gapsForCompany, invoiceGapText, type Translate } from "./settlementWarnings";
import { Invoice, Page } from "./types";

type GapTarget = { accountId: string; companyId: string | null; currency: string };

/** Fatura girişi formundaki cari/iş yeri/para birimi seçimi (eksik fatura notu için). */
function gapTarget(
  values: Record<string, string | boolean>,
  companyOf: (branchId: string) => string | undefined,
): GapTarget | null {
  const accountId = typeof values.accountId === "string" ? values.accountId : "";
  const branchId = typeof values.branchId === "string" ? values.branchId : "";
  const currency = typeof values.currency === "string" ? values.currency : "";
  if (!accountId || !currency) return null;
  return { accountId, companyId: (branchId && companyOf(branchId)) || null, currency };
}

export function InvoicesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const accounts = useAccounts();
  const { branches, optionsFor } = useBranchOptions();
  const companyId = useActiveCompanyId();
  const multiCompany = useMultiCompany();
  const companyName = useCompanyName();
  const currencies = useCurrencies();
  const paging = usePaging();
  const [adding, setAdding] = useState(false);
  // Eksik fatura notu (K-12.2-4 "fatura giriş ekranı"): cari + iş yerinin şirketi + para birimi.
  const [target, setTarget] = useState<GapTarget | null>(null);
  const targetKey = target ? `${target.accountId}|${target.companyId}|${target.currency}` : "";
  const onValuesChange = useCallback(
    (values: Record<string, string | boolean>) => {
      const next = gapTarget(values, (id) => companyOfBranch(branches.data, id));
      const key = next ? `${next.accountId}|${next.companyId}|${next.currency}` : "";
      setTarget((current) => {
        const currentKey = current
          ? `${current.accountId}|${current.companyId}|${current.currency}`
          : "";
        return currentKey === key ? current : next;
      });
    },
    [branches.data],
  );
  const gaps = useInvoiceGaps(
    { companyId: target?.companyId ?? undefined, side: "PAYABLE" },
    { enabled: adding && target !== null },
  );
  const gapRows =
    target && targetKey
      ? gapsForCompany(gaps.data, target.companyId, {
          accountId: target.accountId,
          side: "PAYABLE",
          currency: target.currency,
        })
      : [];
  const translate: Translate = (key, values) => t(key, values);

  const list = useQuery({
    queryKey: ["finance", "invoices", paging.page, paging.size, companyId],
    queryFn: () =>
      apiGet<Page<Invoice>>(
        withCompany(
          `/finance/purchase-invoices?page=${paging.page}&size=${paging.size}&sort=invoiceDate,desc`,
          companyId,
        ),
      ),
    placeholderData: keepPreviousData,
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/finance/purchase-invoices/${id}/cancel`, { date: today() }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance"] }),
  });
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name ?? "—";
  const columns: Column<Invoice>[] = [
    { header: t("finance.field.number"), render: (r) => r.number },
    ...(multiCompany
      ? [{ header: t("finance.field.company"), render: (r: Invoice) => companyName(r.companyId) }]
      : []),
    { header: t("finance.field.account"), render: (r) => accountName(r.accountId) },
    { header: t("finance.field.invoiceDate"), render: (r) => formatDate(r.invoiceDate) },
    { header: t("finance.field.dueDate"), render: (r) => formatDate(r.dueDate) },
    {
      header: t("finance.field.status"),
      render: (r) => t(`finance.invoiceStatus.${r.status}`),
    },
    {
      header: t("finance.field.total"),
      align: "right",
      render: (r) => formatMoney(r.total),
    },
    {
      header: t("common.actions"),
      align: "right",
      render: (r) =>
        canPost &&
        r.status === "OPEN" && (
          <Button
            size="small"
            color="error"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(r.id)}
          >
            {t("finance.action.cancelInvoice")}
          </Button>
        ),
    },
  ];

  return (
    <>
      <SectionHeader title={t("finance.tabs.invoices")}>
        {canPost && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("finance.action.newInvoice")}
          </Button>
        )}
      </SectionHeader>
      {cancel.isError && <ErrorState error={cancel.error} />}
      <QueryState isPending={list.isPending} error={list.error} />
      {list.data && (
        <DataTable
          rows={list.data.content}
          rowKey={(row) => row.id}
          columns={columns}
          pagination={{
            count: list.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("finance.action.newInvoice")}
          fields={[
            {
              name: "accountId",
              label: t("finance.field.account"),
              type: "select",
              required: true,
              options: (accounts.data ?? [])
                .filter((a) => a.type === "SUPPLIER" || a.type === "CARRIER")
                .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
            },
            {
              name: "branchId",
              label: t("finance.field.branch"),
              type: "select",
              required: true,
              options: optionsFor(),
            },
            { name: "number", label: t("finance.field.number"), required: true },
            {
              name: "invoiceDate",
              label: t("finance.field.invoiceDate"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "dueDate",
              label: t("finance.field.dueDate"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "net", label: t("finance.field.net"), type: "amount", required: true },
            { name: "vat", label: t("finance.field.vat"), type: "amount", required: true },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "TRY",
              options: (currencies.data ?? []).map((c) => ({ value: c.code, label: c.code })),
            },
            { name: "description", label: t("finance.field.description") },
            {
              name: "exchangeRate",
              label: t("finance.field.rate"),
              type: "amount",
              helperText: t("finance.field.rateHint"),
            },
          ]}
          onValuesChange={onValuesChange}
          notice={() =>
            gapRows.length > 0 ? (
              <Stack spacing={0.5}>
                {gapRows.map((gap) => (
                  <Alert
                    key={`${gap.side}-${gap.currency}-${gap.companyId ?? ""}`}
                    severity="warning"
                    variant="outlined"
                    role="note"
                    sx={{ py: 0, fontSize: 13 }}
                  >
                    {invoiceGapText(
                      gap,
                      (amount, currency) => `${formatAmount(amount)} ${currency}`,
                      translate,
                    )}{" "}
                    {t("finance.warning.invoiceEntryNote")}
                  </Alert>
                ))}
              </Stack>
            ) : null
          }
          onClose={() => {
            setAdding(false);
            setTarget(null);
          }}
          onSubmit={(values) =>
            apiRequest("POST", "/finance/purchase-invoices", {
              accountId: values.accountId,
              branchId: values.branchId,
              number: values.number,
              invoiceDate: values.invoiceDate,
              dueDate: values.dueDate,
              net: { amount: values.net, currency: values.currency },
              vat: { amount: values.vat, currency: values.currency },
              description: values.description || null,
              exchangeRate: values.exchangeRate || null,
            })
          }
          onSaved={() => {
            setAdding(false);
            setTarget(null);
            void client.invalidateQueries({ queryKey: ["finance"] });
          }}
        />
      )}
    </>
  );
}

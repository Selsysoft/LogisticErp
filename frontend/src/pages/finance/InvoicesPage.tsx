import { Button } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  today,
  useAccounts,
  useBranches,
  useCan,
  useCurrencies,
  usePaging,
} from "./common";
import { Invoice, Page } from "./types";

export function InvoicesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const accounts = useAccounts();
  const branches = useBranches();
  const currencies = useCurrencies();
  const paging = usePaging();
  const [adding, setAdding] = useState(false);

  const list = useQuery({
    queryKey: ["finance", "invoices", paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Invoice>>(
        `/finance/purchase-invoices?page=${paging.page}&size=${paging.size}&sort=invoiceDate,desc`,
      ),
    placeholderData: keepPreviousData,
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/finance/purchase-invoices/${id}/cancel`, { date: today() }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance"] }),
  });
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name ?? "—";

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
          columns={[
            { header: t("finance.field.number"), render: (r) => r.number },
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
          ]}
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
              options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
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
          onClose={() => setAdding(false)}
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
            void client.invalidateQueries({ queryKey: ["finance"] });
          }}
        />
      )}
    </>
  );
}

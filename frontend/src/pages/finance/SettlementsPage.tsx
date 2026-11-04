import { Button, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FieldDef,
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
  useFunds,
  usePaging,
} from "./common";
import { ExpenseItem, Instrument, Page, Settlement } from "./types";

type Kind = "payments" | "collections";

export function SettlementsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const [kind, setKind] = useState<Kind>("payments");
  const [adding, setAdding] = useState<{ method: string; key: string } | null>(null);
  const paging = usePaging();
  const accounts = useAccounts();

  const list = useQuery({
    queryKey: ["finance", kind, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Settlement>>(
        `/finance/${kind}?page=${paging.page}&size=${paging.size}&sort=settlementDate,desc`,
      ),
    placeholderData: keepPreviousData,
  });
  const reverse = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/finance/settlements/${id}/reverse`, { date: today() }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance"] }),
  });
  const accountName = (id: string | null) =>
    accounts.data?.find((account) => account.id === id)?.name ?? "—";

  return (
    <>
      <SectionHeader title={t("finance.tabs.settlements")}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={kind}
          onChange={(_, value: Kind | null) => {
            if (value) {
              setKind(value);
              paging.setPage(0);
            }
          }}
        >
          <ToggleButton value="payments">{t("finance.settlementType.PAYMENT")}</ToggleButton>
          <ToggleButton value="collections">{t("finance.settlementType.COLLECTION")}</ToggleButton>
        </ToggleButtonGroup>
        {canPost &&
          ["BANK", "CASH", "CHECK"].map((method) => (
            <Button
              key={method}
              variant="contained"
              onClick={() => setAdding({ method, key: crypto.randomUUID() })}
            >
              {kind === "payments"
                ? t("finance.action.newPayment")
                : t("finance.action.newCollection")}
              {" · "}
              {t(`finance.method.${method}`)}
            </Button>
          ))}
      </SectionHeader>
      {reverse.isError && <ErrorState error={reverse.error} />}
      <QueryState isPending={list.isPending} error={list.error} />
      {list.data && (
        <DataTable
          rows={list.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.date"), render: (r) => formatDate(r.settlementDate) },
            { header: t("finance.field.account"), render: (r) => accountName(r.accountId) },
            { header: t("finance.field.method"), render: (r) => t(`finance.method.${r.method}`) },
            { header: t("finance.field.description"), render: (r) => r.description },
            {
              header: t("finance.field.status"),
              render: (r) => t(`finance.settlementStatus.${r.status}`),
            },
            {
              header: t("finance.field.amount"),
              align: "right",
              render: (r) => formatMoney(r.money),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canPost &&
                r.status === "POSTED" &&
                r.method !== "CHECK" &&
                !r.planId && (
                  <Button
                    size="small"
                    color="error"
                    disabled={reverse.isPending}
                    onClick={() => reverse.mutate(r.id)}
                  >
                    {t("finance.action.reverse")}
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
        <SettlementDialog
          kind={kind}
          method={adding.method}
          idempotencyKey={adding.key}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            void client.invalidateQueries({ queryKey: ["finance"] });
          }}
        />
      )}
    </>
  );
}

function SettlementDialog({
  kind,
  method,
  idempotencyKey,
  onClose,
  onSaved,
}: {
  kind: Kind;
  method: string;
  idempotencyKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const branches = useBranches();
  const funds = useFunds();
  const currencies = useCurrencies();
  const isPayment = kind === "payments";
  const isCheck = method === "CHECK";

  const expenseItems = useQuery({
    queryKey: ["finance", "expense-items"],
    queryFn: () => apiGet<ExpenseItem[]>("/finance/expense-items"),
  });
  const portfolio = useQuery({
    queryKey: ["finance", "instruments", "portfolio"],
    queryFn: () => apiGet<Page<Instrument>>("/finance/instruments?status=PORTFOLIO&size=200"),
    enabled: isPayment && isCheck,
    select: (page) => page.content,
  });

  const fields: FieldDef[] = [
    {
      name: "accountId",
      label: t("finance.field.account"),
      type: "select",
      required: !isPayment || isCheck,
      options: (accounts.data ?? []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    },
    {
      name: "branchId",
      label: t("finance.field.branch"),
      type: "select",
      required: true,
      options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
    },
  ];
  if (!isCheck) {
    fields.push({
      name: "fundAccountId",
      label: t("finance.field.fund"),
      type: "select",
      required: true,
      options: (funds.data ?? [])
        .filter((fund) => fund.kind === method)
        .map((fund) => ({ value: fund.id, label: `${fund.name} (${fund.currency})` })),
    });
  }
  fields.push(
    { name: "amount", label: t("finance.field.amount"), type: "amount", required: true },
    {
      name: "currency",
      label: t("finance.field.currency"),
      type: "select",
      required: true,
      defaultValue: "TRY",
      options: (currencies.data ?? []).map((c) => ({ value: c.code, label: c.code })),
    },
    {
      name: "date",
      label: t("finance.field.date"),
      type: "date",
      required: true,
      defaultValue: today(),
    },
  );
  if (isCheck && isPayment) {
    fields.push({
      name: "instrumentId",
      label: t("finance.instrumentStatus.ENDORSED"),
      type: "select",
      options: (portfolio.data ?? []).map((item) => ({
        value: item.id,
        label: `${item.number} · ${formatMoney(item.money)}`,
      })),
    });
  }
  if (isCheck) {
    fields.push(
      {
        name: "instrumentKind",
        label: t("finance.field.kind"),
        type: "select",
        required: true,
        defaultValue: "CHECK",
        options: ["CHECK", "NOTE"].map((value) => ({
          value,
          label: t(`finance.instrumentKind.${value}`),
        })),
      },
      { name: "number", label: t("finance.field.number") },
      { name: "bankName", label: t("finance.field.bankName") },
      { name: "dueDate", label: t("finance.field.dueDate"), type: "date" },
    );
  }
  if (isPayment && !isCheck) {
    fields.push({
      name: "expenseItemId",
      label: t("finance.field.expenseItem"),
      type: "select",
      options: (expenseItems.data ?? []).map((item) => ({ value: item.id, label: item.name })),
    });
  }
  fields.push(
    { name: "description", label: t("finance.field.description") },
    {
      name: "exchangeRate",
      label: t("finance.field.rate"),
      type: "amount",
      helperText: t("finance.field.rateHint"),
    },
  );

  const ready = accounts.isSuccess && branches.isSuccess && funds.isSuccess && currencies.isSuccess;
  if (!ready) {
    return null;
  }

  return (
    <FormDialog
      title={`${isPayment ? t("finance.action.newPayment") : t("finance.action.newCollection")} · ${t(`finance.method.${method}`)}`}
      fields={fields}
      onClose={onClose}
      onSubmit={(values) => {
        const newInstrument =
          isCheck && !values.instrumentId
            ? {
                kind: values.instrumentKind,
                number: values.number,
                bankName: values.bankName || null,
                dueDate: values.dueDate || null,
              }
            : null;
        return apiRequest(
          "POST",
          `/finance/${kind}`,
          {
            method,
            accountId: values.accountId || null,
            branchId: values.branchId,
            fundAccountId: values.fundAccountId || null,
            expenseItemId: values.expenseItemId || null,
            instrumentId: values.instrumentId || null,
            instrument: newInstrument,
            money: { amount: values.amount, currency: values.currency },
            date: values.date,
            description: values.description || null,
            exchangeRate: values.exchangeRate || null,
          },
          { "Idempotency-Key": idempotencyKey },
        );
      }}
      onSaved={onSaved}
    />
  );
}

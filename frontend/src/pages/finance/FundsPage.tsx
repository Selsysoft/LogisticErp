import { Alert, Button, Link, Stack, TextField } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  useBranches,
  useCan,
  useCurrencies,
  useFunds,
  usePaging,
} from "./common";
import { Statement } from "./types";

type Dialog = "fund" | "transfer" | "manual" | null;

export function FundsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("FINANCE_MANAGE");
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const funds = useFunds();
  const branches = useBranches();
  const currencies = useCurrencies();
  const [dialog, setDialog] = useState<Dialog>(null);
  // Çift tıklama veya yeniden deneme ikinci transfer üretmesin diye pencere başına tek anahtar.
  const [transferKey, setTransferKey] = useState("");

  const close = () => setDialog(null);
  const saved = () => {
    close();
    void client.invalidateQueries({ queryKey: ["finance"] });
  };
  const fundOptions = (funds.data ?? []).map((fund) => ({
    value: fund.id,
    label: `${fund.name} (${fund.currency})`,
  }));

  return (
    <>
      <SectionHeader title={t("finance.tabs.funds")}>
        {canPost && (
          <>
            <Button
              variant="outlined"
              onClick={() => {
                setTransferKey(crypto.randomUUID());
                setDialog("transfer");
              }}
            >
              {t("finance.action.transfer")}
            </Button>
            <Button variant="outlined" onClick={() => setDialog("manual")}>
              {t("finance.action.manualTx")}
            </Button>
          </>
        )}
        {canManage && (
          <Button variant="contained" onClick={() => setDialog("fund")}>
            {t("finance.action.newFund")}
          </Button>
        )}
      </SectionHeader>
      {branches.isSuccess && branches.data.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("finance.noBranch")}
        </Alert>
      )}
      <QueryState isPending={funds.isPending} error={funds.error} />
      {funds.data && (
        <DataTable
          rows={funds.data}
          rowKey={(fund) => fund.id}
          columns={[
            { header: t("finance.field.code"), render: (fund) => fund.code },
            {
              header: t("finance.field.name"),
              render: (fund) => (
                <Link component={RouterLink} to={`/finance/funds/${fund.id}`}>
                  {fund.name}
                </Link>
              ),
            },
            { header: t("finance.field.kind"), render: (f) => t(`finance.fundKind.${f.kind}`) },
            { header: t("finance.field.bankName"), render: (fund) => fund.bankName },
            { header: t("finance.field.iban"), render: (fund) => fund.iban },
            {
              header: t("finance.field.balance"),
              align: "right",
              render: (fund) => `${formatAmount(fund.balance)} ${fund.currency}`,
            },
          ]}
        />
      )}
      {dialog === "fund" && (
        <FormDialog
          title={t("finance.action.newFund")}
          fields={[
            { name: "code", label: t("finance.field.code"), required: true },
            { name: "name", label: t("finance.field.name"), required: true },
            {
              name: "kind",
              label: t("finance.field.kind"),
              type: "select",
              required: true,
              defaultValue: "BANK",
              options: ["BANK", "CASH"].map((value) => ({
                value,
                label: t(`finance.fundKind.${value}`),
              })),
            },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "TRY",
              options: (currencies.data ?? []).map((c) => ({ value: c.code, label: c.code })),
            },
            {
              name: "branchId",
              label: t("finance.field.branch"),
              type: "select",
              required: true,
              options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            },
            { name: "bankName", label: t("finance.field.bankName") },
            { name: "iban", label: t("finance.field.iban") },
            {
              name: "allowNegative",
              label: t("finance.field.allowNegative"),
              type: "checkbox",
            },
          ]}
          onClose={close}
          onSubmit={(values, flags) =>
            apiRequest("POST", "/finance/funds", {
              ...values,
              bankName: values.bankName || null,
              iban: values.iban || null,
              allowNegative: flags.allowNegative,
            })
          }
          onSaved={saved}
        />
      )}
      {dialog === "transfer" && (
        <FormDialog
          title={t("finance.action.transfer")}
          fields={[
            {
              name: "fromFundId",
              label: t("finance.field.fromFund"),
              type: "select",
              required: true,
              options: fundOptions,
            },
            {
              name: "toFundId",
              label: t("finance.field.toFund"),
              type: "select",
              required: true,
              options: fundOptions,
            },
            { name: "amount", label: t("finance.field.amount"), type: "amount", required: true },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "description", label: t("finance.field.description") },
            {
              name: "exchangeRate",
              label: t("finance.field.rate"),
              type: "amount",
              helperText: t("finance.field.rateHint"),
            },
          ]}
          onClose={close}
          onSubmit={(values) => {
            const source = funds.data?.find((fund) => fund.id === values.fromFundId);
            return apiRequest(
              "POST",
              "/finance/funds/transfers",
              {
                fromFundId: values.fromFundId,
                toFundId: values.toFundId,
                money: { amount: values.amount, currency: source?.currency },
                date: values.date,
                description: values.description || null,
                exchangeRate: values.exchangeRate || null,
              },
              { "Idempotency-Key": transferKey },
            );
          }}
          onSaved={saved}
        />
      )}
      {dialog === "manual" && (
        <FormDialog
          title={t("finance.action.manualTx")}
          fields={[
            {
              name: "fundId",
              label: t("finance.field.fund"),
              type: "select",
              required: true,
              options: fundOptions,
            },
            {
              name: "direction",
              label: t("finance.field.direction"),
              type: "select",
              required: true,
              defaultValue: "IN",
              options: ["IN", "OUT"].map((value) => ({
                value,
                label: t(`finance.direction.${value}`),
              })),
            },
            { name: "amount", label: t("finance.field.amount"), type: "amount", required: true },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "description", label: t("finance.field.description") },
            {
              name: "exchangeRate",
              label: t("finance.field.rate"),
              type: "amount",
              helperText: t("finance.field.rateHint"),
            },
          ]}
          onClose={close}
          onSubmit={(values) => {
            const fund = funds.data?.find((item) => item.id === values.fundId);
            return apiRequest("POST", `/finance/funds/${values.fundId}/transactions`, {
              direction: values.direction,
              money: { amount: values.amount, currency: fund?.currency },
              date: values.date,
              description: values.description || null,
              exchangeRate: values.exchangeRate || null,
            });
          }}
          onSaved={saved}
        />
      )}
    </>
  );
}

export function FundDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const funds = useFunds();
  const fund = funds.data?.find((item) => item.id === id);
  const [from, setFrom] = useState(shiftDays(today(), -90));
  const [to, setTo] = useState(today());
  const paging = usePaging(50);

  const statement = useQuery({
    queryKey: ["finance", "fund-statement", id, from, to, paging.page, paging.size],
    queryFn: () =>
      apiGet<Statement>(
        `/finance/funds/${id}/statement?from=${from}&to=${to}&page=${paging.page}&size=${paging.size}`,
      ),
    enabled: !!from && !!to,
  });

  return (
    <>
      <SectionHeader
        title={fund ? `${fund.name} · ${formatAmount(fund.balance)} ${fund.currency}` : ""}
      >
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
      </SectionHeader>
      <QueryState isPending={statement.isPending} error={statement.error} />
      {statement.data && (
        <Stack spacing={1}>
          <Alert severity="info" icon={false}>
            {t("finance.openingBalance")}: {formatAmount(statement.data.openingBalance)}{" "}
            {statement.data.currency}
          </Alert>
          <DataTable
            rows={statement.data.lines}
            rowKey={(line) => line.id}
            columns={[
              { header: t("finance.field.date"), render: (line) => formatDate(line.date) },
              {
                header: t("finance.field.source"),
                render: (line) => t(`finance.source.${line.sourceType}`),
              },
              { header: t("finance.field.description"), render: (line) => line.description },
              {
                header: t("finance.direction.IN"),
                align: "right",
                render: (line) => (line.direction === "IN" ? formatAmount(line.amount) : ""),
              },
              {
                header: t("finance.direction.OUT"),
                align: "right",
                render: (line) => (line.direction === "OUT" ? formatAmount(line.amount) : ""),
              },
              {
                header: t("finance.field.balance"),
                align: "right",
                render: (line) => formatAmount(line.balance),
              },
            ]}
            pagination={{
              count: statement.data.totalElements,
              page: paging.page,
              size: paging.size,
              onPage: paging.setPage,
              onSize: paging.setSize,
            }}
          />
        </Stack>
      )}
    </>
  );
}

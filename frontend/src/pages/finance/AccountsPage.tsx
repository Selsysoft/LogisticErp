import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
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
  usePaging,
} from "./common";
import { OpeningBalanceDialog } from "./OpeningBalanceDialog";
import { Account, Page, Statement, StatementLine } from "./types";

const ACCOUNT_TYPES = ["CUSTOMER", "CARRIER", "SUPPLIER", "EMPLOYEE", "BANK"];
const REVERSIBLE = ["MANUAL", "OPENING"];

export function AccountsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("FINANCE_MANAGE");
  const paging = usePaging();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const accounts = useQuery({
    queryKey: ["finance", "accounts", search, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Account>>(
        `/finance/accounts?page=${paging.page}&size=${paging.size}&sort=name&search=${encodeURIComponent(search)}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <SectionHeader title={t("finance.tabs.accounts")}>
        <TextField
          size="small"
          label={t("finance.field.search")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            paging.setPage(0);
          }}
        />
        {canManage && (
          <Button variant="outlined" onClick={() => setImporting(true)}>
            {t("finance.opening.open")}
          </Button>
        )}
        {canManage && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("finance.action.newAccount")}
          </Button>
        )}
      </SectionHeader>
      {importing && (
        <OpeningBalanceDialog
          onClose={() => setImporting(false)}
          onImported={() => void client.invalidateQueries({ queryKey: ["finance"] })}
        />
      )}
      <QueryState isPending={accounts.isPending} error={accounts.error} />
      {accounts.data && (
        <DataTable
          rows={accounts.data.content}
          rowKey={(account) => account.id}
          columns={[
            { header: t("finance.field.code"), render: (account) => account.code },
            {
              header: t("finance.field.name"),
              render: (account) => (
                <Link component={RouterLink} to={`/finance/accounts/${account.id}`}>
                  {account.name}
                </Link>
              ),
            },
            {
              header: t("finance.field.type"),
              render: (account) => t(`finance.accountType.${account.type}`),
            },
            {
              header: t("finance.field.balance"),
              align: "right",
              render: (account) =>
                account.balances.map((balance) => (
                  <div key={balance.currency}>
                    {formatAmount(balance.balance)} {balance.currency}
                  </div>
                )),
            },
          ]}
          pagination={{
            count: accounts.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("finance.action.newAccount")}
          fields={[
            { name: "code", label: t("finance.field.code"), required: true },
            { name: "name", label: t("finance.field.name"), required: true },
            {
              name: "type",
              label: t("finance.field.type"),
              type: "select",
              required: true,
              defaultValue: "CUSTOMER",
              options: ACCOUNT_TYPES.map((value) => ({
                value,
                label: t(`finance.accountType.${value}`),
              })),
            },
            { name: "taxNumber", label: t("finance.field.taxNumber") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/finance/accounts", {
              ...values,
              taxNumber: values.taxNumber || null,
            })
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["finance", "accounts"] });
          }}
        />
      )}
    </>
  );
}

export function AccountDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const client = useQueryClient();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const branches = useBranches();
  const currencies = useCurrencies();
  const [currency, setCurrency] = useState("TRY");
  const [from, setFrom] = useState(shiftDays(today(), -90));
  const [to, setTo] = useState(today());
  const [adding, setAdding] = useState(false);
  const [reversing, setReversing] = useState<StatementLine | null>(null);
  const paging = usePaging(50);

  const account = useQuery({
    queryKey: ["finance", "accounts", "detail", id],
    queryFn: () => apiGet<Account>(`/finance/accounts/${id}`),
  });
  const statement = useQuery({
    queryKey: ["finance", "statement", id, currency, from, to, paging.page, paging.size],
    queryFn: () =>
      apiGet<Statement>(
        `/finance/accounts/${id}/statement?currency=${currency}&from=${from}&to=${to}&page=${paging.page}&size=${paging.size}`,
      ),
    enabled: !!from && !!to,
  });

  return (
    <>
      <QueryState isPending={account.isPending} error={account.error} />
      {account.data && (
        <>
          <SectionHeader title={`${account.data.code} · ${account.data.name}`}>
            {canPost && (
              <Button variant="contained" onClick={() => setAdding(true)}>
                {t("finance.action.manualTx")}
              </Button>
            )}
          </SectionHeader>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              mb: 3,
              gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(220px, 1fr))" },
            }}
          >
            {account.data.balances.map((balance) => (
              <Card key={balance.currency} variant="outlined">
                <CardContent>
                  <Typography variant="h6">
                    {formatAmount(balance.balance)} {balance.currency}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("finance.field.tlBalance")}: {formatAmount(balance.tlBalance)} TRY
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </>
      )}
      <SectionHeader title={t("finance.action.statement")}>
        <TextField
          select
          size="small"
          label={t("finance.field.currency")}
          value={currency}
          onChange={(event) => {
            setCurrency(event.target.value);
            paging.setPage(0);
          }}
          sx={{ minWidth: 110 }}
        >
          {(currencies.data ?? [{ code: "TRY", name: "" }]).map((item) => (
            <MenuItem key={item.code} value={item.code}>
              {item.code}
            </MenuItem>
          ))}
        </TextField>
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
                header: t("finance.field.debit"),
                align: "right",
                render: (line) => (line.direction === "DEBIT" ? formatAmount(line.amount) : ""),
              },
              {
                header: t("finance.field.credit"),
                align: "right",
                render: (line) => (line.direction === "CREDIT" ? formatAmount(line.amount) : ""),
              },
              {
                header: t("finance.field.balance"),
                align: "right",
                render: (line) => formatAmount(line.balance),
              },
              {
                header: t("common.actions"),
                align: "right",
                // Belgeye bağlı hareket belgesinden iptal edilir; elle ve açılış hareketi buradan.
                render: (line) =>
                  canPost &&
                  REVERSIBLE.includes(line.sourceType) && (
                    <Button size="small" color="error" onClick={() => setReversing(line)}>
                      {t("finance.action.reverse")}
                    </Button>
                  ),
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
      {reversing && (
        <FormDialog
          title={`${t("finance.action.reverse")} · ${formatAmount(reversing.amount)} ${currency}`}
          fields={[
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "description", label: t("finance.field.description") },
          ]}
          submitLabel={t("finance.action.reverse")}
          onClose={() => setReversing(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/finance/accounts/transactions/${reversing.id}/reverse`, {
              date: values.date,
              description: values.description || null,
            })
          }
          onSaved={() => {
            setReversing(null);
            void client.invalidateQueries({ queryKey: ["finance"] });
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("finance.action.manualTx")}
          fields={[
            {
              name: "branchId",
              label: t("finance.field.branch"),
              type: "select",
              required: true,
              options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            },
            {
              name: "direction",
              label: t("finance.field.direction"),
              type: "select",
              required: true,
              defaultValue: "DEBIT",
              options: ["DEBIT", "CREDIT"].map((value) => ({
                value,
                label: t(`finance.direction.${value}`),
              })),
            },
            {
              name: "amount",
              label: t("finance.field.amount"),
              type: "amount",
              required: true,
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
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/finance/accounts/${id}/transactions`, {
              branchId: values.branchId,
              direction: values.direction,
              money: { amount: values.amount, currency: values.currency },
              date: values.date,
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

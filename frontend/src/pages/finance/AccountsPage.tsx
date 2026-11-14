import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ErrorOutline from "@mui/icons-material/ErrorOutline";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { cancelDocument, useAccountBalances } from "./accountApi";
import { useAuthStore } from "../../auth/authStore";
import { useActiveCompanyId } from "../../auth/companyStore";
import { defaultBranchValue } from "./branchOptions";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  useBranchOptions,
  useCan,
  useCompanyName,
  useCurrencies,
  useMultiCompany,
  usePaging,
} from "./common";
import { useInvoiceGaps } from "./fundApi";
import { displayGaps, missingByAccount } from "./settlementWarnings";
import { OpeningBalanceDialog } from "./OpeningBalanceDialog";
import { withCompany } from "./companyQuery";
import { OpeningInvoiceDialog } from "./OpeningInvoiceDialog";
import { Account, CurrencyAmount, Page, Statement, StatementLine } from "./types";

const ACCOUNT_TYPES = ["CUSTOMER", "CARRIER", "SUPPLIER", "EMPLOYEE", "BANK"];
const REVERSIBLE = ["MANUAL", "OPENING", "OPENING_INVOICE"];

/**
 * Yeni cari kartı tür seçenekleri (12.1 §5.13): personel carisi yalnız FINANCE_EMPLOYEE_VIEW ile
 * (yoksa sunucu 403 ACCOUNT_EMPLOYEE_FORBIDDEN döner).
 */
export function accountTypeOptions(canSeeEmployees: boolean): string[] {
  return ACCOUNT_TYPES.filter((type) => canSeeEmployees || type !== "EMPLOYEE");
}

/** Borç/Alacak belgesinin satırı ekstreden iptal edilebilir mi (iptal ters kayıt üretir). */
export function isCancellableDocumentLine(line: StatementLine): boolean {
  return line.sourceType === "ACCOUNT_DOCUMENT" && line.reversed !== true && line.reversal !== true;
}

/** "50,00 TRY, 10,00 USD" (eksik fatura ipucu). */
export function missingText(amounts: readonly CurrencyAmount[]): string {
  return amounts.map((item) => `${formatAmount(item.amount)} ${item.currency}`).join(", ");
}

export function AccountsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("FINANCE_MANAGE");
  const canSeeEmployees = useCan("FINANCE_EMPLOYEE_VIEW");
  const paging = usePaging();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingInvoices, setImportingInvoices] = useState(false);
  // Kart listesi ortaktır; bakiyeler aktif şirketin hareketlerinden (konsolidede tümü).
  const companyId = useActiveCompanyId();

  const accounts = useQuery({
    queryKey: ["finance", "accounts", search, paging.page, paging.size, companyId],
    queryFn: () =>
      apiGet<Page<Account>>(
        withCompany(
          `/finance/accounts?page=${paging.page}&size=${paging.size}&sort=name&search=${encodeURIComponent(search)}`,
          companyId,
        ),
      ),
    placeholderData: keepPreviousData,
  });
  // Eksik faturalı cariler (K-12.2-4 "cari listesi"): aktif şirket için tek istek.
  const gaps = useInvoiceGaps({});
  const missing = missingByAccount(gaps.data ?? []);

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
          <Button variant="outlined" onClick={() => setImportingInvoices(true)}>
            {t("finance.openingInvoice.open")}
          </Button>
        )}
        {canManage && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("finance.action.newAccount")}
          </Button>
        )}
      </SectionHeader>
      {importingInvoices && (
        <OpeningInvoiceDialog
          onClose={() => setImportingInvoices(false)}
          onImported={() => void client.invalidateQueries({ queryKey: ["finance"] })}
        />
      )}
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
                <>
                  <Link component={RouterLink} to={`/finance/accounts/${account.id}`}>
                    {account.name}
                  </Link>
                  {account.active === false && (
                    <Chip
                      size="small"
                      label={t("finance.definitions.passive")}
                      sx={{ ml: 1 }}
                      variant="outlined"
                    />
                  )}
                </>
              ),
            },
            {
              header: t("finance.field.type"),
              render: (account) => t(`finance.accountType.${account.type}`),
            },
            {
              header: t("finance.field.balance"),
              align: "right",
              render: (account) => {
                const amounts = missing.get(account.id);
                const label = amounts
                  ? t("finance.warning.missingChip", { amount: missingText(amounts) })
                  : "";
                return (
                  <>
                    {account.balances.map((balance) => (
                      <div key={balance.currency}>
                        {formatAmount(balance.balance)} {balance.currency}
                      </div>
                    ))}
                    {amounts && (
                      <Tooltip title={label}>
                        <Box
                          component="span"
                          tabIndex={0}
                          role="img"
                          aria-label={label}
                          sx={{ display: "inline-flex", color: "error.main", ml: 0.5 }}
                        >
                          <ErrorOutline fontSize="small" />
                        </Box>
                      </Tooltip>
                    )}
                  </>
                );
              },
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
            {
              name: "code",
              label: t("finance.field.code"),
              helperText: t("finance.definitions.codeOptional"),
            },
            { name: "name", label: t("finance.field.name"), required: true },
            {
              name: "type",
              label: t("finance.field.type"),
              type: "select",
              required: true,
              defaultValue: "CUSTOMER",
              options: accountTypeOptions(canSeeEmployees).map((value) => ({
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
              // Boş kod sunucuda gruba göre üretilir (12.1 §4.1).
              code: values.code.trim() || undefined,
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
  const { optionsFor, companyId } = useBranchOptions();
  const multiCompany = useMultiCompany();
  const companyName = useCompanyName();
  const defaultBranchId = useAuthStore((state) => state.me?.defaultBranchId);
  const currencies = useCurrencies();
  const [currency, setCurrency] = useState("TRY");
  const [from, setFrom] = useState(shiftDays(today(), -90));
  const [to, setTo] = useState(today());
  const [adding, setAdding] = useState(false);
  const [reversing, setReversing] = useState<StatementLine | null>(null);
  const [cancelling, setCancelling] = useState<StatementLine | null>(null);
  const paging = usePaging(50);

  const account = useQuery({
    queryKey: ["finance", "accounts", "detail", id, companyId],
    queryFn: () => apiGet<Account>(withCompany(`/finance/accounts/${id}`, companyId)),
  });
  // Eksik fatura çipleri (K-12.2-4 "cari kartı"): şirket başına (`/balances` invoiceGaps).
  const balances = useAccountBalances(id, { groupBy: "CURRENCY" });
  const gapChips = displayGaps(balances.data?.invoiceGaps, companyId, multiCompany);
  const statement = useQuery({
    queryKey: ["finance", "statement", id, currency, from, to, paging.page, paging.size, companyId],
    queryFn: () =>
      apiGet<Statement>(
        withCompany(
          `/finance/accounts/${id}/statement?currency=${currency}&from=${from}&to=${to}&page=${paging.page}&size=${paging.size}`,
          companyId,
        ),
      ),
    enabled: !!from && !!to,
  });

  return (
    <>
      <QueryState isPending={account.isPending} error={account.error} />
      {account.data && (
        <>
          <SectionHeader title={`${account.data.code} · ${account.data.name}`}>
            {account.data.taxNumber && (
              // TCKN izinsiz kullanıcıya maskeli gelir (taxNumberMasked); olduğu gibi gösterilir.
              <Typography variant="body2" color="text.secondary">
                {t("finance.field.taxNumber")}: {account.data.taxNumber}
              </Typography>
            )}
            {account.data.active === false && (
              <Chip size="small" label={t("finance.definitions.passive")} variant="outlined" />
            )}
            {gapChips.map((gap) => (
              <Chip
                key={`${gap.companyId ?? "all"}-${gap.side}-${gap.currency}`}
                size="small"
                color="error"
                label={
                  (gap.companyId && multiCompany ? `${companyName(gap.companyId)}: ` : "") +
                  t("finance.warning.missingChip", {
                    amount: `${formatAmount(gap.missing)} ${gap.currency}`,
                  })
                }
              />
            ))}
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
                  (REVERSIBLE.includes(line.sourceType) ? (
                    <Button size="small" color="error" onClick={() => setReversing(line)}>
                      {t("finance.action.reverse")}
                    </Button>
                  ) : isCancellableDocumentLine(line) ? (
                    // Borç/Alacak belgesi belgeden iptal edilir (12.1 §4.3; ters kayıt belge servisinde).
                    <Button size="small" color="error" onClick={() => setCancelling(line)}>
                      {t("finance.action.cancel")}
                    </Button>
                  ) : null),
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
      {cancelling && (
        <FormDialog
          title={`${t("finance.action.cancel")} · ${formatAmount(cancelling.amount)} ${currency}`}
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
          submitLabel={t("finance.action.cancel")}
          onClose={() => setCancelling(null)}
          onSubmit={(values) =>
            cancelDocument(cancelling.sourceId, {
              date: values.date,
              reason: values.description || undefined,
            })
          }
          onSaved={() => {
            setCancelling(null);
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
              options: optionsFor(),
              defaultValue: defaultBranchValue(optionsFor(), defaultBranchId),
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

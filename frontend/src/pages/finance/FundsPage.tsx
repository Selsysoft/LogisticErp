import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { transferCenterPath } from "../../zto/finans/navItems";
import {
  type Column,
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  localizeFinanceError,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  useBranchOptions,
  useCan,
  useCompanyName,
  useCurrencies,
  useFunds,
  useMultiCompany,
  usePaging,
} from "./common";
import { useFund, useSetFundActive } from "./fundApi";
import { Fund, FundKind, Statement } from "./types";

type Dialog = "fund" | "transfer" | "manual" | null;
type KindFilter = "ALL" | FundKind;

/** Transfer hedefleri: kaynak fon hariç, kaynak seçiliyse yalnız onun şirketinin fonları. */
export function transferTargets(funds: Fund[] | undefined, fromFundId: string) {
  const from = funds?.find((fund) => fund.id === fromFundId);
  return (funds ?? [])
    .filter(
      (fund) =>
        fund.id !== from?.id &&
        fund.active !== false &&
        (!from || fund.companyId === from.companyId),
    )
    .map((fund) => ({ value: fund.id, label: `${fund.name} (${fund.currency})` }));
}

/** Fon listesi satırı ya da şirket × para birimi toplam satırı (≥ 2 şirkette). */
export type FundListRow =
  | { type: "fund"; key: string; fund: Fund }
  | { type: "total"; key: string; companyId: string; currency: string; balance: number };

/**
 * Banka/Kasa süzgeci ve ≥ 2 şirkette şirket grupları (12.2 §5.13): fonlar şirkete göre kararlı
 * sırada, her şirket grubunun sonunda para birimi başına bakiye toplamı.
 */
export function fundListRows(
  funds: readonly Fund[],
  kind: KindFilter,
  groupByCompany: boolean,
): FundListRow[] {
  const visible = funds.filter((fund) => kind === "ALL" || fund.kind === kind);
  if (!groupByCompany) {
    return visible.map((fund) => ({ type: "fund", key: fund.id, fund }));
  }
  const order: string[] = [];
  const groups = new Map<string, Fund[]>();
  for (const fund of visible) {
    const list = groups.get(fund.companyId);
    if (list) {
      list.push(fund);
    } else {
      order.push(fund.companyId);
      groups.set(fund.companyId, [fund]);
    }
  }
  const rows: FundListRow[] = [];
  for (const companyId of order) {
    const list = groups.get(companyId) ?? [];
    const totals = new Map<string, number>();
    for (const fund of list) {
      rows.push({ type: "fund", key: fund.id, fund });
      totals.set(
        fund.currency,
        Math.round(((totals.get(fund.currency) ?? 0) + Number(fund.balance)) * 100) / 100,
      );
    }
    for (const [currency, balance] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
      rows.push({
        type: "total",
        key: `total-${companyId}-${currency}`,
        companyId,
        currency,
        balance,
      });
    }
  }
  return rows;
}

export function FundsPage() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("FINANCE_MANAGE");
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const multiCompany = useMultiCompany();
  const companyName = useCompanyName();
  const { branches, optionsFor, companyId } = useBranchOptions();
  // Liste aktif şirketin fonları (konsolidede tümü); transfer seçenekleri de aynı listeden.
  const funds = useFunds(companyId);
  const currencies = useCurrencies();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [kind, setKind] = useState<KindFilter>("ALL");
  // Çift tıklama veya yeniden deneme ikinci transfer üretmesin diye pencere başına tek anahtar.
  const [transferKey, setTransferKey] = useState("");
  const setActive = useSetFundActive();

  const close = () => setDialog(null);
  const saved = () => {
    close();
    void client.invalidateQueries({ queryKey: ["finance"] });
  };
  // Pasif fonla yeni hareket yapılamaz (422 FUND_INACTIVE); seçeneklerde yalnız aktifler.
  const fundOptions = (funds.data ?? [])
    .filter((fund) => fund.active !== false)
    .map((fund) => ({
      value: fund.id,
      label: `${fund.name} (${fund.currency})`,
    }));
  const translateKnown = (key: string) => (i18n.exists(key) ? t(key) : null);

  const fundColumn = (
    header: string,
    render: (fund: Fund) => ReactNode,
    align?: "right",
  ): Column<FundListRow> => ({
    header,
    align,
    render: (row) => (row.type === "fund" ? render(row.fund) : null),
  });
  const columns: Column<FundListRow>[] = [
    ...(multiCompany
      ? [
          {
            header: t("finance.field.company"),
            render: (row: FundListRow) =>
              row.type === "fund" ? (
                companyName(row.fund.companyId)
              ) : (
                <strong>
                  {t("finance.fund.companyTotal", { company: companyName(row.companyId) })}
                </strong>
              ),
          },
        ]
      : []),
    fundColumn(t("finance.field.code"), (fund) => fund.code),
    fundColumn(t("finance.field.name"), (fund) => (
      <>
        <Link component={RouterLink} to={`/finance/funds/${fund.id}`}>
          {fund.name}
        </Link>
        {fund.active === false && (
          <Chip
            size="small"
            variant="outlined"
            label={t("finance.definitions.passive")}
            sx={{ ml: 1 }}
          />
        )}
      </>
    )),
    fundColumn(t("finance.field.kind"), (fund) => t(`finance.fundKind.${fund.kind}`)),
    fundColumn(t("finance.field.bankName"), (fund) => fund.bankName),
    fundColumn(t("finance.field.iban"), (fund) => fund.iban),
    {
      header: t("finance.field.balance"),
      align: "right",
      render: (row) =>
        row.type === "fund" ? (
          `${formatAmount(row.fund.balance)} ${row.fund.currency}`
        ) : (
          <strong>{`${formatAmount(row.balance)} ${row.currency}`}</strong>
        ),
    },
    ...(canManage
      ? [
          {
            header: t("common.actions"),
            align: "right" as const,
            render: (row: FundListRow) =>
              row.type === "fund" && (
                <Button
                  size="small"
                  color={row.fund.active === false ? "primary" : "warning"}
                  disabled={setActive.isPending}
                  onClick={() =>
                    setActive.mutate({ id: row.fund.id, active: row.fund.active === false })
                  }
                >
                  {row.fund.active === false
                    ? t("finance.action.activate")
                    : t("finance.action.deactivate")}
                </Button>
              ),
          },
        ]
      : []),
  ];

  return (
    <>
      <SectionHeader title={t("finance.tabs.funds")}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={kind}
          aria-label={t("finance.field.kind")}
          onChange={(_, value: KindFilter | null) => value && setKind(value)}
        >
          <ToggleButton value="ALL">{t("finance.fund.all")}</ToggleButton>
          <ToggleButton value="BANK">{t("finance.fundKind.BANK")}</ToggleButton>
          <ToggleButton value="CASH">{t("finance.fundKind.CASH")}</ToggleButton>
        </ToggleButtonGroup>
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
      {setActive.isError && (
        <ErrorState error={localizeFinanceError(setActive.error, translateKnown)} />
      )}
      <QueryState isPending={funds.isPending} error={funds.error} />
      {funds.data && (
        <DataTable
          rows={fundListRows(funds.data, kind, multiCompany)}
          rowKey={(row) => row.key}
          columns={columns}
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
              options: optionsFor(),
            },
            { name: "bankName", label: t("finance.field.bankName") },
            { name: "bankBranchName", label: t("finance.field.bankBranchName") },
            { name: "accountNo", label: t("finance.field.accountNo") },
            { name: "iban", label: t("finance.field.iban") },
            { name: "description", label: t("finance.field.description") },
            {
              name: "openingBalance",
              label: t("finance.field.openingBalance"),
              type: "signedAmount",
              helperText: t("finance.field.openingBalanceHint"),
            },
            {
              name: "openingDate",
              label: t("finance.field.openingDate"),
              type: "date",
              defaultValue: today(),
            },
            {
              name: "allowNegative",
              label: t("finance.field.allowNegative"),
              type: "checkbox",
            },
            {
              name: "active",
              label: t("finance.field.active"),
              type: "checkbox",
              defaultValue: true,
            },
          ]}
          onClose={close}
          onSubmit={(values, flags) =>
            apiRequest("POST", "/finance/funds", {
              code: values.code,
              name: values.name,
              kind: values.kind,
              currency: values.currency,
              branchId: values.branchId,
              bankName: values.bankName || null,
              bankBranchName: values.bankBranchName || null,
              accountNo: values.accountNo || null,
              iban: values.iban || null,
              description: values.description || null,
              // MUI yalnız vadesiz hesap açar; kredi/mevduat ilgili adımlarda (12.5/12.6).
              accountType: "DEMAND",
              openingBalance: values.openingBalance ? Number(values.openingBalance) : null,
              openingDate: values.openingBalance && values.openingDate ? values.openingDate : null,
              allowNegative: flags.allowNegative,
              active: flags.active,
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
              // Şirketler arası transfer yok (aksi 422): hedef, kaynak fonun şirketinin diğer fonları.
              // Kaynak değişince seçeneklerden düşen hedef FormDialog'da temizlenir.
              optionsFrom: (values) => transferTargets(funds.data, String(values.fromFundId ?? "")),
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
          notice={() => (
            <Alert severity="info" variant="outlined" role="note" sx={{ py: 0, fontSize: 13 }}>
              {t("finance.fund.intercompanyHint")}{" "}
              <Link component={RouterLink} to={transferCenterPath()}>
                {t("finance.fund.transferCenter")}
              </Link>
            </Alert>
          )}
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
            {
              name: "category",
              label: t("finance.field.category"),
              type: "select",
              options: ["EXPENSE", "INCOME", "OTHER"].map((value) => ({
                value,
                label: t(`finance.category.${value}`),
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
              ...(values.category ? { category: values.category } : {}),
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
  const multiCompany = useMultiCompany();
  const companyName = useCompanyName();
  // Fon adı tekil detaydan (şirket süzgecinden bağımsız; 12.2 §5.13).
  const fund = useFund(id).data;
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
        {fund && multiCompany && (
          <Chip size="small" variant="outlined" label={companyName(fund.companyId)} />
        )}
        {fund?.active === false && (
          <Chip size="small" variant="outlined" label={t("finance.definitions.passive")} />
        )}
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
      {fund && (fund.accountNo || fund.bankBranchName || fund.description) && (
        <Box sx={{ mb: 2, color: "text.secondary", fontSize: 14 }}>
          {[
            fund.bankBranchName && `${t("finance.field.bankBranchName")}: ${fund.bankBranchName}`,
            fund.accountNo && `${t("finance.field.accountNo")}: ${fund.accountNo}`,
            fund.description,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Box>
      )}
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

import { Alert, Button, Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FieldDef,
  FormDialog,
  formatAmount,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  SubmitCancelled,
  today,
  useAccounts,
  useBranchOptions,
  useCan,
  useCompanyName,
  useConfirm,
  useCurrencies,
  useFunds,
  useMultiCompany,
  usePaging,
  type Column,
} from "./common";
import { companyOfBranch, defaultBranchValue, fundsOfCompany } from "./branchOptions";
import { withCompany } from "./companyQuery";
import { useSettlementCheck } from "./fundApi";
import {
  allocationWarningText,
  checkKey,
  invoiceGapText,
  isConfirmationRequired,
  isMissing,
  parseConfirmationDetails,
  parseNewSettlement,
  settlementCheckBody,
  type SettlementCheckBody,
  type MoneyFormat,
  type Translate,
} from "./settlementWarnings";
import {
  ExpenseItem,
  Instrument,
  Page,
  Settlement,
  SettlementBody,
  SettlementCheck,
} from "./types";

type Kind = "payments" | "collections";
type Adding = { method: string; key: string; fundAccountId?: string };

const money: MoneyFormat = (amount, currency) => `${formatAmount(amount)} ${currency}`;

export function SettlementsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const [params, setParams] = useSearchParams();
  // ZTO Banka/Kasa Hareketleri "Yeni Ödeme/Tahsilat" (OK-12.2-22): `?new=…&method=…&fundAccountId=…`
  // ile pencere fon ön seçili açılır. İlk çizimde okunur; kapanınca parametreler silinir.
  const [initial] = useState(() => parseNewSettlement(params));
  const [kind, setKind] = useState<Kind>(
    initial?.type === "COLLECTION" ? "collections" : "payments",
  );
  const [adding, setAdding] = useState<Adding | null>(() =>
    initial && canPost
      ? { method: initial.method, key: crypto.randomUUID(), fundAccountId: initial.fundAccountId }
      : null,
  );
  const paging = usePaging();
  const accounts = useAccounts();
  const companyId = useActiveCompanyId();
  const multiCompany = useMultiCompany();
  const companyName = useCompanyName();

  const list = useQuery({
    queryKey: ["finance", kind, paging.page, paging.size, companyId],
    queryFn: () =>
      apiGet<Page<Settlement>>(
        withCompany(
          `/finance/${kind}?page=${paging.page}&size=${paging.size}&sort=settlementDate,desc`,
          companyId,
        ),
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

  const closeDialog = () => {
    setAdding(null);
    if (params.has("new")) {
      const next = new URLSearchParams(params);
      ["new", "method", "fundAccountId"].forEach((key) => next.delete(key));
      setParams(next, { replace: true });
    }
  };

  const columns: Column<Settlement>[] = [
    { header: t("finance.field.date"), render: (r) => formatDate(r.settlementDate) },
    ...(multiCompany
      ? [
          {
            header: t("finance.field.company"),
            render: (r: Settlement) => companyName(r.companyId),
          },
        ]
      : []),
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
  ];

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
        <SettlementDialog
          kind={kind}
          method={adding.method}
          idempotencyKey={adding.key}
          fundAccountId={adding.fundAccountId}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            void client.invalidateQueries({ queryKey: ["finance"] });
          }}
        />
      )}
    </>
  );
}

/**
 * Şirket dağılımı ve eksik fatura notu (§5.13): küçük kırmızı satır CONFIRM uyarısı, sarı satırlar
 * tahsilat bilgisi (INFO) ve eksik fatura. Canlı bölge `FormDialog`'un her zaman çizilen not
 * sarmalayıcısıdır (`role="status"`); metin orada değişince duyurulur (F-12.2-R7).
 */
function SettlementNotice({ check }: { check: SettlementCheck | undefined }) {
  const { t } = useTranslation();
  const companyName = useCompanyName();
  const translate: Translate = (key, values) => t(key, values);
  const warnings = check?.warnings ?? [];
  const gaps = (check?.invoiceGaps ?? []).filter(isMissing);
  if (warnings.length === 0 && gaps.length === 0) {
    return null;
  }
  return (
    <Stack spacing={0.5}>
      {warnings.map((warning) => (
        <Alert
          key={`${warning.code}-${warning.currency}-${warning.companyId}`}
          severity={warning.severity === "CONFIRM" ? "error" : "warning"}
          variant="outlined"
          role="note"
          sx={{ py: 0, fontSize: 13 }}
        >
          {allocationWarningText(warning, companyName, money, translate)}
        </Alert>
      ))}
      {gaps.map((gap) => (
        <Alert
          key={`gap-${gap.side}-${gap.currency}-${gap.companyId ?? ""}`}
          severity="warning"
          variant="outlined"
          role="note"
          sx={{ py: 0, fontSize: 13 }}
        >
          {invoiceGapText(gap, money, translate)}
        </Alert>
      ))}
    </Stack>
  );
}

function SettlementDialog({
  kind,
  method,
  idempotencyKey,
  fundAccountId,
  onClose,
  onSaved,
}: {
  kind: Kind;
  method: string;
  idempotencyKey: string;
  fundAccountId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const { branches, optionsFor } = useBranchOptions();
  const funds = useFunds();
  const currencies = useCurrencies();
  const companyName = useCompanyName();
  const isPayment = kind === "payments";
  const isCheck = method === "CHECK";
  const type = isPayment ? "PAYMENT" : "COLLECTION";
  const confirm = useConfirm({
    title: t("finance.warning.confirmTitle"),
    confirm: t("finance.warning.confirmOk"),
    cancel: t("finance.warning.confirmCancel"),
  });

  // Uyarı önizlemesi: gövde yalnız ilgili alanlardan kurulan anahtar değişince güncellenir (§5.13).
  const [checkBody, setCheckBody] = useState<SettlementCheckBody | null>(null);
  const lastKey = useRef<string | null>(null);
  const onValuesChange = useCallback(
    (values: Record<string, string | boolean>) => {
      const key = checkKey({ ...values, method });
      if (key === lastKey.current) {
        return;
      }
      lastKey.current = key;
      setCheckBody(settlementCheckBody(values, method as SettlementBody["method"], today()));
    },
    [method],
  );
  const check = useSettlementCheck(type, checkBody);

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

  const preset = useMemo(
    () => funds.data?.find((fund) => fund.id === fundAccountId),
    [funds.data, fundAccountId],
  );
  const branchChoices = optionsFor();
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
      options: branchChoices,
      // Fon ön seçiliyse fonun iş yeri (seçeneklerde yoksa boş).
      defaultValue: preset ? defaultBranchValue(branchChoices, preset.branchId) : "",
    },
  ];
  if (!isCheck) {
    fields.push({
      name: "fundAccountId",
      label: t("finance.field.fund"),
      type: "select",
      required: true,
      defaultValue: preset && preset.kind === method && preset.active !== false ? preset.id : "",
      // Yalnız seçili iş yerinin şirketinin aktif fonları (başka şirketin fonu 422 COMPANY_MISMATCH,
      // pasif fon 422 FUND_INACTIVE).
      optionsFrom: (values) =>
        fundsOfCompany(funds.data, companyOfBranch(branches.data, String(values.branchId ?? "")))
          .filter((fund) => fund.kind === method && fund.active !== false)
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
      defaultValue: preset?.currency ?? "TRY",
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

  const translate: Translate = (key, values) => t(key, values);
  const post = (body: Record<string, unknown>) =>
    apiRequest("POST", `/finance/${kind}`, body, { "Idempotency-Key": idempotencyKey });

  return (
    <>
      <FormDialog
        title={`${isPayment ? t("finance.action.newPayment") : t("finance.action.newCollection")} · ${t(`finance.method.${method}`)}`}
        fields={fields}
        onClose={onClose}
        onValuesChange={onValuesChange}
        notice={() => (checkBody ? <SettlementNotice check={check.data} /> : null)}
        onSubmit={async (values) => {
          const newInstrument =
            isCheck && !values.instrumentId
              ? {
                  kind: values.instrumentKind,
                  number: values.number,
                  bankName: values.bankName || null,
                  dueDate: values.dueDate || null,
                }
              : null;
          const body = {
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
          };
          try {
            return await post(body);
          } catch (error) {
            // 409 CONFIRMATION_REQUIRED: onay penceresi; "Tamam" → aynı Idempotency-Key ile
            // confirmWarnings=true yeniden gönderim, "Vazgeç" → pencere açık kalır (K-12.2-3).
            const warning = parseConfirmationDetails(error);
            if (!isConfirmationRequired(error)) {
              throw error;
            }
            const ok = await confirm.ask(
              <>
                <Alert severity="error" variant="outlined" role="note" sx={{ fontSize: 13, mb: 1 }}>
                  {warning
                    ? allocationWarningText(warning, companyName, money, translate)
                    : (error as Error).message || t("finance.error.CONFIRMATION_REQUIRED")}
                </Alert>
                {t("finance.warning.confirmQuestion")}
              </>,
            );
            if (!ok) {
              throw new SubmitCancelled();
            }
            return post({ ...body, confirmWarnings: true });
          }
        }}
        onSaved={onSaved}
      />
      {confirm.dialog}
    </>
  );
}

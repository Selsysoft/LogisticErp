import { Box, Button, Chip, FormControlLabel, Link, Stack, Switch } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { invalidateOrganization, useBranchGroups } from "../organization/api";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  today,
  useBranches,
  useCan,
  companyIdOf,
  useCompanyField,
  useCurrencies,
  useMultiCompany,
} from "./common";
import { useExchangeRates, useRefreshRates } from "./reportApi";
import { Branch, ExpenseItem, ExpenseType, SaveExpenseItemRequest, Threshold } from "./types";

export function DefinitionsPage() {
  return (
    <Stack spacing={5}>
      <BranchesSection />
      <SettingsSection />
      <ThresholdsSection />
      <ExpenseSection />
      <RatesSection />
    </Stack>
  );
}

function BranchesSection() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("BRANCH_MANAGE");
  const canOpenZto = useCan("FINANCE_VIEW");
  const branches = useBranches();
  const multiCompany = useMultiCompany();
  const companyField = useCompanyField(t("finance.definitions.company"));
  const [adding, setAdding] = useState(false);
  // Grup seçenekleri yalnız ekleme penceresi açıkken okunur (aktif gruplar).
  const groups = useBranchGroups({ active: true }, adding);

  return (
    <Box>
      <SectionHeader title={t("finance.definitions.branches")}>
        {canOpenZto && (
          <Link
            component={RouterLink}
            to="/zto-finans/tanimlar/is-yerleri"
            sx={{ alignSelf: "center" }}
          >
            {t("finance.definitions.manageInZto")}
          </Link>
        )}
        {canManage && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("finance.action.add")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={branches.isPending} error={branches.error} />
      {branches.data && (
        <DataTable
          rows={branches.data}
          rowKey={(branch) => branch.id}
          columns={[
            { header: t("finance.field.code"), render: (branch) => branch.code },
            { header: t("finance.field.name"), render: (branch) => branch.name },
            {
              header: t("finance.definitions.branchGroup"),
              render: (branch) => branch.branchGroupName ?? "—",
            },
            ...(multiCompany
              ? [
                  {
                    header: t("finance.definitions.company"),
                    render: (branch: Branch) => branch.companyName,
                  },
                ]
              : []),
            {
              header: t("finance.definitions.status"),
              render: (branch) =>
                branch.active === false ? (
                  <Chip size="small" label={t("finance.definitions.passive")} />
                ) : (
                  <Chip size="small" color="success" label={t("finance.definitions.active")} />
                ),
            },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("finance.definitions.branches")}
          fields={[
            {
              name: "code",
              label: t("finance.field.code"),
              helperText: t("finance.definitions.codeOptional"),
            },
            { name: "name", label: t("finance.field.name"), required: true },
            ...companyField,
            {
              name: "branchGroupId",
              label: t("finance.definitions.branchGroup"),
              type: "select",
              // Grup şirketin grubu olmalı (aksi 422 COMPANY_MISMATCH): seçili şirkete göre süzülür.
              optionsFrom: (values) =>
                (groups.data ?? [])
                  .filter((group) => !values.companyId || group.companyId === values.companyId)
                  .map((group) => ({ value: group.id, label: group.name })),
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/organization/branches", {
              code: values.code || null,
              name: values.name,
              // Grupsuz iş yerinde şirket: seçilen ya da (LIMITED) görünen tek şirket (§6.13).
              companyId: companyIdOf(values).companyId ?? null,
              branchGroupId: values.branchGroupId || null,
            })
          }
          onSaved={() => {
            setAdding(false);
            void invalidateOrganization(client);
          }}
        />
      )}
    </Box>
  );
}

function SettingsSection() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("FINANCE_MANAGE");
  const settings = useQuery({
    queryKey: ["finance", "settings"],
    queryFn: () => apiGet<{ allowSelfApproval: boolean }>("/finance/settings"),
  });
  const save = useMutation({
    mutationFn: (allowSelfApproval: boolean) =>
      apiRequest("PUT", "/finance/settings", { allowSelfApproval }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", "settings"] }),
  });

  return (
    <Box>
      <SectionHeader title={t("finance.definitions.settings")} />
      {save.isError && <ErrorState error={save.error} />}
      <QueryState isPending={settings.isPending} error={settings.error} />
      {settings.data && (
        <FormControlLabel
          label={t("finance.definitions.allowSelfApproval")}
          control={
            <Switch
              checked={settings.data.allowSelfApproval}
              disabled={!canManage || save.isPending}
              onChange={(event) => save.mutate(event.target.checked)}
            />
          }
        />
      )}
    </Box>
  );
}

function ThresholdsSection() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("FINANCE_MANAGE");
  const currencies = useCurrencies();
  const [adding, setAdding] = useState(false);
  const thresholds = useQuery({
    queryKey: ["finance", "thresholds"],
    queryFn: () => apiGet<Threshold[]>("/finance/density-thresholds"),
  });

  return (
    <Box>
      <SectionHeader title={t("finance.definitions.thresholds")}>
        {canManage && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("finance.action.add")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={thresholds.isPending} error={thresholds.error} />
      {thresholds.data && (
        <DataTable
          rows={thresholds.data}
          rowKey={(row) => row.currency}
          columns={[
            { header: t("finance.field.currency"), render: (r) => r.currency },
            { header: t("finance.field.low"), align: "right", render: (r) => formatAmount(r.low) },
            {
              header: t("finance.field.medium"),
              align: "right",
              render: (r) => formatAmount(r.medium),
            },
            {
              header: t("finance.field.high"),
              align: "right",
              render: (r) => formatAmount(r.high),
            },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("finance.definitions.thresholds")}
          fields={[
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "TRY",
              options: (currencies.data ?? []).map((c) => ({ value: c.code, label: c.code })),
            },
            { name: "low", label: t("finance.field.low"), type: "amount", required: true },
            { name: "medium", label: t("finance.field.medium"), type: "amount", required: true },
            { name: "high", label: t("finance.field.high"), type: "amount", required: true },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={({ currency, ...limits }) =>
            apiRequest("PUT", `/finance/density-thresholds/${currency}`, limits)
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["finance"] });
          }}
        />
      )}
    </Box>
  );
}

function ExpenseSection() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("FINANCE_MANAGE");
  const [adding, setAdding] = useState(false);
  const types = useQuery({
    queryKey: ["finance", "expense-types"],
    queryFn: () => apiGet<ExpenseType[]>("/finance/expense-types"),
  });
  const items = useQuery({
    queryKey: ["finance", "expense-items"],
    queryFn: () => apiGet<ExpenseItem[]>("/finance/expense-items"),
  });
  const typeName = (id: string) => types.data?.find((type) => type.id === id)?.name ?? "—";

  return (
    <Box>
      <SectionHeader title={t("finance.definitions.expenses")}>
        {canManage && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("finance.action.add")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={items.isPending} error={items.error} />
      {items.data && (
        <DataTable
          rows={items.data}
          rowKey={(item) => item.id}
          columns={[
            { header: t("finance.field.code"), render: (item) => item.code },
            { header: t("finance.field.name"), render: (item) => item.name },
            {
              header: t("finance.field.type"),
              render: (item) => item.expenseTypeName ?? typeName(item.expenseTypeId),
            },
            {
              header: t("finance.field.description"),
              render: (item) => item.description ?? "",
            },
            {
              header: t("ztoFinans:salesTruckExpenses.mui.defaultUnit"),
              render: (item) => item.defaultUnit ?? "",
            },
            {
              header: t("finance.definitions.status"),
              render: (item) =>
                item.active === false ? (
                  <Chip size="small" label={t("finance.definitions.passive")} />
                ) : null,
            },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("finance.definitions.expenses")}
          fields={[
            {
              name: "expenseTypeId",
              label: t("finance.field.type"),
              type: "select",
              required: true,
              options: (types.data ?? []).map((type) => ({ value: type.id, label: type.name })),
            },
            {
              name: "code",
              label: t("finance.field.code"),
              helperText: t("finance.definitions.codeOptional"),
            },
            { name: "name", label: t("finance.field.name"), required: true },
            { name: "description", label: t("finance.field.description") },
            { name: "defaultUnit", label: t("ztoFinans:salesTruckExpenses.mui.defaultUnit") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) => {
            // 12.7 §5.8: kod isteğe bağlı (boşsa sunucu MK-00001 dizisinden üretir).
            const blank = (value: string | undefined) => (value?.trim() ? value.trim() : null);
            const body: SaveExpenseItemRequest = {
              expenseTypeId: values.expenseTypeId,
              code: blank(values.code),
              name: values.name.trim(),
              description: blank(values.description),
              defaultUnit: blank(values.defaultUnit),
            };
            return apiRequest("POST", "/finance/expense-items", body);
          }}
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["finance", "expense-items"] });
          }}
        />
      )}
    </Box>
  );
}

function RatesSection() {
  const { t } = useTranslation();
  const canManage = useCan("FINANCE_MANAGE");
  const date = today();
  // 12.8 (§5.2): ZTO Para Birimleri ekranıyla ortak anahtar ve mutasyon (iki ekran birbirini günceller).
  const rates = useExchangeRates(date);
  const refresh = useRefreshRates();

  return (
    <Box>
      <SectionHeader title={t("finance.definitions.rates")}>
        {canManage && (
          <Button variant="outlined" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {t("finance.action.refreshRates")}
          </Button>
        )}
      </SectionHeader>
      {refresh.isError && <ErrorState error={refresh.error} />}
      <QueryState isPending={rates.isPending} error={rates.error} />
      {rates.data && (
        <DataTable
          rows={rates.data}
          rowKey={(rate) => rate.currency}
          columns={[
            { header: t("finance.field.currency"), render: (rate) => rate.currency },
            { header: t("finance.field.date"), render: (rate) => formatDate(rate.rateDate) },
            { header: t("finance.field.source"), render: (rate) => rate.source },
            {
              header: t("finance.field.amount"),
              align: "right",
              render: (rate) => formatAmount(rate.rate),
            },
          ]}
        />
      )}
    </Box>
  );
}

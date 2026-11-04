import {
  Box,
  Button,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
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
  useAccounts,
  useBranches,
  useCan,
  useCurrencies,
  useFunds,
  usePaging,
} from "./common";
import { HeatmapCell, Page, Plan } from "./types";

const STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "PAID", "CANCELLED"];

const LEVEL_COLORS: Record<string, string> = {
  LOW: "success.light",
  MEDIUM: "info.light",
  HIGH: "warning.light",
  VERY_HIGH: "error.light",
  NONE: "action.hover",
};

export function PlansPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const canApprove = useCan("FINANCE_APPROVE");
  const accounts = useAccounts();
  const branches = useBranches();
  const funds = useFunds();
  const currencies = useCurrencies();
  const paging = usePaging();
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [postponing, setPostponing] = useState<Plan | null>(null);
  const [paying, setPaying] = useState<Plan | null>(null);

  const list = useQuery({
    queryKey: ["finance", "plans", status, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Plan>>(
        `/finance/payment-plans?page=${paging.page}&size=${paging.size}&sort=dueDate${status ? `&status=${status}` : ""}`,
      ),
    placeholderData: keepPreviousData,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["finance"] });
  const action = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiRequest(
        "POST",
        `/finance/payment-plans/${id}/${name}`,
        name === "submit" ? undefined : {},
      ),
    onSuccess: refresh,
  });
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name ?? "—";

  const actionButton = (plan: Plan, name: string, label: string, color?: "error") => (
    <Button
      key={name}
      size="small"
      color={color}
      disabled={action.isPending}
      onClick={() => action.mutate({ id: plan.id, name })}
    >
      {t(label)}
    </Button>
  );

  return (
    <>
      <Heatmap />
      <SectionHeader title={t("finance.plans.list")}>
        <TextField
          select
          size="small"
          label={t("finance.field.status")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            paging.setPage(0);
          }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">{t("finance.plans.all")}</MenuItem>
          {STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`finance.planStatus.${value}`)}
            </MenuItem>
          ))}
        </TextField>
        {canPost && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("finance.action.newPlan")}
          </Button>
        )}
      </SectionHeader>
      {action.isError && <ErrorState error={action.error} />}
      <QueryState isPending={list.isPending} error={list.error} />
      {list.data && (
        <DataTable
          rows={list.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.dueDate"), render: (r) => formatDate(r.dueDate) },
            { header: t("finance.field.account"), render: (r) => accountName(r.accountId) },
            { header: t("finance.field.description"), render: (r) => r.description },
            {
              header: t("finance.field.status"),
              render: (r) => t(`finance.planStatus.${r.status}`),
            },
            {
              header: t("finance.field.amount"),
              align: "right",
              render: (r) => formatMoney(r.money),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) => (
                <Box sx={{ whiteSpace: "nowrap" }}>
                  {canPost &&
                    (r.status === "DRAFT" || r.status === "REJECTED") &&
                    actionButton(r, "submit", "finance.action.submit")}
                  {canApprove &&
                    r.status === "PENDING" &&
                    actionButton(r, "approve", "finance.action.approve")}
                  {canApprove &&
                    r.status === "PENDING" &&
                    actionButton(r, "reject", "finance.action.reject", "error")}
                  {canPost && r.status === "APPROVED" && (
                    <Button size="small" variant="contained" onClick={() => setPaying(r)}>
                      {t("finance.action.pay")}
                    </Button>
                  )}
                  {canPost && ["DRAFT", "PENDING", "APPROVED"].includes(r.status) && (
                    <Button size="small" onClick={() => setPostponing(r)}>
                      {t("finance.action.postpone")}
                    </Button>
                  )}
                  {canPost &&
                    !["PAID", "CANCELLED"].includes(r.status) &&
                    actionButton(r, "cancel", "finance.action.cancel", "error")}
                </Box>
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
          title={t("finance.action.newPlan")}
          fields={[
            {
              name: "accountId",
              label: t("finance.field.account"),
              type: "select",
              required: true,
              options: (accounts.data ?? []).map((a) => ({
                value: a.id,
                label: `${a.code} · ${a.name}`,
              })),
            },
            {
              name: "branchId",
              label: t("finance.field.branch"),
              type: "select",
              required: true,
              options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            },
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
              name: "dueDate",
              label: t("finance.field.dueDate"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "description", label: t("finance.field.description") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/finance/payment-plans", {
              accountId: values.accountId,
              branchId: values.branchId,
              money: { amount: values.amount, currency: values.currency },
              dueDate: values.dueDate,
              description: values.description || null,
            })
          }
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
      {postponing && (
        <FormDialog
          title={t("finance.action.postpone")}
          fields={[
            {
              name: "dueDate",
              label: t("finance.field.dueDate"),
              type: "date",
              required: true,
              defaultValue: shiftDays(postponing.dueDate, 7),
            },
            { name: "note", label: t("finance.field.note") },
          ]}
          onClose={() => setPostponing(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/finance/payment-plans/${postponing.id}/postpone`, {
              dueDate: values.dueDate,
              note: values.note || null,
            })
          }
          onSaved={() => {
            setPostponing(null);
            void refresh();
          }}
        />
      )}
      {paying && (
        <FormDialog
          title={`${t("finance.action.pay")} · ${formatMoney(paying.money)}`}
          fields={[
            {
              name: "fundAccountId",
              label: t("finance.field.fund"),
              type: "select",
              required: true,
              options: (funds.data ?? [])
                .filter((fund) => fund.currency === paying.money.currency)
                .map((fund) => ({
                  value: fund.id,
                  label: `${fund.name} · ${formatAmount(fund.balance)} ${fund.currency}`,
                })),
            },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "exchangeRate",
              label: t("finance.field.rate"),
              type: "amount",
              helperText: t("finance.field.rateHint"),
            },
          ]}
          submitLabel={t("finance.action.pay")}
          onClose={() => setPaying(null)}
          onSubmit={(values) => {
            const fund = funds.data?.find((item) => item.id === values.fundAccountId);
            return apiRequest("POST", `/finance/payment-plans/${paying.id}/pay`, {
              method: fund?.kind,
              fundAccountId: values.fundAccountId,
              date: values.date,
              exchangeRate: values.exchangeRate || null,
            });
          }}
          onSaved={() => {
            setPaying(null);
            void refresh();
          }}
        />
      )}
    </>
  );
}

function Heatmap() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<"DAY" | "MONTH">("DAY");
  const from = today();
  const to = shiftDays(from, period === "DAY" ? 30 : 365);

  const cells = useQuery({
    queryKey: ["finance", "heatmap", period, from, to],
    queryFn: () =>
      apiGet<HeatmapCell[]>(
        `/finance/payment-plans/heatmap?from=${from}&to=${to}&period=${period}`,
      ),
  });

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader title={t("finance.plans.heatmap")}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={period}
          onChange={(_, value: "DAY" | "MONTH" | null) => value && setPeriod(value)}
        >
          <ToggleButton value="DAY">{t("finance.period.DAY")}</ToggleButton>
          <ToggleButton value="MONTH">{t("finance.period.MONTH")}</ToggleButton>
        </ToggleButtonGroup>
      </SectionHeader>
      <QueryState isPending={cells.isPending} error={cells.error} />
      {cells.data?.length === 0 && <Typography>{t("finance.empty")}</Typography>}
      <Box
        sx={{
          display: "grid",
          gap: 1,
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        }}
      >
        {cells.data?.map((cell) => {
          const level = cell.level ?? "NONE";
          return (
            <Box
              key={`${cell.period}-${cell.currency}`}
              sx={{ p: 1, borderRadius: 1, bgcolor: LEVEL_COLORS[level], color: "text.primary" }}
            >
              <Typography variant="caption" sx={{ display: "block" }}>
                {period === "DAY" ? formatDate(cell.period) : cell.period}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatAmount(cell.total)} {cell.currency}
              </Typography>
              <Typography variant="caption">
                {t(`finance.density.${level}`)} · {cell.count}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

import { Button, MenuItem, TextField } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  formatAmount,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  today,
  useCan,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import { EXPENSE_KINDS, ExpenseDialog } from "./ExpenseDialog";
import { Vehicle, VehicleExpense } from "./types";

export function ExpensesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const paging = usePaging();
  const [kind, setKind] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const vehicles = useQuery({
    queryKey: ["fleet", "vehicles", "options"],
    queryFn: () => apiGet<Page<Vehicle>>("/fleet/vehicles?size=200&sort=plate"),
    select: (page) => page.content,
  });
  const expenses = useQuery({
    queryKey: ["fleet", "expenses", kind, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<VehicleExpense>>(
        `/fleet/expenses?page=${paging.page}&size=${paging.size}&sort=expenseDate,desc${kind ? `&kind=${kind}` : ""}`,
      ),
    placeholderData: keepPreviousData,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["fleet"] });
  const reverse = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/fleet/expenses/${id}/reverse`, { date: today() }),
    onSuccess: refresh,
  });
  const plate = (id: string) => vehicles.data?.find((v) => v.id === id)?.plate ?? "—";

  return (
    <>
      <SectionHeader title={t("fleet.tabs.expenses")}>
        <TextField
          select
          size="small"
          label={t("fleet.field.kind")}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            paging.setPage(0);
          }}
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="">{t("finance.plans.all")}</MenuItem>
          {EXPENSE_KINDS.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`fleet.expenseKind.${value}`)}
            </MenuItem>
          ))}
        </TextField>
        {canEdit &&
          EXPENSE_KINDS.map((value) => (
            <Button key={value} variant="outlined" onClick={() => setAdding(value)}>
              {t(`fleet.expenseKind.${value}`)}
            </Button>
          ))}
      </SectionHeader>
      {reverse.isError && <ErrorState error={reverse.error} />}
      <QueryState isPending={expenses.isPending} error={expenses.error} />
      {expenses.data && (
        <DataTable
          rows={expenses.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.date"), render: (r) => formatDate(r.expenseDate) },
            { header: t("fleet.field.plate"), render: (r) => plate(r.vehicleId) },
            { header: t("fleet.field.kind"), render: (r) => t(`fleet.expenseKind.${r.kind}`) },
            { header: t("finance.field.description"), render: (r) => r.description },
            {
              header: t("fleet.field.odometerKm"),
              align: "right",
              render: (r) => (r.odometerKm ? formatAmount(r.odometerKm) : ""),
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
                canEdit && (
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
            count: expenses.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && vehicles.data && (
        <ExpenseDialog
          kind={adding}
          vehicles={vehicles.data}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            void refresh();
          }}
        />
      )}
    </>
  );
}

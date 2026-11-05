import { Button, Link, MenuItem, Stack, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiDownload, apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { ExpenseStatus, ReviewExpense } from "../driver/types";
import {
  DataTable,
  FormDialog,
  formatMoney,
  formatDate,
  QueryState,
  SectionHeader,
  useCan,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";

const STATUSES: ExpenseStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export function DriverExpenseReviewPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canReview = useCan("SHIPMENT_DISPATCH");
  const [status, setStatus] = useState<ExpenseStatus>("PENDING");
  const [rejecting, setRejecting] = useState<ReviewExpense | null>(null);
  const paging = usePaging();
  const rows = useQuery({
    queryKey: ["shipment", "driver-expenses", status, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<ReviewExpense>>(
        `/shipment/driver-expenses?status=${status}&page=${paging.page}&size=${paging.size}`,
      ),
  });
  const refresh = () => {
    setRejecting(null);
    void client.invalidateQueries({ queryKey: ["shipment"] });
  };
  const approve = useMutation({
    mutationFn: (row: ReviewExpense) =>
      apiRequest("POST", `/shipment/driver-expenses/${row.id}/approve`),
    onSuccess: refresh,
  });
  const receipt = useMutation({
    mutationFn: (row: ReviewExpense) =>
      apiDownload(`/files/${row.receiptFileId}/content`, "masraf-fisi.jpg"),
  });

  return (
    <>
      <SectionHeader title={t("operations.tabs.driverExpenses")}>
        <TextField
          size="small"
          select
          label={t("finance.field.status")}
          value={status}
          onChange={(event) => {
            paging.setPage(0);
            setStatus(event.target.value as ExpenseStatus);
          }}
          sx={{ minWidth: 160 }}
        >
          {STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`driver.expenseStatus.${value}`)}
            </MenuItem>
          ))}
        </TextField>
      </SectionHeader>
      {approve.isError && <ErrorState error={approve.error} />}
      {receipt.isError && <ErrorState error={receipt.error} />}
      <QueryState isPending={rows.isPending} error={rows.error} />
      {rows.data && (
        <DataTable
          rows={rows.data.content}
          rowKey={(row) => row.id}
          pagination={{
            count: rows.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
          columns={[
            { header: t("driver.review.driver"), render: (row) => row.driverName ?? "—" },
            {
              header: t("operations.field.number"),
              render: (row) => (
                <Link component={RouterLink} to={`/operations/shipments/${row.shipmentId}`}>
                  {row.shipmentNumber}
                </Link>
              ),
            },
            {
              header: t("driver.expense.kind"),
              render: (row) => t(`driver.expenseKind.${row.kind}`),
            },
            { header: t("driver.expense.date"), render: (row) => formatDate(row.date) },
            {
              header: t("driver.expense.amount"),
              align: "right",
              render: (row) => formatMoney(row.money),
            },
            {
              header: t("driver.expense.description"),
              render: (row) => row.reviewNote ?? row.description ?? "—",
            },
            {
              header: "",
              render: (row) => (
                <Stack direction="row" spacing={0.5}>
                  {row.receiptFileId && (
                    <Button size="small" onClick={() => receipt.mutate(row)}>
                      {t("driver.review.receipt")}
                    </Button>
                  )}
                  {canReview && row.status === "PENDING" && (
                    <>
                      <Button
                        size="small"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(row)}
                      >
                        {t("driver.review.approve")}
                      </Button>
                      <Button size="small" color="error" onClick={() => setRejecting(row)}>
                        {t("driver.review.reject")}
                      </Button>
                    </>
                  )}
                </Stack>
              ),
            },
          ]}
        />
      )}
      {rejecting && (
        <FormDialog
          title={t("driver.review.reject")}
          fields={[{ name: "note", label: t("driver.review.rejectNote"), required: true }]}
          onClose={() => setRejecting(null)}
          onSaved={refresh}
          onSubmit={(values) =>
            apiRequest("POST", `/shipment/driver-expenses/${rejecting.id}/reject`, values)
          }
        />
      )}
    </>
  );
}

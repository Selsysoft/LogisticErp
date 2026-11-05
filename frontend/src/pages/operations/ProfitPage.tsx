import { Link, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet } from "../../api/client";
import {
  DataTable,
  formatAmount,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
} from "../finance/common";
import { Profit } from "./types";

const DEFAULT_RANGE_DAYS = 30;

export function ProfitPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(shiftDays(today(), -DEFAULT_RANGE_DAYS));
  const [to, setTo] = useState(shiftDays(today(), DEFAULT_RANGE_DAYS));
  const rows = useQuery({
    queryKey: ["shipment", "profit-report", from, to],
    queryFn: () => apiGet<Profit[]>(`/shipment/reports/profit?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });
  const amount = (value: string | null) => (value === null ? "—" : formatAmount(value));

  return (
    <>
      <SectionHeader title={t("operations.tabs.profit")}>
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
      <QueryState isPending={rows.isPending} error={rows.error} />
      {rows.data && (
        <DataTable
          rows={rows.data}
          rowKey={(row) => row.shipmentId}
          columns={[
            {
              header: t("operations.field.number"),
              render: (r) => (
                <Link component={RouterLink} to={`/operations/shipments/${r.shipmentId}`}>
                  {r.number}
                </Link>
              ),
            },
            { header: t("operations.field.customer"), render: (r) => r.accountName },
            {
              header: t("finance.field.status"),
              render: (r) => t(`operations.status.${r.status}`),
            },
            {
              header: t("operations.field.revenue"),
              align: "right",
              render: (r) =>
                `${amount(r.revenueTl)}${r.invoiced ? "" : ` (${t("operations.field.estimated")})`}`,
            },
            {
              header: t("operations.field.cost"),
              align: "right",
              render: (r) => amount(r.costTl),
            },
            {
              header: t("operations.field.margin"),
              align: "right",
              render: (r) => amount(r.marginTl),
            },
            {
              header: t("operations.field.marginPercent"),
              align: "right",
              render: (r) => amount(r.marginPercent),
            },
          ]}
        />
      )}
    </>
  );
}

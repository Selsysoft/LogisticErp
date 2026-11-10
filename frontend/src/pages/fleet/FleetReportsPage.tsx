import { TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import {
  DataTable,
  formatAmount,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
} from "../finance/common";
import { VehicleCost } from "./types";

export function FleetReportsPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(shiftDays(today(), -30));
  const [to, setTo] = useState(today());

  const costs = useQuery({
    queryKey: ["fleet", "costs", from, to],
    queryFn: () => apiGet<VehicleCost[]>(`/fleet/reports/vehicle-costs?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });
  const amount = (value: number) => formatAmount(value);

  return (
    <>
      <SectionHeader title={t("fleet.sections.costReport")}>
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
      <QueryState isPending={costs.isPending} error={costs.error} />
      {costs.data && (
        <DataTable
          rows={costs.data}
          rowKey={(row) => row.vehicleId}
          columns={[
            { header: t("fleet.field.plate"), render: (r) => r.plate },
            {
              header: t("fleet.expenseKind.FUEL"),
              align: "right",
              render: (r) => amount(r.fuelTl),
            },
            {
              header: t("fleet.expenseKind.MAINTENANCE"),
              align: "right",
              render: (r) => amount(r.maintenanceTl),
            },
            {
              header: t("fleet.expenseKind.REPAIR"),
              align: "right",
              render: (r) => amount(r.repairTl),
            },
            {
              header: t("fleet.expenseKind.TIRE"),
              align: "right",
              render: (r) => amount(r.tireTl),
            },
            {
              header: t("fleet.field.totalTl"),
              align: "right",
              render: (r) => amount(r.totalTl),
            },
            {
              header: "L/100 km",
              align: "right",
              render: (r) => (r.litersPer100Km ? amount(r.litersPer100Km) : ""),
            },
            {
              header: t("fleet.field.costPerKm"),
              align: "right",
              render: (r) => (r.costPerKmTl ? amount(r.costPerKmTl) : ""),
            },
          ]}
        />
      )}
    </>
  );
}

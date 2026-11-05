import { Button, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet } from "../../api/client";
import { DataTable, QueryState, SectionHeader, shiftDays, today } from "../finance/common";
import { formatPercent, reportQuery } from "./common";
import { ExportButtons, PeriodFilter } from "./components";
import { DriverRow } from "./types";

const DEFAULT_RANGE_DAYS = 30;

export function FleetReportPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(shiftDays(today(), -DEFAULT_RANGE_DAYS));
  const [to, setTo] = useState(shiftDays(today(), DEFAULT_RANGE_DAYS));
  const [branchId, setBranchId] = useState("");
  const drivers = useQuery({
    queryKey: ["reports", "drivers", from, to, branchId],
    queryFn: () => apiGet<DriverRow[]>(`/reports/drivers${reportQuery({ from, to, branchId })}`),
    enabled: !!from && !!to,
  });

  return (
    <Stack spacing={2}>
      <SectionHeader title={t("reports.drivers.title")}>
        <PeriodFilter
          from={from}
          to={to}
          branchId={branchId}
          onFrom={setFrom}
          onTo={setTo}
          onBranch={setBranchId}
        />
        <ExportButtons report="DRIVERS" params={{ from, to, branchId }} />
        <Button component={RouterLink} to="/fleet/reports">
          {t("reports.action.vehicleCosts")}
        </Button>
      </SectionHeader>
      <QueryState isPending={drivers.isPending} error={drivers.error} />
      {drivers.data && (
        <DataTable
          rows={drivers.data}
          rowKey={(row) => row.driverId}
          columns={[
            { header: t("reports.drivers.driver"), render: (row) => row.driverName },
            {
              header: t("reports.field.shipments"),
              align: "right",
              render: (row) => row.shipments,
            },
            {
              header: t("reports.kpi.delivered"),
              align: "right",
              render: (row) => row.delivered,
            },
            {
              header: t("reports.drivers.onTimeCount"),
              align: "right",
              render: (row) => row.onTime,
            },
            {
              header: t("reports.kpi.onTime"),
              align: "right",
              render: (row) => formatPercent(row.onTimePercent),
            },
          ]}
        />
      )}
    </Stack>
  );
}

import { Alert, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { formatAmount, QueryState, SectionHeader, shiftDays, today } from "../finance/common";
import { formatPercent, reportQuery } from "./common";
import { PeriodFilter, StatGrid, StatTile } from "./components";
import { KpiReport } from "./types";

const DEFAULT_RANGE_DAYS = 30;

export function OperationsReportPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(shiftDays(today(), -DEFAULT_RANGE_DAYS));
  const [to, setTo] = useState(shiftDays(today(), DEFAULT_RANGE_DAYS));
  const [branchId, setBranchId] = useState("");
  const kpi = useQuery({
    queryKey: ["reports", "kpi", from, to, branchId],
    queryFn: () => apiGet<KpiReport>(`/reports/kpi${reportQuery({ from, to, branchId })}`),
    enabled: !!from && !!to,
  });

  return (
    <Stack spacing={2}>
      <SectionHeader title={t("reports.tabs.operations")}>
        <PeriodFilter
          from={from}
          to={to}
          branchId={branchId}
          onFrom={setFrom}
          onTo={setTo}
          onBranch={setBranchId}
        />
      </SectionHeader>
      <QueryState isPending={kpi.isPending} error={kpi.error} />
      {kpi.data && (
        <StatGrid>
          <StatTile label={t("reports.kpi.shipments")} value={String(kpi.data.shipments)} />
          <StatTile label={t("reports.kpi.delivered")} value={String(kpi.data.delivered)} />
          <StatTile
            label={t("reports.kpi.onTime")}
            value={formatPercent(kpi.data.onTimePercent)}
            hint={t("reports.kpi.onTimeHint", {
              onTime: kpi.data.onTime,
              delivered: kpi.data.delivered,
            })}
          />
          <StatTile label={t("reports.kpi.cancelled")} value={String(kpi.data.cancelled)} />
          <StatTile
            label={t("reports.kpi.averageFreight")}
            value={
              kpi.data.averageFreightTl === null
                ? "—"
                : `${formatAmount(kpi.data.averageFreightTl)} TL`
            }
          />
          <StatTile
            label={t("reports.kpi.averageFill")}
            value={formatPercent(kpi.data.averageFillPercent)}
            hint={t("reports.kpi.averageFillHint")}
          />
        </StatGrid>
      )}
      <Alert severity="info">{t("reports.kpiNote")}</Alert>
    </Stack>
  );
}

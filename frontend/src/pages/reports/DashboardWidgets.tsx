import { Box, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { formatAmount } from "../finance/common";
import { formatPercent, formatTotals } from "./common";
import { StatGrid, StatTile } from "./components";
import { Dashboard } from "./types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      <StatGrid>{children}</StatGrid>
    </Box>
  );
}

/** Sunucu yalnız kullanıcının yetkili olduğu bölümleri doldurur. */
export function DashboardWidgets() {
  const { t } = useTranslation();
  const dashboard = useQuery({
    queryKey: ["reports", "dashboard"],
    queryFn: () => apiGet<Dashboard>("/reports/dashboard"),
  });
  if (dashboard.isError) {
    return <ErrorState error={dashboard.error} />;
  }
  const data = dashboard.data;
  if (!data) {
    return null;
  }
  const kpi = data.operations?.lastThirtyDays;
  return (
    <Stack spacing={3}>
      {data.operations && kpi && (
        <Section title={t("reports.dashboard.operations")}>
          <StatTile
            label={t("reports.dashboard.inTransit")}
            value={String(data.operations.inTransit)}
          />
          <StatTile
            label={t("reports.dashboard.waitingInvoice")}
            value={String(data.operations.waitingInvoice)}
          />
          <StatTile
            label={t("reports.kpi.onTime")}
            value={formatPercent(kpi.onTimePercent)}
            hint={t("reports.dashboard.lastThirtyDays")}
          />
          <StatTile
            label={t("reports.kpi.averageFreight")}
            value={kpi.averageFreightTl === null ? "—" : `${formatAmount(kpi.averageFreightTl)} TL`}
            hint={t("reports.dashboard.lastThirtyDays")}
          />
        </Section>
      )}
      {data.finance && (
        <Section title={t("reports.dashboard.finance")}>
          <StatTile
            label={t("reports.dashboard.overduePayments")}
            value={formatTotals(data.finance.overdue)}
          />
          <StatTile
            label={t("reports.dashboard.dueThisWeek")}
            value={formatTotals(data.finance.dueThisWeek)}
          />
          <StatTile
            label={t("reports.dashboard.pendingApproval")}
            value={String(data.finance.pendingApproval)}
          />
          {data.finance.position.map((row) => (
            <StatTile
              key={row.currency}
              label={t("reports.dashboard.netPosition", { currency: row.currency })}
              value={formatAmount(row.net)}
            />
          ))}
        </Section>
      )}
      {data.fleet && (
        <Section title={t("reports.dashboard.fleet")}>
          <StatTile
            label={t("reports.dashboard.overdueReminders")}
            value={String(data.fleet.overdueReminders)}
          />
          <StatTile
            label={t("reports.dashboard.upcomingReminders")}
            value={String(data.fleet.upcomingReminders)}
          />
        </Section>
      )}
      {data.customs && (
        <Section title={t("reports.dashboard.customs")}>
          <StatTile
            label={t("reports.dashboard.openTransits")}
            value={String(data.customs.openTransits)}
          />
          <StatTile
            label={t("reports.dashboard.overdueTransits")}
            value={String(data.customs.overdueTransits)}
          />
        </Section>
      )}
    </Stack>
  );
}

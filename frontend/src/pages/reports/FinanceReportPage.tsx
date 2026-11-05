import { Alert, Button, Card, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet } from "../../api/client";
import {
  DataTable,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
} from "../finance/common";
import { reportQuery } from "./common";
import { ExportButtons, PeriodFilter } from "./components";
import { ForecastRow, PositionRow, SettlementPerformanceRow } from "./types";

const DEFAULT_RANGE_DAYS = 30;
const CARD_SX = { p: 2, borderRadius: 3 };

export function FinanceReportPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(shiftDays(today(), -DEFAULT_RANGE_DAYS));
  const [to, setTo] = useState(shiftDays(today(), DEFAULT_RANGE_DAYS));
  const position = useQuery({
    queryKey: ["reports", "position"],
    queryFn: () => apiGet<PositionRow[]>("/reports/position"),
  });
  const forecast = useQuery({
    queryKey: ["reports", "forecast"],
    queryFn: () => apiGet<ForecastRow[]>("/reports/forecast"),
  });
  const performance = useQuery({
    queryKey: ["reports", "settlement-performance", from, to],
    queryFn: () =>
      apiGet<SettlementPerformanceRow[]>(
        `/reports/settlement-performance${reportQuery({ from, to })}`,
      ),
    enabled: !!from && !!to,
  });
  const amount = (value: string) => formatAmount(value);

  return (
    <Stack spacing={3}>
      <Card variant="outlined" sx={CARD_SX}>
        <SectionHeader title={t("reports.position.title")}>
          <ExportButtons report="POSITION" />
          <Button component={RouterLink} to="/finance/reports">
            {t("reports.action.aging")}
          </Button>
        </SectionHeader>
        <QueryState isPending={position.isPending} error={position.error} />
        {position.data && (
          <DataTable
            rows={position.data}
            rowKey={(row) => row.currency}
            columns={[
              { header: t("reports.field.currency"), render: (row) => row.currency },
              {
                header: t("reports.position.cash"),
                align: "right",
                render: (row) => amount(row.cash),
              },
              {
                header: t("reports.position.receivable"),
                align: "right",
                render: (row) => amount(row.receivable),
              },
              {
                header: t("reports.position.payable"),
                align: "right",
                render: (row) => amount(row.payable),
              },
              {
                header: t("reports.position.net"),
                align: "right",
                render: (row) => amount(row.net),
              },
            ]}
          />
        )}
      </Card>
      <Card variant="outlined" sx={CARD_SX}>
        <SectionHeader title={t("reports.forecast.title")}>
          <ExportButtons report="FORECAST" />
        </SectionHeader>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("reports.forecast.note")}
        </Alert>
        <QueryState isPending={forecast.isPending} error={forecast.error} />
        {forecast.data && (
          <DataTable
            rows={forecast.data}
            rowKey={(row) => `${row.currency}-${row.weekStart ?? "overdue"}`}
            columns={[
              {
                header: t("reports.forecast.week"),
                render: (row) =>
                  row.overdue || row.weekStart === null
                    ? t("reports.forecast.overdue")
                    : formatDate(row.weekStart),
              },
              { header: t("reports.field.currency"), render: (row) => row.currency },
              {
                header: t("reports.forecast.inflow"),
                align: "right",
                render: (row) => amount(row.inflow),
              },
              {
                header: t("reports.forecast.outflow"),
                align: "right",
                render: (row) => amount(row.outflow),
              },
              {
                header: t("reports.position.net"),
                align: "right",
                render: (row) => amount(row.net),
              },
            ]}
          />
        )}
      </Card>
      <Card variant="outlined" sx={CARD_SX}>
        <SectionHeader title={t("reports.performance.title")}>
          <PeriodFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </SectionHeader>
        <QueryState isPending={performance.isPending} error={performance.error} />
        {performance.data && (
          <DataTable
            rows={performance.data}
            rowKey={(row) => row.currency}
            columns={[
              { header: t("reports.field.currency"), render: (row) => row.currency },
              {
                header: t("reports.performance.collected"),
                align: "right",
                render: (row) => `${amount(row.collected)} (${row.collections})`,
              },
              {
                header: t("reports.performance.paid"),
                align: "right",
                render: (row) => `${amount(row.paid)} (${row.payments})`,
              },
            ]}
          />
        )}
      </Card>
    </Stack>
  );
}

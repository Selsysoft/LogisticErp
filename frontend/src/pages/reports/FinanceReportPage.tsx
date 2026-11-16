import { Alert, Button, Card, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import {
  DataTable,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
} from "../finance/common";
import { withCompany } from "../finance/companyQuery";
import { reportQuery } from "./common";
import { ExportButtons, PeriodFilter } from "./components";
import { ForecastRow, PositionRow, SettlementPerformanceRow } from "./types";

const DEFAULT_RANGE_DAYS = 30;
const CARD_SX = { p: 2, borderRadius: 3 };

export function FinanceReportPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(shiftDays(today(), -DEFAULT_RANGE_DAYS));
  const [to, setTo] = useState(shiftDays(today(), DEFAULT_RANGE_DAYS));
  // 12.8 (§0.2 madde 4, §5.11): pozisyon/öngörü/performans aktif şirkete göre; konsolidede (null)
  // parametre yok ve sunucu grup şirketi carilerini dışlar. Tabloda şirket sütunu yok.
  const companyId = useActiveCompanyId();
  const position = useQuery({
    queryKey: ["reports", "position", companyId],
    queryFn: () => apiGet<PositionRow[]>(withCompany("/reports/position", companyId)),
  });
  const forecast = useQuery({
    queryKey: ["reports", "forecast", companyId],
    queryFn: () => apiGet<ForecastRow[]>(withCompany("/reports/forecast", companyId)),
  });
  const performance = useQuery({
    queryKey: ["reports", "settlement-performance", from, to, companyId],
    queryFn: () =>
      apiGet<SettlementPerformanceRow[]>(
        `/reports/settlement-performance${reportQuery({ from, to, companyId })}`,
      ),
    enabled: !!from && !!to,
  });
  const amount = (value: number) => formatAmount(value);

  return (
    <Stack spacing={3}>
      <Card variant="outlined" sx={CARD_SX}>
        <SectionHeader title={t("reports.position.title")}>
          <ExportButtons report="POSITION" companyId={companyId} />
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
          <ExportButtons report="FORECAST" companyId={companyId} />
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

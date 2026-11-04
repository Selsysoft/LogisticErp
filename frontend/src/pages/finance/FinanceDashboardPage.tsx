import { Box, Card, CardContent, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import {
  DataTable,
  formatAmount,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  today,
  useAccounts,
} from "./common";
import { CurrencyTotal, Dashboard } from "./types";

function TotalCard({ title, totals }: { title: string; totals: CurrencyTotal[] }) {
  const { t } = useTranslation();
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        {totals.length === 0 && <Typography variant="h6">{t("finance.dashboard.none")}</Typography>}
        {totals.map((total) => (
          <Typography key={total.currency} variant="h6">
            {formatAmount(total.total)} {total.currency}
          </Typography>
        ))}
      </CardContent>
    </Card>
  );
}

export function FinanceDashboardPage() {
  const { t } = useTranslation();
  const date = today();
  const dashboard = useQuery({
    queryKey: ["finance", "dashboard", date],
    queryFn: () => apiGet<Dashboard>(`/finance/dashboard?today=${date}`),
  });
  const accounts = useAccounts();
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name ?? "—";

  return (
    <>
      <QueryState isPending={dashboard.isPending} error={dashboard.error} />
      {dashboard.data && (
        <>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              mb: 3,
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
            }}
          >
            <TotalCard title={t("finance.dashboard.overdue")} totals={dashboard.data.overdue} />
            <TotalCard title={t("finance.dashboard.today")} totals={dashboard.data.dueToday} />
            <TotalCard title={t("finance.dashboard.week")} totals={dashboard.data.dueThisWeek} />
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {t("finance.dashboard.pending")}
                </Typography>
                <Typography variant="h6">{dashboard.data.pendingApproval}</Typography>
              </CardContent>
            </Card>
          </Box>
          <SectionHeader title={t("finance.dashboard.upcoming")} />
          <DataTable
            rows={dashboard.data.upcoming}
            rowKey={(plan) => plan.id}
            columns={[
              { header: t("finance.field.dueDate"), render: (plan) => formatDate(plan.dueDate) },
              { header: t("finance.field.account"), render: (plan) => accountName(plan.accountId) },
              {
                header: t("finance.field.status"),
                render: (plan) => t(`finance.planStatus.${plan.status}`),
              },
              {
                header: t("finance.field.amount"),
                align: "right",
                render: (plan) => formatMoney(plan.money),
              },
            ]}
          />
        </>
      )}
    </>
  );
}

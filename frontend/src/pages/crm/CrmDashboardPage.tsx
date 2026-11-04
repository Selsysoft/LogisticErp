import { Card, CardContent, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import {
  DataTable,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  today,
} from "../finance/common";
import { customerName, useCustomers } from "./common";
import { Dashboard } from "./types";

const STAGE_ORDER = ["LEAD", "QUALIFIED", "QUOTE", "WON", "LOST"];

export function CrmDashboardPage() {
  const { t } = useTranslation();
  const date = today();
  const customers = useCustomers();
  const dashboard = useQuery({
    queryKey: ["crm", "dashboard", date],
    queryFn: () => apiGet<Dashboard>(`/crm/dashboard?today=${date}`),
  });

  return (
    <>
      <QueryState isPending={dashboard.isPending} error={dashboard.error} />
      {dashboard.data && (
        <Stack spacing={4}>
          <Card variant="outlined" sx={{ maxWidth: 260 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                {t("crm.sections.winRate")}
              </Typography>
              <Typography variant="h5">%{formatAmount(dashboard.data.winRatePercent)}</Typography>
            </CardContent>
          </Card>
          <div>
            <SectionHeader title={t("crm.sections.funnel")} />
            <DataTable
              rows={[...dashboard.data.funnel].sort(
                (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage),
              )}
              rowKey={(row) => `${row.stage}-${row.currency}`}
              columns={[
                { header: t("crm.field.stage"), render: (r) => t(`crm.stage.${r.stage}`) },
                { header: t("finance.field.count"), align: "right", render: (r) => r.count },
                {
                  header: t("crm.field.value"),
                  align: "right",
                  render: (r) => `${formatAmount(r.total)} ${r.currency}`,
                },
              ]}
            />
          </div>
          <div>
            <SectionHeader title={t("crm.sections.owners")} />
            <DataTable
              rows={dashboard.data.owners}
              rowKey={(row) => row.ownerEmail}
              columns={[
                { header: t("crm.field.owner"), render: (r) => r.ownerEmail },
                { header: t("crm.sections.open"), align: "right", render: (r) => r.open },
                { header: t("crm.sections.won"), align: "right", render: (r) => r.won },
                { header: t("crm.sections.lost"), align: "right", render: (r) => r.lost },
              ]}
            />
          </div>
          <div>
            <SectionHeader title={t("crm.sections.upcoming")} />
            <DataTable
              rows={dashboard.data.upcomingActivities}
              rowKey={(row) => row.id}
              columns={[
                {
                  header: t("finance.field.dueDate"),
                  render: (r) => (r.dueDate ? formatDate(r.dueDate) : ""),
                },
                {
                  header: t("crm.field.activityType"),
                  render: (r) => t(`crm.activityType.${r.type}`),
                },
                { header: t("crm.field.subject"), render: (r) => r.subject },
                {
                  header: t("finance.field.account"),
                  render: (r) => customerName(customers.data, r.accountId),
                },
              ]}
            />
          </div>
        </Stack>
      )}
    </>
  );
}

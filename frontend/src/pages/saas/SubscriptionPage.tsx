import { Alert, Card, Stack, Typography } from "@mui/material";
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
  useCan,
} from "../finance/common";
import { StatGrid, StatTile } from "../reports/components";
import { daysUntil, formatLimit, limitsNeedingAttention } from "./common";
import { MySubscription } from "./types";

const UNLIMITED = "∞";
const TRIAL_WARNING_DAYS = 7;
const QUERY_KEY = ["subscription"];

function useMySubscription(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiGet<MySubscription>("/subscription"),
    enabled,
  });
}

/** Ana sayfa uyarısı: deneme sonu, gecikmiş ödeme ve dolmak üzere olan plan sınırları. */
export function SubscriptionNotice() {
  const { t } = useTranslation();
  const allowed = useCan("SUBSCRIPTION_VIEW");
  const { data } = useMySubscription(allowed);
  if (!allowed || !data) {
    return null;
  }
  const days = data.trialEndsOn === null ? null : daysUntil(data.trialEndsOn, today());
  const limits = limitsNeedingAttention(data.limits);
  return (
    <Stack spacing={1}>
      {days !== null && days <= TRIAL_WARNING_DAYS && (
        <Alert severity="warning">{t("subscription.trialEnding", { days })}</Alert>
      )}
      {data.status === "PAST_DUE" && <Alert severity="error">{t("subscription.pastDue")}</Alert>}
      {limits.map((row) => (
        <Alert key={row.resource} severity={row.reached ? "error" : "warning"}>
          {t(row.reached ? "subscription.limitReached" : "subscription.limitNear", {
            resource: t(`saas.resource.${row.resource}`),
            used: row.used,
            limit: row.limit,
          })}
        </Alert>
      ))}
    </Stack>
  );
}

export function SubscriptionPage() {
  const { t } = useTranslation();
  const subscription = useMySubscription();
  const data = subscription.data;
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {t("nav.subscription")}
      </Typography>
      <QueryState isPending={subscription.isPending} error={subscription.error} />
      {data && (
        <>
          <SubscriptionNotice />
          <StatGrid>
            <StatTile label={t("saas.field.plan")} value={data.planName} />
            <StatTile
              label={t("saas.field.status")}
              value={t(`saas.subscriptionStatus.${data.status}`)}
              hint={
                data.trialEndsOn
                  ? t("subscription.trialUntil", { date: formatDate(data.trialEndsOn) })
                  : undefined
              }
            />
            <StatTile
              label={t("saas.field.monthlyPrice")}
              value={`${formatAmount(data.monthlyPrice)} ${data.currency}`}
            />
            <StatTile
              label={t("subscription.nextBilling")}
              value={data.nextBillingOn ? formatDate(data.nextBillingOn) : "—"}
            />
            {data.limits.map((row) => (
              <StatTile
                key={row.resource}
                label={t(`saas.resource.${row.resource}`)}
                value={formatLimit(row, UNLIMITED)}
              />
            ))}
          </StatGrid>
          <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <SectionHeader title={t("saas.tabs.invoices")} />
            <DataTable
              rows={data.invoices}
              rowKey={(row) => row.id}
              columns={[
                { header: t("saas.field.number"), render: (row) => row.number },
                {
                  header: t("saas.field.period"),
                  render: (row) => `${formatDate(row.periodStart)} - ${formatDate(row.periodEnd)}`,
                },
                {
                  header: t("saas.field.amount"),
                  align: "right",
                  render: (row) => `${formatAmount(row.amount)} ${row.currency}`,
                },
                { header: t("saas.field.dueOn"), render: (row) => formatDate(row.dueOn) },
                {
                  header: t("saas.field.status"),
                  render: (row) => t(`saas.invoiceStatus.${row.status}`),
                },
              ]}
            />
          </Card>
          <Alert severity="info">{t("subscription.contact")}</Alert>
        </>
      )}
    </Stack>
  );
}

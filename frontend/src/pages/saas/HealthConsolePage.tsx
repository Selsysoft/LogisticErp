import { Alert, Stack, TablePagination, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable, QueryState, SectionHeader } from "../finance/common";
import { formatDateTime } from "../operations/common";
import { StatGrid, StatTile } from "../reports/components";
import { adminGet } from "./adminApi";
import { AuditRow, Health } from "./types";

const REFRESH_MILLIS = 30_000;
const SEVERITY = { OK: "success", DEGRADED: "warning", CRITICAL: "error" } as const;
const AUDIT_PAGE_SIZE = 50;

export function HealthConsolePage() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ["saas", "health"],
    queryFn: () => adminGet<Health>("/health"),
    refetchInterval: REFRESH_MILLIS,
  });
  const data = health.data;
  return (
    <Stack spacing={2}>
      <SectionHeader title={t("saas.tabs.health")} />
      <QueryState isPending={health.isPending} error={health.error} />
      {data && (
        <>
          <Alert severity={SEVERITY[data.status]}>
            {t(`saas.healthStatus.${data.status}`)}
            {data.issues.length > 0 && `: ${data.issues.join(" ")}`}
          </Alert>
          <StatGrid>
            <StatTile
              label={t("saas.health.database")}
              value={data.databaseUp ? `${data.databaseMillis} ms` : t("saas.health.down")}
            />
            <StatTile
              label={t("saas.health.connections")}
              value={`${data.connectionsActive} / ${data.connectionsIdle} / ${data.connectionsWaiting}`}
              hint={t("saas.health.connectionsHint")}
            />
            <StatTile
              label={t("saas.health.requests")}
              value={String(data.requests)}
              hint={t("saas.health.sinceStart")}
            />
            <StatTile
              label={t("saas.health.serverErrors")}
              value={String(data.serverErrors)}
              hint={t("saas.health.sinceStart")}
            />
            <StatTile
              label={t("saas.health.online")}
              value={`${data.onlineActive} / ${data.onlineIdle}`}
              hint={t("saas.health.onlineHint")}
            />
            <StatTile
              label={t("saas.health.overdueInvoices")}
              value={String(data.overdueInvoices)}
            />
            {Object.entries(data.tenantsByStatus).map(([status, count]) => (
              <StatTile
                key={status}
                label={t(`saas.tenantStatus.${status}`)}
                value={String(count)}
                hint={t("saas.health.tenants")}
              />
            ))}
          </StatGrid>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
            {t("saas.health.slowest")}
          </Typography>
          <DataTable
            rows={data.slowestEndpoints}
            rowKey={(row) => row.endpoint}
            columns={[
              { header: t("saas.health.endpoint"), render: (row) => row.endpoint },
              { header: t("saas.health.count"), align: "right", render: (row) => row.count },
              {
                header: t("saas.health.mean"),
                align: "right",
                render: (row) => `${row.meanMillis} ms`,
              },
              {
                header: t("saas.health.max"),
                align: "right",
                render: (row) => `${row.maxMillis} ms`,
              },
            ]}
          />
        </>
      )}
    </Stack>
  );
}

export function AuditConsolePage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const logs = useQuery({
    queryKey: ["saas", "audit", page],
    queryFn: () =>
      adminGet<{ content: AuditRow[]; totalElements: number }>(
        `/audit-logs?page=${page}&size=${AUDIT_PAGE_SIZE}`,
      ),
  });
  return (
    <>
      <SectionHeader title={t("saas.tabs.audit")} />
      <QueryState isPending={logs.isPending} error={logs.error} />
      {logs.data && (
        <>
          <DataTable
            rows={logs.data.content}
            rowKey={(row) => row.id}
            columns={[
              { header: t("saas.audit.when"), render: (row) => formatDateTime(row.createdAt) },
              { header: t("saas.audit.event"), render: (row) => row.eventType },
              { header: t("saas.audit.actor"), render: (row) => row.actorEmail ?? "—" },
              { header: t("saas.audit.target"), render: (row) => row.target ?? "—" },
              { header: t("saas.audit.details"), render: (row) => row.details ?? "—" },
            ]}
          />
          <TablePagination
            component="div"
            count={logs.data.totalElements}
            page={page}
            rowsPerPage={AUDIT_PAGE_SIZE}
            rowsPerPageOptions={[AUDIT_PAGE_SIZE]}
            onPageChange={(_, next) => setPage(next)}
          />
        </>
      )}
    </>
  );
}

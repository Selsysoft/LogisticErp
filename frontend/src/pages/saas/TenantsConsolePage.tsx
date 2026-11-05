import { Button, Chip, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FieldDef,
  FormDialog,
  formatDate,
  QueryState,
  SectionHeader,
} from "../finance/common";
import { adminDownload, adminGet, adminRequest } from "./adminApi";
import { availableActions, formatLimit } from "./common";
import { Plan, TenantOverview } from "./types";

const UNLIMITED = "∞";
const DEFAULT_TIME_ZONE = "Europe/Istanbul";
const DEFAULT_CURRENCY = "TRY";

type Dialog =
  { kind: "create" } | { kind: "plan" | "trial" | "suspend" | "close"; tenant: TenantOverview };

export function TenantsConsolePage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const tenants = useQuery({
    queryKey: ["saas", "tenants"],
    queryFn: () => adminGet<TenantOverview[]>("/tenants"),
  });
  const plans = useQuery({
    queryKey: ["saas", "plans"],
    queryFn: () => adminGet<Plan[]>("/plans"),
  });
  const refresh = () => {
    setDialog(null);
    void client.invalidateQueries({ queryKey: ["saas"] });
  };
  const action = useMutation({
    mutationFn: ({ tenant, path }: { tenant: TenantOverview; path: string }) =>
      adminRequest("POST", `/tenants/${tenant.id}/${path}`),
    onSuccess: refresh,
  });
  const download = useMutation({
    mutationFn: (tenant: TenantOverview) =>
      adminDownload(`/tenants/${tenant.id}/export`, `${tenant.code}-veri.zip`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["saas", "audit"] }),
  });
  const planOptions = (plans.data ?? [])
    .filter((plan) => plan.active)
    .map((plan) => ({ value: plan.id, label: `${plan.name} (${plan.code})` }));

  const createFields: FieldDef[] = [
    { name: "code", label: t("saas.field.code"), required: true },
    { name: "name", label: t("saas.field.name"), required: true },
    { name: "ownerEmail", label: t("saas.field.ownerEmail"), required: true },
    { name: "ownerFullName", label: t("saas.field.ownerFullName"), required: true },
    {
      name: "planCode",
      label: t("saas.field.plan"),
      type: "select",
      options: (plans.data ?? [])
        .filter((plan) => plan.active)
        .map((plan) => ({ value: plan.code, label: plan.name })),
    },
    { name: "trialDays", label: t("saas.field.trialDays"), defaultValue: "14", required: true },
  ];

  return (
    <>
      <SectionHeader title={t("saas.tabs.tenants")}>
        <Button variant="contained" onClick={() => setDialog({ kind: "create" })}>
          {t("saas.action.newTenant")}
        </Button>
      </SectionHeader>
      {action.isError && <ErrorState error={action.error} />}
      {download.isError && <ErrorState error={download.error} />}
      <QueryState isPending={tenants.isPending} error={tenants.error} />
      {tenants.data && (
        <DataTable
          rows={tenants.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("saas.field.code"), render: (row) => row.code },
            { header: t("saas.field.name"), render: (row) => row.name },
            {
              header: t("saas.field.status"),
              render: (row) => (
                <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                  <Chip size="small" label={t(`saas.tenantStatus.${row.status}`)} />
                  {row.suspendReason && <span>{t(`saas.suspendReason.${row.suspendReason}`)}</span>}
                </Stack>
              ),
            },
            {
              header: t("saas.field.subscription"),
              render: (row) => (
                <>
                  {row.planName ?? "—"}
                  <br />
                  {row.subscriptionStatus && t(`saas.subscriptionStatus.${row.subscriptionStatus}`)}
                  {row.trialEndsOn && ` · ${formatDate(row.trialEndsOn)}`}
                  {row.nextBillingOn && ` · ${formatDate(row.nextBillingOn)}`}
                </>
              ),
            },
            {
              header: t("saas.field.usage"),
              render: (row) =>
                row.limits.length === 0
                  ? "—"
                  : row.limits.map((limit) => (
                      <div key={limit.resource}>
                        {t(`saas.resource.${limit.resource}`)}: {formatLimit(limit, UNLIMITED)}
                      </div>
                    )),
            },
            {
              header: t("saas.field.online"),
              render: (row) =>
                t("saas.onlineSummary", {
                  active: row.online.active,
                  idle: row.online.idle,
                  disconnected: row.online.disconnected,
                }),
            },
            {
              header: t("saas.field.openInvoices"),
              align: "right",
              render: (row) => row.openInvoices,
            },
            {
              header: "",
              render: (row) => {
                const can = availableActions(row.status, row.subscriptionStatus, row.suspendReason);
                return (
                  <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {can.activate && (
                      <Button
                        size="small"
                        onClick={() => action.mutate({ tenant: row, path: "activate" })}
                      >
                        {t("saas.action.activate")}
                      </Button>
                    )}
                    {can.changePlan && (
                      <Button size="small" onClick={() => setDialog({ kind: "plan", tenant: row })}>
                        {t("saas.action.changePlan")}
                      </Button>
                    )}
                    {can.extendTrial && (
                      <Button
                        size="small"
                        onClick={() => setDialog({ kind: "trial", tenant: row })}
                      >
                        {t("saas.action.extendTrial")}
                      </Button>
                    )}
                    {can.resume && (
                      <Button
                        size="small"
                        onClick={() => action.mutate({ tenant: row, path: "resume" })}
                      >
                        {t("saas.action.resume")}
                      </Button>
                    )}
                    {can.suspend && (
                      <Button
                        size="small"
                        color="warning"
                        onClick={() => setDialog({ kind: "suspend", tenant: row })}
                      >
                        {t("saas.action.suspend")}
                      </Button>
                    )}
                    {can.exportData && (
                      <Button
                        size="small"
                        disabled={download.isPending}
                        onClick={() => download.mutate(row)}
                      >
                        {t("saas.action.export")}
                      </Button>
                    )}
                    {can.close && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => setDialog({ kind: "close", tenant: row })}
                      >
                        {t("saas.action.close")}
                      </Button>
                    )}
                  </Stack>
                );
              },
            },
          ]}
        />
      )}
      {dialog?.kind === "create" && (
        <FormDialog
          title={t("saas.action.newTenant")}
          fields={createFields}
          onClose={() => setDialog(null)}
          onSaved={refresh}
          onSubmit={(values) =>
            adminRequest("POST", "/tenants", {
              code: values.code,
              name: values.name,
              defaultCurrency: DEFAULT_CURRENCY,
              timeZone: DEFAULT_TIME_ZONE,
              ownerEmail: values.ownerEmail,
              ownerFullName: values.ownerFullName,
              planCode: values.planCode || null,
              trialDays: Number(values.trialDays),
            })
          }
        />
      )}
      {dialog?.kind === "plan" && (
        <FormDialog
          title={`${t("saas.action.changePlan")}: ${dialog.tenant.name}`}
          fields={[
            {
              name: "planId",
              label: t("saas.field.plan"),
              type: "select",
              required: true,
              options: planOptions,
              defaultValue: dialog.tenant.planId ?? "",
            },
          ]}
          onClose={() => setDialog(null)}
          onSaved={refresh}
          onSubmit={(values) =>
            adminRequest("PUT", `/tenants/${dialog.tenant.id}/plan`, { planId: values.planId })
          }
        />
      )}
      {dialog?.kind === "trial" && (
        <FormDialog
          title={`${t("saas.action.extendTrial")}: ${dialog.tenant.name}`}
          fields={[
            { name: "until", label: t("saas.field.trialUntil"), type: "date", required: true },
          ]}
          onClose={() => setDialog(null)}
          onSaved={refresh}
          onSubmit={(values) =>
            adminRequest("POST", `/tenants/${dialog.tenant.id}/extend-trial`, {
              until: values.until,
            })
          }
        />
      )}
      {dialog?.kind === "suspend" && (
        <FormDialog
          title={t("saas.confirm.suspend", { name: dialog.tenant.name })}
          fields={[]}
          submitLabel={t("saas.action.suspend")}
          onClose={() => setDialog(null)}
          onSaved={refresh}
          onSubmit={() => adminRequest("POST", `/tenants/${dialog.tenant.id}/suspend`)}
        />
      )}
      {dialog?.kind === "close" && (
        <FormDialog
          title={t("saas.confirm.close", { name: dialog.tenant.name })}
          fields={[
            {
              name: "confirmCode",
              label: t("saas.field.confirmCode", { code: dialog.tenant.code }),
              required: true,
            },
          ]}
          submitLabel={t("saas.action.close")}
          onClose={() => setDialog(null)}
          onSaved={refresh}
          onSubmit={(values) =>
            adminRequest("POST", `/tenants/${dialog.tenant.id}/close`, {
              confirmCode: values.confirmCode,
            })
          }
        />
      )}
    </>
  );
}

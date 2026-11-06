import { Box, Button, Chip, Link, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  useCan,
} from "../finance/common";
import { FleetSettings, Reminder } from "./types";

export function FleetDashboardPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const [editing, setEditing] = useState(false);

  const reminders = useQuery({
    queryKey: ["fleet", "reminders"],
    queryFn: () => apiGet<Reminder[]>("/fleet/reminders"),
  });
  const settings = useQuery({
    queryKey: ["fleet", "settings"],
    queryFn: () => apiGet<FleetSettings>("/fleet/settings"),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["fleet"] });
  const save = useMutation({
    mutationFn: (values: FleetSettings) => apiRequest("PUT", "/fleet/settings", values),
    onSuccess: refresh,
  });

  const subjectPath = (row: Reminder) =>
    row.subjectType === "VEHICLE"
      ? `/fleet/vehicles/${row.subjectId}`
      : `/fleet/drivers/${row.subjectId}`;

  return (
    <Stack spacing={4}>
      <Box>
        <SectionHeader title={t("fleet.sections.reminders")} />
        <QueryState isPending={reminders.isPending} error={reminders.error} />
        {reminders.data && (
          <DataTable
            rows={reminders.data}
            rowKey={(row) => `${row.type}-${row.subjectId}-${row.docType ?? ""}`}
            columns={[
              {
                header: t("fleet.field.subject"),
                render: (r) => (
                  <Link component={RouterLink} to={subjectPath(r)}>
                    {r.subjectName}
                  </Link>
                ),
              },
              {
                header: t("fleet.field.reminderType"),
                render: (r) =>
                  r.docType ? t(`fleet.docType.${r.docType}`) : t(`fleet.reminderType.${r.type}`),
              },
              {
                header: t("finance.field.dueDate"),
                render: (r) =>
                  r.dueDate
                    ? formatDate(r.dueDate)
                    : `${formatAmount(r.currentKm ?? 0)} / ${formatAmount(r.dueKm ?? 0)} km`,
              },
              {
                header: t("finance.field.status"),
                render: (r) => (
                  <Chip
                    size="small"
                    color={r.overdue ? "error" : "warning"}
                    label={r.overdue ? t("fleet.status.overdue") : t("fleet.status.upcoming")}
                  />
                ),
              },
            ]}
          />
        )}
      </Box>
      <Box>
        <SectionHeader title={t("fleet.sections.settings")}>
          {canEdit && settings.data && (
            <Button variant="outlined" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
          )}
        </SectionHeader>
        {save.isError && <ErrorState error={save.error} />}
        <QueryState isPending={settings.isPending} error={settings.error} />
        {settings.data && (
          <Stack spacing={0.5}>
            <div>
              {settings.data.blockOnExpired
                ? t("fleet.settings.blockOn")
                : t("fleet.settings.blockOff")}
            </div>
            <div>{t("fleet.settings.reminderInfo", { days: settings.data.reminderDays })}</div>
            <div>
              {settings.data.reminderEmail
                ? t("fleet.settings.emailOn")
                : t("fleet.settings.emailOff")}
            </div>
          </Stack>
        )}
      </Box>
      {editing && settings.data && (
        <FormDialog
          title={t("fleet.sections.settings")}
          fields={[
            {
              name: "blockOnExpired",
              label: t("fleet.settings.blockLabel"),
              type: "checkbox",
              defaultValue: settings.data.blockOnExpired,
            },
            {
              name: "reminderDays",
              label: t("fleet.settings.reminderDays"),
              required: true,
              defaultValue: String(settings.data.reminderDays),
            },
            {
              name: "reminderEmail",
              label: t("fleet.settings.emailLabel"),
              type: "checkbox",
              defaultValue: settings.data.reminderEmail,
            },
          ]}
          onClose={() => setEditing(false)}
          onSubmit={(values, flags) =>
            apiRequest("PUT", "/fleet/settings", {
              blockOnExpired: flags.blockOnExpired,
              reminderDays: values.reminderDays,
              reminderEmail: flags.reminderEmail,
            })
          }
          onSaved={() => {
            setEditing(false);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

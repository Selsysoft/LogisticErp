import { Alert, Box, Button, Chip, Link, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { DataTable, FormDialog, QueryState, SectionHeader, useCan } from "../finance/common";
import { formatDateTime } from "../operations/common";
import { Geofence, GeofenceEvent, VehiclePosition } from "./types";

export function GpsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const [adding, setAdding] = useState(false);
  const positions = useQuery({
    queryKey: ["integration", "gps", "positions"],
    queryFn: () => apiGet<VehiclePosition[]>("/integration/gps/positions"),
  });
  const zones = useQuery({
    queryKey: ["integration", "gps", "zones"],
    queryFn: () => apiGet<Geofence[]>("/integration/gps/geofences"),
  });
  const events = useQuery({
    queryKey: ["integration", "gps", "events"],
    queryFn: () => apiGet<GeofenceEvent[]>("/integration/gps/events"),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["integration", "gps"] });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/integration/gps/geofences/${id}`),
    onSuccess: refresh,
  });

  return (
    <Stack spacing={3}>
      <Alert severity="info">{t("integrations.notice.gps")}</Alert>
      <Box>
        <SectionHeader title={t("integrations.sections.positions")} />
        <QueryState isPending={positions.isPending} error={positions.error} />
        {positions.data && (
          <DataTable
            rows={positions.data}
            rowKey={(row) => row.vehicleId}
            columns={[
              { header: t("fleet.field.plate"), render: (r) => r.plate },
              { header: t("integrations.field.when"), render: (r) => formatDateTime(r.recordedAt) },
              {
                header: t("integrations.field.location"),
                render: (r) => `${r.latitude}, ${r.longitude}`,
              },
              { header: t("integrations.field.speed"), align: "right", render: (r) => r.speedKmh },
              {
                header: t("customs.field.shipment"),
                render: (r) =>
                  r.shipmentId && (
                    <Link component={RouterLink} to={`/operations/shipments/${r.shipmentId}`}>
                      {r.shipmentNumber}
                    </Link>
                  ),
              },
            ]}
          />
        )}
      </Box>
      <Box>
        <SectionHeader title={t("integrations.sections.geofences")}>
          {canEdit && (
            <Button variant="outlined" onClick={() => setAdding(true)}>
              {t("integrations.action.addGeofence")}
            </Button>
          )}
        </SectionHeader>
        {remove.isError && <ErrorState error={remove.error} />}
        <QueryState isPending={zones.isPending} error={zones.error} />
        {zones.data && (
          <DataTable
            rows={zones.data}
            rowKey={(row) => row.id}
            columns={[
              { header: t("finance.field.name"), render: (r) => r.name },
              {
                header: t("integrations.field.location"),
                render: (r) => `${r.latitude}, ${r.longitude}`,
              },
              {
                header: t("integrations.field.radius"),
                align: "right",
                render: (r) => r.radiusM,
              },
              {
                header: t("common.actions"),
                align: "right",
                render: (r) =>
                  canEdit && (
                    <Button size="small" color="error" onClick={() => remove.mutate(r.id)}>
                      {t("common.delete")}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Box>
      <Box>
        <SectionHeader title={t("integrations.sections.events")} />
        <QueryState isPending={events.isPending} error={events.error} />
        {events.data && (
          <DataTable
            rows={events.data}
            rowKey={(row) => row.id}
            columns={[
              { header: t("integrations.field.when"), render: (r) => formatDateTime(r.occurredAt) },
              { header: t("fleet.field.plate"), render: (r) => r.plate },
              { header: t("finance.field.name"), render: (r) => r.geofenceName },
              {
                header: t("integrations.field.event"),
                render: (r) => (
                  <Chip size="small" label={t(`integrations.geofenceEvent.${r.type}`)} />
                ),
              },
              { header: t("customs.field.shipment"), render: (r) => r.shipmentNumber },
            ]}
          />
        )}
      </Box>
      {adding && (
        <FormDialog
          title={t("integrations.action.addGeofence")}
          fields={[
            { name: "name", label: t("finance.field.name"), required: true },
            { name: "latitude", label: t("integrations.field.latitude"), required: true },
            { name: "longitude", label: t("integrations.field.longitude"), required: true },
            {
              name: "radiusM",
              label: t("integrations.field.radius"),
              required: true,
              defaultValue: "500",
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/integration/gps/geofences", {
              name: values.name,
              latitude: values.latitude.replace(",", "."),
              longitude: values.longitude.replace(",", "."),
              radiusM: Number(values.radiusM),
            })
          }
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

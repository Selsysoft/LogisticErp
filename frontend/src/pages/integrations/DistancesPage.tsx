import { Alert, Button } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatAmount,
  QueryState,
  SectionHeader,
  useCan,
} from "../finance/common";
import { RouteDistance } from "./types";

export function DistancesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("SHIPMENT_DISPATCH");
  const [adding, setAdding] = useState(false);
  const key = ["integration", "distances"];
  const distances = useQuery({
    queryKey: key,
    queryFn: () => apiGet<RouteDistance[]>("/integration/distances"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/integration/distances/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });

  return (
    <>
      <SectionHeader title={t("integrations.tabs.distances")}>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("integrations.action.addDistance")}
          </Button>
        )}
      </SectionHeader>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t("integrations.notice.distances")}
      </Alert>
      {remove.isError && <ErrorState error={remove.error} />}
      <QueryState isPending={distances.isPending} error={distances.error} />
      {distances.data && (
        <DataTable
          rows={distances.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("operations.field.origin"), render: (r) => r.origin },
            { header: t("operations.field.destination"), render: (r) => r.destination },
            {
              header: t("operations.field.distanceKm"),
              align: "right",
              render: (r) => formatAmount(r.distanceKm),
            },
            { header: t("integrations.field.minutes"), align: "right", render: (r) => r.minutes },
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
      {adding && (
        <FormDialog
          title={t("integrations.action.addDistance")}
          fields={[
            { name: "origin", label: t("operations.field.origin"), required: true },
            { name: "destination", label: t("operations.field.destination"), required: true },
            {
              name: "distanceKm",
              label: t("operations.field.distanceKm"),
              type: "amount",
              required: true,
            },
            { name: "minutes", label: t("integrations.field.minutes"), required: true },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/integration/distances", {
              ...values,
              minutes: Number(values.minutes),
            })
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: key });
          }}
        />
      )}
    </>
  );
}

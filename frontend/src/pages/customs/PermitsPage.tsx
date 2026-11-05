import { Button } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import {
  DataTable,
  FormDialog,
  formatDate,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  useCan,
} from "../finance/common";
import { useCustomsOptions } from "./common";
import { Permit } from "./types";

const KINDS = ["BILATERAL", "MULTILATERAL", "TRANSIT"];
const DEFAULT_PERMIT_DAYS = 365;

export function PermitsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CUSTOMS_EDIT");
  const options = useCustomsOptions();
  const [adding, setAdding] = useState(false);
  const [using, setUsing] = useState<Permit | null>(null);
  const permits = useQuery({
    queryKey: ["customs", "permits"],
    queryFn: () => apiGet<Permit[]>("/customs/permits"),
  });
  const refresh = () => {
    setAdding(false);
    setUsing(null);
    void client.invalidateQueries({ queryKey: ["customs"] });
  };

  return (
    <>
      <SectionHeader title={t("customs.tabs.permits")}>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("customs.action.newPermit")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={permits.isPending} error={permits.error} />
      {permits.data && (
        <DataTable
          rows={permits.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.number"), render: (r) => r.number },
            { header: t("customs.field.kind"), render: (r) => t(`customs.permitKind.${r.kind}`) },
            { header: t("customs.field.country"), render: (r) => r.country },
            {
              header: t("customs.field.validity"),
              render: (r) => `${formatDate(r.validFrom)} – ${formatDate(r.validTo)}`,
            },
            {
              header: t("customs.field.quota"),
              align: "right",
              render: (r) => `${r.used} / ${r.quota}`,
            },
            {
              header: t("customs.field.usedBy"),
              render: (r) => r.usages.map((usage) => usage.shipmentNumber).join(", "),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canEdit &&
                r.used < r.quota && (
                  <Button size="small" onClick={() => setUsing(r)}>
                    {t("customs.action.usePermit")}
                  </Button>
                ),
            },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("customs.action.newPermit")}
          fields={[
            { name: "number", label: t("finance.field.number"), required: true },
            {
              name: "kind",
              label: t("customs.field.kind"),
              type: "select",
              required: true,
              defaultValue: "BILATERAL",
              options: KINDS.map((value) => ({
                value,
                label: t(`customs.permitKind.${value}`),
              })),
            },
            { name: "country", label: t("customs.field.country"), required: true },
            {
              name: "validFrom",
              label: t("finance.field.from"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "validTo",
              label: t("finance.field.to"),
              type: "date",
              required: true,
              defaultValue: shiftDays(today(), DEFAULT_PERMIT_DAYS),
            },
            { name: "quota", label: t("customs.field.quota"), required: true, defaultValue: "1" },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/customs/permits", { ...values, quota: Number(values.quota) })
          }
          onSaved={refresh}
        />
      )}
      {using && options.data && (
        <FormDialog
          title={`${t("customs.action.usePermit")} · ${using.number}`}
          fields={[
            {
              name: "shipmentId",
              label: t("customs.field.shipment"),
              type: "select",
              required: true,
              options: options.data.shipments.map((s) => ({ value: s.id, label: s.label })),
            },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
          ]}
          onClose={() => setUsing(null)}
          onSubmit={(values) => apiRequest("POST", `/customs/permits/${using.id}/usages`, values)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

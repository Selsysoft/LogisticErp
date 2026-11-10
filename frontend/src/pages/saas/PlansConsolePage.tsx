import { Button } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DataTable,
  FieldDef,
  FormDialog,
  formatAmount,
  QueryState,
  SectionHeader,
} from "../finance/common";
import { adminGet, adminRequest } from "./adminApi";
import { Plan } from "./types";

const UNLIMITED = "∞";

function limitValue(value: string) {
  return value === "" ? null : Number(value);
}

export function PlansConsolePage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const plans = useQuery({
    queryKey: ["saas", "plans"],
    queryFn: () => adminGet<Plan[]>("/plans"),
  });
  const current = editing !== "new" ? editing : null;
  const fields: FieldDef[] = [
    {
      name: "code",
      label: t("saas.field.planCode"),
      required: true,
      defaultValue: current?.code ?? "",
      helperText: current ? t("saas.planCodeFixed") : undefined,
    },
    {
      name: "name",
      label: t("saas.field.name"),
      required: true,
      defaultValue: current?.name ?? "",
    },
    {
      name: "monthlyPrice",
      label: t("saas.field.monthlyPrice"),
      type: "amount",
      required: true,
      defaultValue: current?.monthlyPrice.toString() ?? "",
    },
    {
      name: "currency",
      label: t("saas.field.currency"),
      required: true,
      defaultValue: current?.currency ?? "TRY",
    },
    {
      name: "maxUsers",
      label: t("saas.resource.USERS"),
      helperText: t("saas.emptyIsUnlimited"),
      defaultValue: current?.maxUsers?.toString() ?? "",
    },
    {
      name: "maxVehicles",
      label: t("saas.resource.VEHICLES"),
      helperText: t("saas.emptyIsUnlimited"),
      defaultValue: current?.maxVehicles?.toString() ?? "",
    },
    {
      name: "maxShipmentsMonth",
      label: t("saas.resource.SHIPMENTS_MONTH"),
      helperText: t("saas.emptyIsUnlimited"),
      defaultValue: current?.maxShipmentsMonth?.toString() ?? "",
    },
    {
      name: "active",
      label: t("saas.field.planActive"),
      type: "checkbox",
      defaultValue: current?.active ?? true,
    },
  ];

  return (
    <>
      <SectionHeader title={t("saas.tabs.plans")}>
        <Button variant="contained" onClick={() => setEditing("new")}>
          {t("saas.action.newPlan")}
        </Button>
      </SectionHeader>
      <QueryState isPending={plans.isPending} error={plans.error} />
      {plans.data && (
        <DataTable
          rows={plans.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("saas.field.planCode"), render: (row) => row.code },
            { header: t("saas.field.name"), render: (row) => row.name },
            {
              header: t("saas.field.monthlyPrice"),
              align: "right",
              render: (row) => `${formatAmount(row.monthlyPrice)} ${row.currency}`,
            },
            {
              header: t("saas.resource.USERS"),
              align: "right",
              render: (row) => row.maxUsers ?? UNLIMITED,
            },
            {
              header: t("saas.resource.VEHICLES"),
              align: "right",
              render: (row) => row.maxVehicles ?? UNLIMITED,
            },
            {
              header: t("saas.resource.SHIPMENTS_MONTH"),
              align: "right",
              render: (row) => row.maxShipmentsMonth ?? UNLIMITED,
            },
            {
              header: t("saas.field.planActive"),
              render: (row) => (row.active ? t("saas.yes") : t("saas.no")),
            },
            {
              header: "",
              render: (row) => (
                <Button size="small" onClick={() => setEditing(row)}>
                  {t("common.edit")}
                </Button>
              ),
            },
          ]}
        />
      )}
      {editing && (
        <FormDialog
          title={current ? current.name : t("saas.action.newPlan")}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void client.invalidateQueries({ queryKey: ["saas"] });
          }}
          onSubmit={(values, flags) => {
            const body = {
              code: current?.code ?? values.code,
              name: values.name,
              monthlyPrice: values.monthlyPrice,
              currency: values.currency,
              maxUsers: limitValue(values.maxUsers),
              maxVehicles: limitValue(values.maxVehicles),
              maxShipmentsMonth: limitValue(values.maxShipmentsMonth),
              active: flags.active,
            };
            return current
              ? adminRequest("PUT", `/plans/${current.id}`, body)
              : adminRequest("POST", "/plans", body);
          }}
        />
      )}
    </>
  );
}

import { Box, Button, Stack } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../api/client";
import { orNull } from "../crm/common";
import {
  DataTable,
  FormDialog,
  formatAmount,
  QueryState,
  SectionHeader,
  useBranches,
  useCan,
} from "../finance/common";
import { useBins, useStockItems, useWarehouseOptions, useWarehouses } from "./common";
import { Warehouse } from "./types";

export function DefinitionsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("WAREHOUSE_EDIT");
  const warehouses = useWarehouses();
  const bins = useBins();
  const items = useStockItems();
  const branches = useBranches();
  const options = useWarehouseOptions();
  const [dialog, setDialog] = useState<"warehouse" | "item" | null>(null);
  const [binFor, setBinFor] = useState<Warehouse | null>(null);

  const refresh = () => {
    setDialog(null);
    setBinFor(null);
    void client.invalidateQueries({ queryKey: ["warehouse"] });
  };
  const warehouseName = (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "";

  return (
    <Stack spacing={4}>
      <Box>
        <SectionHeader title={t("warehouse.sections.warehouses")}>
          {canEdit && (
            <Button variant="contained" onClick={() => setDialog("warehouse")}>
              {t("warehouse.action.newWarehouse")}
            </Button>
          )}
        </SectionHeader>
        <QueryState isPending={warehouses.isPending} error={warehouses.error} />
        {warehouses.data && (
          <DataTable
            rows={warehouses.data}
            rowKey={(row) => row.id}
            columns={[
              { header: t("finance.field.code"), render: (r) => r.code },
              { header: t("finance.field.name"), render: (r) => r.name },
              {
                header: t("warehouse.field.regime"),
                render: (r) =>
                  r.bonded
                    ? `${t("warehouse.field.bonded")}${r.customsNo ? ` · ${r.customsNo}` : ""}`
                    : t("warehouse.field.normal"),
              },
              {
                header: t("common.actions"),
                align: "right",
                render: (r) =>
                  canEdit && (
                    <Button size="small" onClick={() => setBinFor(r)}>
                      {t("warehouse.action.newBin")}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Box>
      <Box>
        <SectionHeader title={t("warehouse.sections.bins")} />
        <QueryState isPending={bins.isPending} error={bins.error} />
        {bins.data && (
          <DataTable
            rows={bins.data}
            rowKey={(row) => row.id}
            columns={[
              {
                header: t("warehouse.field.warehouse"),
                render: (r) => warehouseName(r.warehouseId),
              },
              { header: t("warehouse.field.bin"), render: (r) => r.code },
              { header: t("finance.field.description"), render: (r) => r.description },
            ]}
          />
        )}
      </Box>
      <Box>
        <SectionHeader title={t("warehouse.sections.items")}>
          {canEdit && (
            <Button variant="contained" onClick={() => setDialog("item")}>
              {t("warehouse.action.newItem")}
            </Button>
          )}
        </SectionHeader>
        <QueryState isPending={items.isPending} error={items.error} />
        {items.data && (
          <DataTable
            rows={items.data}
            rowKey={(row) => row.id}
            columns={[
              { header: t("warehouse.field.owner"), render: (r) => r.accountName },
              { header: t("warehouse.field.sku"), render: (r) => r.sku },
              { header: t("finance.field.name"), render: (r) => r.name },
              { header: t("warehouse.field.unit"), render: (r) => r.unit },
              {
                header: t("warehouse.field.unitsPerBillingUnit"),
                align: "right",
                render: (r) => formatAmount(r.unitsPerBillingUnit),
              },
            ]}
          />
        )}
      </Box>
      {dialog === "warehouse" && branches.data && (
        <FormDialog
          title={t("warehouse.action.newWarehouse")}
          fields={[
            { name: "code", label: t("finance.field.code"), required: true },
            { name: "name", label: t("finance.field.name"), required: true },
            {
              name: "branchId",
              label: t("finance.field.branch"),
              type: "select",
              required: true,
              options: branches.data.map((b) => ({ value: b.id, label: b.name })),
            },
            { name: "address", label: t("warehouse.field.address") },
            { name: "bonded", label: t("warehouse.field.bondedQuestion"), type: "checkbox" },
            { name: "customsNo", label: t("warehouse.field.customsNo") },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values, flags) =>
            apiRequest("POST", "/warehouse/warehouses", {
              code: values.code,
              name: values.name,
              branchId: values.branchId,
              address: orNull(values.address),
              bonded: flags.bonded,
              customsNo: orNull(values.customsNo),
            })
          }
          onSaved={refresh}
        />
      )}
      {binFor && (
        <FormDialog
          title={`${t("warehouse.action.newBin")} · ${binFor.name}`}
          fields={[
            { name: "code", label: t("warehouse.field.bin"), required: true },
            { name: "description", label: t("finance.field.description") },
          ]}
          onClose={() => setBinFor(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/warehouse/warehouses/${binFor.id}/bins`, {
              code: values.code,
              description: orNull(values.description),
            })
          }
          onSaved={refresh}
        />
      )}
      {dialog === "item" && options.data && (
        <FormDialog
          title={t("warehouse.action.newItem")}
          fields={[
            {
              name: "accountId",
              label: t("warehouse.field.owner"),
              type: "select",
              required: true,
              options: options.data.customers.map((c) => ({ value: c.id, label: c.label })),
            },
            { name: "sku", label: t("warehouse.field.sku"), required: true },
            { name: "name", label: t("finance.field.name"), required: true },
            {
              name: "unit",
              label: t("warehouse.field.unit"),
              required: true,
              defaultValue: "KOLİ",
            },
            {
              name: "unitsPerBillingUnit",
              label: t("warehouse.field.unitsPerBillingUnit"),
              type: "amount",
              required: true,
              defaultValue: "1",
              helperText: t("warehouse.field.unitsPerBillingUnitHelp"),
            },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values) => apiRequest("POST", "/warehouse/items", values)}
          onSaved={refresh}
        />
      )}
    </Stack>
  );
}

import { Button } from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  today,
  useCan,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import { Movement } from "./types";

export function MovementsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("WAREHOUSE_EDIT");
  const paging = usePaging();
  const [reversing, setReversing] = useState<Movement | null>(null);

  const movements = useQuery({
    queryKey: ["warehouse", "movements", paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Movement>>(
        `/warehouse/movements?page=${paging.page}&size=${paging.size}&sort=movedOn,desc&sort=createdAt,desc`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <SectionHeader title={t("warehouse.tabs.movements")} />
      <QueryState isPending={movements.isPending} error={movements.error} />
      {movements.data && (
        <DataTable
          rows={movements.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.date"), render: (r) => formatDate(r.movedOn) },
            {
              header: t("warehouse.field.movementType"),
              render: (r) => t(`warehouse.movementType.${r.type}`),
            },
            { header: t("warehouse.field.owner"), render: (r) => r.accountName },
            { header: t("warehouse.field.sku"), render: (r) => `${r.sku} · ${r.itemName}` },
            {
              header: t("warehouse.field.bin"),
              render: (r) => `${r.warehouseName} · ${r.binCode}`,
            },
            { header: t("warehouse.field.lot"), render: (r) => r.lotNo },
            {
              header: t("warehouse.field.quantity"),
              align: "right",
              render: (r) => formatAmount(r.quantity),
            },
            { header: t("warehouse.field.reference"), render: (r) => r.reference },
            { header: t("operations.field.createdBy"), render: (r) => r.createdBy },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canEdit &&
                r.reversible && (
                  <Button size="small" color="error" onClick={() => setReversing(r)}>
                    {t("warehouse.action.reverse")}
                  </Button>
                ),
            },
          ]}
          pagination={{
            count: movements.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {reversing && (
        <FormDialog
          title={`${t("warehouse.action.reverse")} · ${reversing.sku}`}
          fields={[
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
          ]}
          onClose={() => setReversing(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/warehouse/movements/${reversing.id}/reverse`, {
              date: values.date,
            })
          }
          onSaved={() => {
            setReversing(null);
            void client.invalidateQueries({ queryKey: ["warehouse"] });
          }}
        />
      )}
    </>
  );
}

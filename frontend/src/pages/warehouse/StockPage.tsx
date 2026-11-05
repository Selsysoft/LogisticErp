import { Button, Chip, MenuItem, TextField } from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { orNull } from "../crm/common";
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
import {
  canIssue,
  CUSTOMS_COLORS,
  useBins,
  useStockItems,
  useWarehouseOptions,
  useWarehouses,
} from "./common";
import { Balance } from "./types";

function ReceiptDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const items = useStockItems();
  const bins = useBins();
  const warehouses = useWarehouses();
  const options = useWarehouseOptions();
  if (!items.data || !bins.data || !warehouses.data || !options.data) {
    return null;
  }
  const warehouseName = (id: string) => warehouses.data.find((w) => w.id === id)?.name ?? "";
  return (
    <FormDialog
      title={t("warehouse.action.receipt")}
      fields={[
        {
          name: "itemId",
          label: t("warehouse.field.item"),
          type: "select",
          required: true,
          options: items.data.map((item) => ({
            value: item.id,
            label: `${item.accountName} · ${item.sku} · ${item.name}`,
          })),
        },
        {
          name: "binId",
          label: t("warehouse.field.bin"),
          type: "select",
          required: true,
          options: bins.data.map((bin) => ({
            value: bin.id,
            label: `${warehouseName(bin.warehouseId)} · ${bin.code}`,
          })),
        },
        { name: "lotNo", label: t("warehouse.field.lot") },
        { name: "expiryDate", label: t("warehouse.field.expiry"), type: "date" },
        { name: "quantity", label: t("warehouse.field.quantity"), type: "amount", required: true },
        {
          name: "date",
          label: t("finance.field.date"),
          type: "date",
          required: true,
          defaultValue: today(),
        },
        {
          name: "shipmentId",
          label: t("warehouse.field.shipment"),
          type: "select",
          options: options.data.shipments.map((s) => ({ value: s.id, label: s.label })),
        },
        { name: "reference", label: t("warehouse.field.reference") },
      ]}
      onClose={onClose}
      onSubmit={(values) =>
        apiRequest("POST", "/warehouse/receipts", {
          itemId: values.itemId,
          binId: values.binId,
          lotNo: orNull(values.lotNo),
          expiryDate: orNull(values.expiryDate),
          quantity: values.quantity,
          date: values.date,
          shipmentId: orNull(values.shipmentId),
          reference: orNull(values.reference),
        })
      }
      onSaved={onSaved}
    />
  );
}

function IssueDialog({
  balance,
  onClose,
  onSaved,
}: {
  balance: Balance;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const options = useWarehouseOptions();
  if (!options.data) {
    return null;
  }
  return (
    <FormDialog
      title={`${t("warehouse.action.issue")} · ${balance.sku} (${formatAmount(balance.quantity)})`}
      fields={[
        { name: "quantity", label: t("warehouse.field.quantity"), type: "amount", required: true },
        {
          name: "date",
          label: t("finance.field.date"),
          type: "date",
          required: true,
          defaultValue: today(),
        },
        {
          name: "shipmentId",
          label: t("warehouse.field.shipment"),
          type: "select",
          options: options.data.shipments.map((s) => ({ value: s.id, label: s.label })),
        },
        { name: "reference", label: t("warehouse.field.reference") },
      ]}
      onClose={onClose}
      onSubmit={(values) =>
        apiRequest("POST", "/warehouse/issues", {
          balanceId: balance.id,
          quantity: values.quantity,
          date: values.date,
          shipmentId: orNull(values.shipmentId),
          reference: orNull(values.reference),
        })
      }
      onSaved={onSaved}
    />
  );
}

function ReleaseDialog({
  balance,
  onClose,
  onSaved,
}: {
  balance: Balance;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  return (
    <FormDialog
      title={`${t("warehouse.action.release")} · ${balance.sku}`}
      fields={[
        { name: "quantity", label: t("warehouse.field.quantity"), type: "amount", required: true },
        {
          name: "date",
          label: t("finance.field.date"),
          type: "date",
          required: true,
          defaultValue: today(),
        },
        { name: "reference", label: t("warehouse.field.declaration"), required: true },
      ]}
      onClose={onClose}
      onSubmit={(values) =>
        apiRequest("POST", "/warehouse/customs-releases", {
          balanceId: balance.id,
          quantity: values.quantity,
          date: values.date,
          reference: values.reference,
        })
      }
      onSaved={onSaved}
    />
  );
}

export function StockPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("WAREHOUSE_EDIT");
  const paging = usePaging();
  const warehouses = useWarehouses();
  const [warehouseId, setWarehouseId] = useState("");
  const [expiresBy, setExpiresBy] = useState("");
  const [receipt, setReceipt] = useState(false);
  const [issue, setIssue] = useState<Balance | null>(null);
  const [release, setRelease] = useState<Balance | null>(null);

  const balances = useQuery({
    queryKey: ["warehouse", "balances", warehouseId, expiresBy, paging.page, paging.size],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(paging.page),
        size: String(paging.size),
      });
      if (warehouseId) {
        params.set("warehouseId", warehouseId);
      }
      if (expiresBy) {
        params.set("expiresBy", expiresBy);
      }
      return apiGet<Page<Balance>>(`/warehouse/balances?${params}`);
    },
    placeholderData: keepPreviousData,
  });
  const refresh = () => {
    setReceipt(false);
    setIssue(null);
    setRelease(null);
    void client.invalidateQueries({ queryKey: ["warehouse"] });
  };

  return (
    <>
      <SectionHeader title={t("warehouse.tabs.stock")}>
        <TextField
          select
          size="small"
          label={t("warehouse.field.warehouse")}
          value={warehouseId}
          onChange={(event) => {
            setWarehouseId(event.target.value);
            paging.setPage(0);
          }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">—</MenuItem>
          {warehouses.data?.map((warehouse) => (
            <MenuItem key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label={t("warehouse.field.expiresBy")}
          value={expiresBy}
          onChange={(event) => {
            setExpiresBy(event.target.value);
            paging.setPage(0);
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {canEdit && (
          <Button variant="contained" onClick={() => setReceipt(true)}>
            {t("warehouse.action.receipt")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={balances.isPending} error={balances.error} />
      {balances.data && (
        <DataTable
          rows={balances.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("warehouse.field.owner"), render: (r) => r.accountName },
            { header: t("warehouse.field.sku"), render: (r) => `${r.sku} · ${r.itemName}` },
            {
              header: t("warehouse.field.bin"),
              render: (r) => `${r.warehouseName} · ${r.binCode}`,
            },
            { header: t("warehouse.field.lot"), render: (r) => r.lotNo },
            {
              header: t("warehouse.field.expiry"),
              render: (r) => (r.expiryDate ? formatDate(r.expiryDate) : ""),
            },
            {
              header: t("warehouse.field.customs"),
              render: (r) =>
                r.customsStatus !== "NONE" && (
                  <Chip
                    size="small"
                    color={CUSTOMS_COLORS[r.customsStatus]}
                    label={t(`warehouse.customs.${r.customsStatus}`)}
                  />
                ),
            },
            {
              header: t("warehouse.field.quantity"),
              align: "right",
              render: (r) => `${formatAmount(r.quantity)} ${r.unit}`,
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canEdit &&
                (canIssue(r.customsStatus) ? (
                  <Button size="small" onClick={() => setIssue(r)}>
                    {t("warehouse.action.issue")}
                  </Button>
                ) : (
                  <Button size="small" onClick={() => setRelease(r)}>
                    {t("warehouse.action.release")}
                  </Button>
                )),
            },
          ]}
          pagination={{
            count: balances.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {receipt && <ReceiptDialog onClose={() => setReceipt(false)} onSaved={refresh} />}
      {issue && <IssueDialog balance={issue} onClose={() => setIssue(null)} onSaved={refresh} />}
      {release && (
        <ReleaseDialog balance={release} onClose={() => setRelease(null)} onSaved={refresh} />
      )}
    </>
  );
}

import { Alert, Button, Chip, Link, Stack, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { orNull } from "../crm/common";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  normalizeAmount,
  QueryState,
  SectionHeader,
  today,
  useCan,
} from "../finance/common";
import { useBins, useStockItems, useWarehouses } from "./common";
import { CountDetail, CountLine, CountSummary } from "./types";

export function CountsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const canEdit = useCan("WAREHOUSE_EDIT");
  const warehouses = useWarehouses();
  const [opening, setOpening] = useState(false);
  const counts = useQuery({
    queryKey: ["warehouse", "counts"],
    queryFn: () => apiGet<CountSummary[]>("/warehouse/counts"),
  });

  return (
    <>
      <SectionHeader title={t("warehouse.tabs.counts")}>
        {canEdit && (
          <Button variant="contained" onClick={() => setOpening(true)}>
            {t("warehouse.action.openCount")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={counts.isPending} error={counts.error} />
      {counts.data && (
        <DataTable
          rows={counts.data}
          rowKey={(row) => row.id}
          columns={[
            {
              header: t("finance.field.number"),
              render: (r) => (
                <Link component={RouterLink} to={`/warehouse/counts/${r.id}`}>
                  {r.number}
                </Link>
              ),
            },
            { header: t("warehouse.field.warehouse"), render: (r) => r.warehouseName },
            { header: t("finance.field.date"), render: (r) => formatDate(r.date) },
            {
              header: t("finance.field.status"),
              render: (r) => (
                <Chip
                  size="small"
                  color={r.status === "OPEN" ? "warning" : "default"}
                  label={t(`warehouse.countStatus.${r.status}`)}
                />
              ),
            },
          ]}
        />
      )}
      {opening && warehouses.data && (
        <FormDialog
          title={t("warehouse.action.openCount")}
          fields={[
            {
              name: "warehouseId",
              label: t("warehouse.field.warehouse"),
              type: "select",
              required: true,
              helperText: t("warehouse.notice.countBlocks"),
              options: warehouses.data.map((w) => ({ value: w.id, label: w.name })),
            },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
          ]}
          onClose={() => setOpening(false)}
          onSubmit={async (values) => {
            const created = await apiRequest<CountDetail>("POST", "/warehouse/counts", values);
            navigate(`/warehouse/counts/${created.count.id}`);
          }}
          onSaved={() => {
            setOpening(false);
            void client.invalidateQueries({ queryKey: ["warehouse"] });
          }}
        />
      )}
    </>
  );
}

/** Sayılan miktar alanı; odak kaybedilince kaydeder. */
function CountInput({ line, onSaved }: { line: CountLine; onSaved: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(line.countedQuantity ?? "");
  const save = useMutation({
    mutationFn: (quantity: string) =>
      apiRequest("PUT", `/warehouse/count-lines/${line.id}`, { countedQuantity: quantity }),
    onSuccess: onSaved,
  });
  return (
    <TextField
      size="small"
      value={value}
      error={save.isError}
      helperText={save.isError ? t("warehouse.notice.countSaveFailed") : undefined}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const quantity = normalizeAmount(value);
        if (/^\d+(\.\d{1,3})?$/.test(quantity) && quantity !== line.countedQuantity) {
          save.mutate(quantity);
        }
      }}
      slotProps={{
        htmlInput: {
          inputMode: "decimal",
          "aria-label": `${line.binCode} ${line.sku}`,
          style: { textAlign: "right", width: 90 },
        },
      }}
    />
  );
}

export function CountDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const canEdit = useCan("WAREHOUSE_EDIT");
  const items = useStockItems();
  const bins = useBins();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const key = ["warehouse", "counts", id];
  const count = useQuery({
    queryKey: key,
    queryFn: () => apiGet<CountDetail>(`/warehouse/counts/${id}`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const post = useMutation({
    mutationFn: () => apiRequest("POST", `/warehouse/counts/${id}/post`),
    onSuccess: () => {
      setConfirming(false);
      void client.invalidateQueries({ queryKey: ["warehouse"] });
    },
  });

  if (!count.data) {
    return <QueryState isPending={count.isPending} error={count.error} />;
  }
  const open = count.data.count.status === "OPEN" && canEdit;
  const differences = count.data.lines.filter(
    (line) => line.difference !== null && Number(line.difference) !== 0,
  );

  return (
    <Stack spacing={2}>
      <SectionHeader
        title={`${count.data.count.number} · ${count.data.count.warehouseName} · ${formatDate(count.data.count.date)}`}
      >
        <Chip label={t(`warehouse.countStatus.${count.data.count.status}`)} />
        {open && (
          <>
            <Button variant="outlined" onClick={() => setAdding(true)}>
              {t("warehouse.action.addCountLine")}
            </Button>
            <Button variant="contained" onClick={() => setConfirming(true)}>
              {t("warehouse.action.postCount")}
            </Button>
          </>
        )}
      </SectionHeader>
      {post.isError && <ErrorState error={post.error} />}
      {confirming && (
        <Alert
          severity="warning"
          action={
            <>
              <Button color="inherit" size="small" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                color="inherit"
                size="small"
                disabled={post.isPending}
                onClick={() => post.mutate()}
              >
                {t("warehouse.action.postCount")}
              </Button>
            </>
          }
        >
          {t("warehouse.notice.postCount", { count: differences.length })}
        </Alert>
      )}
      <DataTable
        rows={count.data.lines}
        rowKey={(row) => row.id}
        columns={[
          { header: t("warehouse.field.bin"), render: (r) => r.binCode },
          { header: t("warehouse.field.owner"), render: (r) => r.accountName },
          { header: t("warehouse.field.sku"), render: (r) => `${r.sku} · ${r.itemName}` },
          { header: t("warehouse.field.lot"), render: (r) => r.lotNo },
          {
            header: t("warehouse.field.systemQuantity"),
            align: "right",
            render: (r) => formatAmount(r.systemQuantity),
          },
          {
            header: t("warehouse.field.countedQuantity"),
            align: "right",
            render: (r) =>
              open ? (
                <CountInput line={r} onSaved={() => void refresh()} />
              ) : (
                formatAmount(r.countedQuantity ?? 0)
              ),
          },
          {
            header: t("warehouse.field.difference"),
            align: "right",
            render: (r) => (r.difference === null ? "" : formatAmount(r.difference)),
          },
        ]}
      />
      {adding && items.data && bins.data && (
        <FormDialog
          title={t("warehouse.action.addCountLine")}
          fields={[
            {
              name: "binId",
              label: t("warehouse.field.bin"),
              type: "select",
              required: true,
              options: bins.data
                .filter((bin) => bin.warehouseId === count.data.count.warehouseId)
                .map((bin) => ({ value: bin.id, label: bin.code })),
            },
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
            { name: "lotNo", label: t("warehouse.field.lot") },
            { name: "expiryDate", label: t("warehouse.field.expiry"), type: "date" },
            {
              name: "countedQuantity",
              label: t("warehouse.field.countedQuantity"),
              type: "amount",
              required: true,
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/warehouse/counts/${id}/lines`, {
              binId: values.binId,
              itemId: values.itemId,
              lotNo: orNull(values.lotNo),
              expiryDate: orNull(values.expiryDate),
              countedQuantity: values.countedQuantity,
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

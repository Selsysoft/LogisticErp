import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiUpload } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { DataTable, formatAmount, formatDate, today } from "../finance/common";
import { useWarehouses } from "./common";
import { OPENING_STOCK_SAMPLE, downloadCsv } from "../importSamples";

interface Result {
  applied: boolean;
  valid: boolean;
  itemsToCreate: number;
  binsToCreate: number;
  receipts: number;
  rows: {
    line: number;
    accountCode: string | null;
    sku: string | null;
    name: string | null;
    bin: string | null;
    lot: string | null;
    expiry: string | null;
    quantity: string | null;
    unit: string | null;
    newItem: boolean;
    newBin: boolean;
    status: "READY" | "ERROR";
    error: string | null;
  }[];
}

function downloadSample() {
  downloadCsv(OPENING_STOCK_SAMPLE, "acilis-stogu-ornek.csv");
}

/**
 * Önceki sistemden depodaki müşteri mallarının açılış stoğu. Önce önizlenir; içe aktarma ya hep ya
 * hiçtir. Her satır "Açılış stoğu" referanslı bir giriş olur ve giriş gibi ters çevrilir.
 */
export function OpeningStockDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const warehouses = useWarehouses();
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const send = (path: string) => {
    const form = new FormData();
    form.append("file", file!);
    form.append("warehouseId", warehouseId);
    form.append("date", date);
    return apiUpload<Result>(`/warehouse/opening-stock${path}`, form);
  };
  const preview = useMutation({ mutationFn: () => send("/preview"), onSuccess: setResult });
  const apply = useMutation({
    mutationFn: () => send(""),
    onSuccess: (data) => {
      setResult(data);
      onImported();
    },
  });
  const reset = () => {
    setResult(null);
    preview.reset();
    apply.reset();
  };
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    event.target.value = "";
    reset();
  };
  const ready = !!file && !!warehouseId && !!date;
  const errorCount = result?.rows.filter((row) => row.status === "ERROR").length ?? 0;
  const counts = result && {
    items: result.itemsToCreate,
    bins: result.binsToCreate,
    receipts: result.receipts,
  };

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{t("warehouse.opening.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("warehouse.opening.intro")}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select
              size="small"
              label={t("warehouse.field.warehouse")}
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
                reset();
              }}
              sx={{ minWidth: 200 }}
            >
              {(warehouses.data ?? []).map((warehouse) => (
                <MenuItem key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="date"
              label={t("warehouse.opening.date")}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                reset();
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button variant="outlined" component="label">
              {file ? file.name : t("warehouse.opening.pick")}
              <input hidden type="file" accept=".csv,.txt" onChange={onPick} />
            </Button>
            <Button onClick={downloadSample}>{t("warehouse.opening.sample")}</Button>
          </Stack>
          {preview.isError && <ErrorState error={preview.error} />}
          {apply.isError && <ErrorState error={apply.error} />}
          {result?.applied && counts && (
            <Alert severity="success">{t("warehouse.opening.applied", counts)}</Alert>
          )}
          {result && !result.applied && counts && (
            <Alert severity={result.valid ? "info" : "warning"}>
              {result.valid
                ? t("warehouse.opening.ready", counts)
                : t("warehouse.opening.invalid", { count: errorCount })}
            </Alert>
          )}
          {result && (
            <DataTable
              rows={result.rows}
              rowKey={(row) => String(row.line)}
              columns={[
                { header: t("warehouse.opening.line"), render: (row) => row.line },
                { header: t("warehouse.field.owner"), render: (row) => row.accountCode },
                {
                  header: t("warehouse.field.sku"),
                  render: (row) => [row.sku, row.name].filter(Boolean).join(" · "),
                },
                { header: t("warehouse.field.bin"), render: (row) => row.bin },
                { header: t("warehouse.field.lot"), render: (row) => row.lot },
                {
                  header: t("warehouse.field.expiry"),
                  render: (row) => (row.expiry ? formatDate(row.expiry) : ""),
                },
                {
                  header: t("warehouse.field.quantity"),
                  align: "right",
                  render: (row) =>
                    row.quantity === null ? "" : `${formatAmount(row.quantity)} ${row.unit ?? ""}`,
                },
                {
                  header: t("finance.field.status"),
                  render: (row) => (
                    <Stack spacing={0.5}>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                        <Chip
                          size="small"
                          color={row.status === "ERROR" ? "error" : "success"}
                          label={t(`warehouse.opening.status.${row.status}`)}
                        />
                        {row.newItem && (
                          <Chip size="small" color="info" label={t("warehouse.opening.newItem")} />
                        )}
                        {row.newBin && (
                          <Chip size="small" color="info" label={t("warehouse.opening.newBin")} />
                        )}
                      </Stack>
                      {row.error && (
                        <Typography variant="caption" color="error">
                          {row.error}
                        </Typography>
                      )}
                    </Stack>
                  ),
                },
              ]}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("finance.action.close")}</Button>
        {!result?.applied && (
          <Button
            variant="outlined"
            disabled={!ready || preview.isPending}
            onClick={() => preview.mutate()}
          >
            {t("warehouse.opening.preview")}
          </Button>
        )}
        {!result?.applied && (
          <Button
            variant="contained"
            disabled={!result?.valid || apply.isPending}
            onClick={() => apply.mutate()}
          >
            {t("warehouse.opening.apply")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

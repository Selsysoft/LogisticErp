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
import { DataTable, formatAmount, formatDate, useBranches } from "./common";
import { OPENING_INVOICE_SAMPLE, downloadCsv } from "../importSamples";

type Kind = "RECEIVABLE" | "PAYABLE";

interface Result {
  applied: boolean;
  valid: boolean;
  totals: { kind: Kind; currency: string; amount: string; count: number }[];
  rows: {
    line: number;
    accountCode: string | null;
    accountName: string | null;
    kind: Kind | null;
    number: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    currency: string | null;
    amount: string | null;
    status: "READY" | "ERROR";
    error: string | null;
  }[];
}

function downloadSample() {
  downloadCsv(OPENING_INVOICE_SAMPLE, "acik-faturalar-ornek.csv");
}

/**
 * Önceki sistemden açık faturalar. Müşteri faturası nakit öngörüsüne, tedarikçi faturası ödeme
 * planına girer; ikisi de cari hareketine belge tarihiyle yazılır. Önce önizlenir; içe aktarma ya
 * hep ya hiçtir.
 */
export function OpeningInvoiceDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const branches = useBranches();
  const [branchId, setBranchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const send = (path: string) => {
    const form = new FormData();
    form.append("file", file!);
    form.append("branchId", branchId);
    return apiUpload<Result>(`/finance/opening-invoices${path}`, form);
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
  const errorCount = result?.rows.filter((row) => row.status === "ERROR").length ?? 0;
  const readyCount = result ? result.rows.length - errorCount : 0;

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{t("finance.openingInvoice.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("finance.openingInvoice.intro")}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select
              size="small"
              label={t("finance.field.branch")}
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                reset();
              }}
              sx={{ minWidth: 200 }}
            >
              {(branches.data ?? []).map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.name}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" component="label">
              {file ? file.name : t("finance.opening.pick")}
              <input hidden type="file" accept=".csv,.txt" onChange={onPick} />
            </Button>
            <Button onClick={downloadSample}>{t("finance.opening.sample")}</Button>
          </Stack>
          {preview.isError && <ErrorState error={preview.error} />}
          {apply.isError && <ErrorState error={apply.error} />}
          {result?.applied && (
            <Alert severity="success">
              {t("finance.openingInvoice.applied", { count: readyCount })}
            </Alert>
          )}
          {result && !result.applied && (
            <Alert severity={result.valid ? "info" : "warning"}>
              {result.valid
                ? t("finance.openingInvoice.ready", { count: readyCount })
                : t("finance.opening.invalid", { count: errorCount })}
            </Alert>
          )}
          {result && (
            <>
              <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                {result.totals.map((total) => (
                  <Typography key={`${total.kind}-${total.currency}`} variant="body2">
                    {t(`finance.openingInvoice.kind.${total.kind}`)}: {total.count} ·{" "}
                    {formatAmount(total.amount)} {total.currency}
                  </Typography>
                ))}
              </Stack>
              <DataTable
                rows={result.rows}
                rowKey={(row) => String(row.line)}
                columns={[
                  { header: t("finance.opening.line"), render: (row) => row.line },
                  {
                    header: t("finance.field.account"),
                    render: (row) => [row.accountCode, row.accountName].filter(Boolean).join(" · "),
                  },
                  {
                    header: t("finance.openingInvoice.kindHeader"),
                    render: (row) => (row.kind ? t(`finance.openingInvoice.kind.${row.kind}`) : ""),
                  },
                  { header: t("finance.openingInvoice.number"), render: (row) => row.number },
                  {
                    header: t("finance.openingInvoice.invoiceDate"),
                    render: (row) => (row.invoiceDate ? formatDate(row.invoiceDate) : ""),
                  },
                  {
                    header: t("finance.field.dueDate"),
                    render: (row) => (row.dueDate ? formatDate(row.dueDate) : ""),
                  },
                  {
                    header: t("finance.field.amount"),
                    align: "right",
                    render: (row) =>
                      row.amount === null ? "" : `${formatAmount(row.amount)} ${row.currency}`,
                  },
                  {
                    header: t("finance.field.status"),
                    render: (row) => (
                      <Stack spacing={0.5}>
                        <Chip
                          size="small"
                          color={row.status === "ERROR" ? "error" : "success"}
                          label={t(`finance.openingInvoice.status.${row.status}`)}
                          sx={{ alignSelf: "flex-start" }}
                        />
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
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("finance.action.close")}</Button>
        {!result?.applied && (
          <Button
            variant="outlined"
            disabled={!file || !branchId || preview.isPending}
            onClick={() => preview.mutate()}
          >
            {t("finance.opening.preview")}
          </Button>
        )}
        {!result?.applied && (
          <Button
            variant="contained"
            disabled={!result?.valid || apply.isPending}
            onClick={() => apply.mutate()}
          >
            {t("finance.opening.apply")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

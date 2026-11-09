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
import { DataTable, formatAmount, today, useBranches } from "./common";

type RowStatus = "NEW_ACCOUNT" | "EXISTING_ACCOUNT" | "ZERO" | "ERROR";

interface Result {
  applied: boolean;
  valid: boolean;
  accountsToCreate: number;
  postings: number;
  totals: { currency: string; debit: string; credit: string }[];
  rows: {
    line: number;
    code: string | null;
    name: string | null;
    type: string | null;
    currency: string | null;
    balance: string | null;
    status: RowStatus;
    error: string | null;
  }[];
}

const STATUS_COLOR = {
  NEW_ACCOUNT: "info",
  EXISTING_ACCOUNT: "default",
  ZERO: "default",
  ERROR: "error",
} as const;

/** Elle hazırlanacak dosyanın başlığı ve örnek satırları; Excel noktalı virgülü sütun sayar. */
const SAMPLE =
  "Kod;Ad;Tür;Para birimi;Bakiye;Kur;Vergi no\n" +
  "M001;Örnek Müşteri A.Ş.;Müşteri;TRY;1500,00;;1234567890\n" +
  "T001;Örnek Tedarikçi Ltd.;Tedarikçi;TRY;-2500,00;;\n" +
  "M002;Örnek Dış Müşteri;Müşteri;EUR;200,00;35,40;\n";

function downloadSample() {
  // Excel'in Türkçe karakterleri doğru açması için UTF-8 imi (BOM) eklenir.
  const blob = new Blob(["﻿" + SAMPLE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "acilis-bakiyesi-ornek.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Önceki sistemden cari açılış bakiyeleri. Önce önizlenir; içe aktarma ya hep ya hiçtir, tek
 * hatalı satır varsa hiçbir şey yazılmaz.
 */
export function OpeningBalanceDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const branches = useBranches();
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const send = (path: string) => {
    const form = new FormData();
    form.append("file", file!);
    form.append("branchId", branchId);
    form.append("date", date);
    return apiUpload<Result>(`/finance/opening-balances${path}`, form);
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
  const ready = !!file && !!branchId && !!date;
  const errorCount = result?.rows.filter((row) => row.status === "ERROR").length ?? 0;

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{t("finance.opening.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("finance.opening.intro")}
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
            <TextField
              size="small"
              type="date"
              label={t("finance.opening.date")}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                reset();
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
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
              {t("finance.opening.applied", {
                accounts: result.accountsToCreate,
                postings: result.postings,
              })}
            </Alert>
          )}
          {result && !result.applied && (
            <Alert severity={result.valid ? "info" : "warning"}>
              {result.valid
                ? t("finance.opening.ready", {
                    accounts: result.accountsToCreate,
                    postings: result.postings,
                  })
                : t("finance.opening.invalid", { count: errorCount })}
            </Alert>
          )}
          {result && (
            <>
              <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                {result.totals.map((total) => (
                  <Typography key={total.currency} variant="body2">
                    {total.currency}: {t("finance.field.debit")} {formatAmount(total.debit)} ·{" "}
                    {t("finance.field.credit")} {formatAmount(total.credit)}
                  </Typography>
                ))}
              </Stack>
              <DataTable
                rows={result.rows}
                rowKey={(row) => String(row.line)}
                columns={[
                  { header: t("finance.opening.line"), render: (row) => row.line },
                  { header: t("finance.field.code"), render: (row) => row.code },
                  { header: t("finance.field.name"), render: (row) => row.name },
                  {
                    header: t("finance.field.type"),
                    render: (row) => (row.type ? t(`finance.accountType.${row.type}`) : ""),
                  },
                  {
                    header: t("finance.field.balance"),
                    align: "right",
                    render: (row) =>
                      row.balance === null ? "" : `${formatAmount(row.balance)} ${row.currency}`,
                  },
                  {
                    header: t("finance.field.status"),
                    render: (row) => (
                      <Stack spacing={0.5}>
                        <Chip
                          size="small"
                          color={STATUS_COLOR[row.status]}
                          label={t(`finance.opening.status.${row.status}`)}
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
            disabled={!ready || preview.isPending}
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

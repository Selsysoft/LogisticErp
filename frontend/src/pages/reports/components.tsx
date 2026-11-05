import { Box, Button, Card, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiDownload } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { useBranches } from "../finance/common";
import { reportQuery } from "./common";

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" component="p" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Card>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" },
      }}
    >
      {children}
    </Box>
  );
}

export function PeriodFilter({
  from,
  to,
  branchId,
  onFrom,
  onTo,
  onBranch,
}: {
  from: string;
  to: string;
  branchId?: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onBranch?: (value: string) => void;
}) {
  const { t } = useTranslation();
  const branches = useBranches();
  return (
    <>
      <TextField
        size="small"
        type="date"
        label={t("finance.field.from")}
        value={from}
        onChange={(event) => onFrom(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        size="small"
        type="date"
        label={t("finance.field.to")}
        value={to}
        onChange={(event) => onTo(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      {onBranch && (
        <TextField
          size="small"
          select
          label={t("reports.field.branch")}
          value={branchId ?? ""}
          onChange={(event) => onBranch(event.target.value)}
          sx={{ minWidth: 160 }}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
        >
          <MenuItem value="">{t("reports.field.allBranches")}</MenuItem>
          {(branches.data ?? []).map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    </>
  );
}

export function ExportButtons({
  report,
  params,
}: {
  report: string;
  params?: Record<string, string | undefined>;
}) {
  const { t } = useTranslation();
  const download = useMutation({
    mutationFn: (format: "XLSX" | "PDF") =>
      apiDownload(
        `/reports/export${reportQuery({ report, format, ...params })}`,
        `rapor.${format.toLowerCase()}`,
      ),
  });
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          disabled={download.isPending}
          onClick={() => download.mutate("XLSX")}
        >
          {t("reports.action.excel")}
        </Button>
        <Button
          variant="outlined"
          disabled={download.isPending}
          onClick={() => download.mutate("PDF")}
        >
          {t("reports.action.pdf")}
        </Button>
      </Stack>
      {download.isError && <ErrorState error={download.error} />}
    </Stack>
  );
}

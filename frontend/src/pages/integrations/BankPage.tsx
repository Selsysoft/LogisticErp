import { Alert, Button, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest, apiUpload } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  useCan,
} from "../finance/common";
import { useIntegrationOptions } from "./common";
import { OpenTransaction, Reconciliation, StatementImportResult, StatementLine } from "./types";

const STATUS_COLORS = { UNMATCHED: "warning", MATCHED: "success", IGNORED: "default" } as const;

function MatchDialog({
  line,
  onClose,
  onSaved,
}: {
  line: StatementLine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const candidates = useQuery({
    queryKey: ["integration", "bank", "candidates", line.id],
    queryFn: () => apiGet<OpenTransaction[]>(`/integration/bank/lines/${line.id}/candidates`),
  });
  if (!candidates.data) {
    return candidates.error ? <ErrorState error={candidates.error} /> : null;
  }
  return (
    <FormDialog
      title={`${t("integrations.action.match")} · ${formatAmount(line.amount)}`}
      fields={[
        {
          name: "transactionId",
          label: t("integrations.field.transaction"),
          type: "select",
          required: true,
          options: candidates.data.map((row) => ({
            value: row.id,
            label: `${formatDate(row.date)} · ${formatAmount(row.amount)} · ${row.description ?? ""}`,
          })),
        },
      ]}
      onClose={onClose}
      onSubmit={(values) => apiRequest("POST", `/integration/bank/lines/${line.id}/match`, values)}
      onSaved={onSaved}
    />
  );
}

export function BankPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canManage = useCan("FINANCE_MANAGE");
  const options = useIntegrationOptions();
  const [fundId, setFundId] = useState("");
  const [matching, setMatching] = useState<StatementLine | null>(null);
  const [result, setResult] = useState<StatementImportResult | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["integration", "bank"] });
  const lines = useQuery({
    queryKey: ["integration", "bank", "lines", fundId],
    queryFn: () => apiGet<StatementLine[]>(`/integration/bank/${fundId}/lines`),
    enabled: !!fundId,
  });
  const summary = useQuery({
    queryKey: ["integration", "bank", "summary", fundId],
    queryFn: () => apiGet<Reconciliation>(`/integration/bank/${fundId}/summary`),
    enabled: !!fundId,
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<StatementImportResult>(`/integration/bank/${fundId}/statements`, form);
    },
    onSuccess: (data) => {
      setResult(data);
      void refresh();
    },
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "unmatch" | "ignore" }) =>
      apiRequest("POST", `/integration/bank/lines/${id}/${action}`),
    onSuccess: refresh,
  });
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      upload.mutate(file);
    }
  };

  return (
    <Stack spacing={2}>
      <SectionHeader title={t("integrations.tabs.bank")}>
        <TextField
          select
          size="small"
          label={t("integrations.field.bankAccount")}
          value={fundId}
          onChange={(event) => {
            setFundId(event.target.value);
            setResult(null);
          }}
          sx={{ minWidth: 200 }}
        >
          {(options.data?.bankAccounts ?? []).map((account) => (
            <MenuItem key={account.id} value={account.id}>
              {account.label}
            </MenuItem>
          ))}
        </TextField>
        {canManage && (
          <Button variant="contained" component="label" disabled={!fundId || upload.isPending}>
            {t("integrations.action.uploadStatement")}
            <input hidden type="file" accept=".csv,.txt" onChange={onPick} />
          </Button>
        )}
      </SectionHeader>
      <Alert severity="info">{t("integrations.notice.formatBank")}</Alert>
      {upload.isError && <ErrorState error={upload.error} />}
      {act.isError && <ErrorState error={act.error} />}
      {result && (
        <Alert severity={result.errors.length > 0 ? "warning" : "success"}>
          {t("integrations.notice.statementResult", {
            imported: result.imported,
            matched: result.matched,
            duplicates: result.duplicates,
          })}
          {result.errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </Alert>
      )}
      {summary.data && (
        <Typography variant="body2">
          {t("integrations.rowLine.MATCHED")}: {summary.data.matched} ·{" "}
          {t("integrations.rowLine.UNMATCHED")}: {summary.data.unmatched} (
          {formatAmount(summary.data.unmatchedTotal)}) · {t("integrations.rowLine.IGNORED")}:{" "}
          {summary.data.ignored}
        </Typography>
      )}
      {fundId && <QueryState isPending={lines.isPending} error={lines.error} />}
      {lines.data && (
        <DataTable
          rows={lines.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.date"), render: (r) => formatDate(r.date) },
            { header: t("finance.field.description"), render: (r) => r.description },
            { header: t("warehouse.field.reference"), render: (r) => r.reference },
            {
              header: t("finance.field.amount"),
              align: "right",
              render: (r) => formatAmount(r.amount),
            },
            {
              header: t("finance.field.status"),
              render: (r) => (
                <Chip
                  size="small"
                  color={STATUS_COLORS[r.status]}
                  label={t(`integrations.rowLine.${r.status}`)}
                />
              ),
            },
            { header: t("integrations.field.transaction"), render: (r) => r.matchedDescription },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canManage &&
                (r.status === "UNMATCHED" ? (
                  <>
                    <Button size="small" onClick={() => setMatching(r)}>
                      {t("integrations.action.match")}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => act.mutate({ id: r.id, action: "ignore" })}
                    >
                      {t("integrations.action.ignore")}
                    </Button>
                  </>
                ) : (
                  <Button size="small" onClick={() => act.mutate({ id: r.id, action: "unmatch" })}>
                    {t("integrations.action.unmatch")}
                  </Button>
                )),
            },
          ]}
        />
      )}
      {matching && (
        <MatchDialog
          line={matching}
          onClose={() => setMatching(null)}
          onSaved={() => {
            setMatching(null);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

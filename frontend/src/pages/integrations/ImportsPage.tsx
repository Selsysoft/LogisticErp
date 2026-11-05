import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiRequest, apiUpload } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatMoney,
  QueryState,
  SectionHeader,
  useBranches,
  useCan,
} from "../finance/common";
import { formatDateTime } from "../operations/common";
import { useIntegrationOptions } from "./common";
import { ImportBatch, ImportDetail, ImportRow } from "./types";

const STATUS_COLORS = {
  MATCHED: "info",
  UNMATCHED: "warning",
  ERROR: "error",
  POSTED: "success",
  IGNORED: "default",
} as const;

export function ImportsPage() {
  const { t } = useTranslation();
  const canEdit = useCan("FLEET_EDIT");
  const navigate = useNavigate();
  const options = useIntegrationOptions();
  const branches = useBranches();
  const [kind, setKind] = useState("TOLL");
  const [accountId, setAccountId] = useState("");
  const [branchId, setBranchId] = useState("");
  const batches = useQuery({
    queryKey: ["integration", "imports"],
    queryFn: () => apiGet<ImportBatch[]>("/integration/imports"),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const query = new URLSearchParams({ kind, accountId, branchId });
      return apiUpload<ImportDetail>(`/integration/imports?${query}`, form);
    },
    onSuccess: (detail) => navigate(`/integrations/imports/${detail.batch.id}`),
  });
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      upload.mutate(file);
    }
  };

  return (
    <Stack spacing={3}>
      {canEdit && (
        <Box>
          <SectionHeader title={t("integrations.sections.newImport")} />
          <Alert severity="info" sx={{ mb: 2 }}>
            {t(`integrations.notice.format${kind}`)}
          </Alert>
          {upload.isError && <ErrorState error={upload.error} />}
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <TextField
              select
              size="small"
              label={t("integrations.field.importKind")}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="TOLL">{t("integrations.importKind.TOLL")}</MenuItem>
              <MenuItem value="FUEL">{t("integrations.importKind.FUEL")}</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              label={t("integrations.field.payee")}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              sx={{ minWidth: 200 }}
            >
              {(options.data?.accounts ?? []).map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label={t("finance.field.branch")}
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              sx={{ minWidth: 160 }}
            >
              {(branches.data ?? []).map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              component="label"
              disabled={!accountId || !branchId || upload.isPending}
            >
              {t("integrations.action.uploadFile")}
              <input hidden type="file" accept=".csv,.txt" onChange={onPick} />
            </Button>
          </Stack>
        </Box>
      )}
      <Box>
        <SectionHeader title={t("integrations.sections.imports")} />
        <QueryState isPending={batches.isPending} error={batches.error} />
        {batches.data && (
          <DataTable
            rows={batches.data}
            rowKey={(row) => row.id}
            columns={[
              {
                header: t("integrations.field.file"),
                render: (r) => (
                  <Link component={RouterLink} to={`/integrations/imports/${r.id}`}>
                    {r.fileName}
                  </Link>
                ),
              },
              {
                header: t("integrations.field.importKind"),
                render: (r) => t(`integrations.importKind.${r.kind}`),
              },
              { header: t("integrations.field.payee"), render: (r) => r.accountName },
              {
                header: t("integrations.field.duplicates"),
                align: "right",
                render: (r) => r.duplicates,
              },
              { header: t("finance.field.date"), render: (r) => formatDateTime(r.createdAt) },
            ]}
          />
        )}
      </Box>
    </Stack>
  );
}

export function ImportDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const options = useIntegrationOptions();
  const [assigning, setAssigning] = useState<ImportRow | null>(null);
  const key = ["integration", "imports", id];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => apiGet<ImportDetail>(`/integration/imports/${id}`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const post = useMutation({
    mutationFn: () => apiRequest("POST", `/integration/imports/${id}/post`),
    onSuccess: refresh,
  });
  const ignore = useMutation({
    mutationFn: (rowId: string) => apiRequest("POST", `/integration/import-rows/${rowId}/ignore`),
    onSuccess: refresh,
  });

  if (!detail.data) {
    return <QueryState isPending={detail.isPending} error={detail.error} />;
  }
  const { batch, rows } = detail.data;
  const ready = rows.filter((row) => row.status === "MATCHED").length;

  return (
    <Stack spacing={2}>
      <SectionHeader title={`${batch.fileName} · ${t(`integrations.importKind.${batch.kind}`)}`}>
        {canEdit && (
          <Button
            variant="contained"
            disabled={ready === 0 || post.isPending}
            onClick={() => post.mutate()}
          >
            {t("integrations.action.post", { count: ready })}
          </Button>
        )}
      </SectionHeader>
      <Typography variant="body2">
        {t("integrations.field.payee")}: {batch.accountName}
        {batch.duplicates > 0
          ? ` · ${t("integrations.notice.duplicates", { count: batch.duplicates })}`
          : ""}
      </Typography>
      {post.isError && <ErrorState error={post.error} />}
      {ignore.isError && <ErrorState error={ignore.error} />}
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          { header: "#", render: (r) => r.lineNo },
          { header: t("fleet.field.plate"), render: (r) => r.plate },
          {
            header: t("finance.field.date"),
            render: (r) => (r.occurredAt ? formatDateTime(r.occurredAt) : ""),
          },
          { header: t("integrations.field.place"), render: (r) => r.place },
          {
            header: t("finance.field.amount"),
            align: "right",
            render: (r) => (r.money ? formatMoney(r.money) : ""),
          },
          { header: t("customs.field.shipment"), render: (r) => r.shipmentNumber },
          {
            header: t("finance.field.status"),
            render: (r) => (
              <Chip
                size="small"
                color={STATUS_COLORS[r.status]}
                label={t(`integrations.rowStatus.${r.status}`)}
              />
            ),
          },
          { header: t("integrations.field.message"), render: (r) => r.message },
          {
            header: t("common.actions"),
            align: "right",
            render: (r) =>
              canEdit &&
              (r.status === "UNMATCHED" || r.status === "MATCHED") && (
                <>
                  <Button size="small" onClick={() => setAssigning(r)}>
                    {t("integrations.action.assign")}
                  </Button>
                  <Button size="small" color="error" onClick={() => ignore.mutate(r.id)}>
                    {t("integrations.action.ignore")}
                  </Button>
                </>
              ),
          },
        ]}
      />
      {assigning && options.data && (
        <FormDialog
          title={`${t("integrations.action.assign")} · ${assigning.plate ?? ""}`}
          fields={[
            {
              name: "shipmentId",
              label: t("customs.field.shipment"),
              type: "select",
              required: true,
              options: options.data.shipments.map((s) => ({ value: s.id, label: s.label })),
            },
          ]}
          onClose={() => setAssigning(null)}
          onSubmit={(values) =>
            apiRequest("PUT", `/integration/import-rows/${assigning.id}`, values)
          }
          onSaved={() => {
            setAssigning(null);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

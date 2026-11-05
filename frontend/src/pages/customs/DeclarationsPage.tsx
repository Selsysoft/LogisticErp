import { Alert, Button, Chip, Link, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { orNull } from "../crm/common";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  today,
  useCan,
  useCurrencies,
} from "../finance/common";
import { nextDeclarationStatuses, useCustomsOptions } from "./common";
import { Declaration, DeclarationStatus } from "./types";

const TYPES = ["EXPORT", "IMPORT", "TRANSIT"];
const STATUS_COLORS = {
  DRAFT: "default",
  SUBMITTED: "info",
  CLEARED: "success",
  REJECTED: "error",
  CANCELLED: "default",
} as const;

export function DeclarationsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CUSTOMS_EDIT");
  const options = useCustomsOptions();
  const currencies = useCurrencies();
  const [adding, setAdding] = useState(false);
  const declarations = useQuery({
    queryKey: ["customs", "declarations"],
    queryFn: () => apiGet<Declaration[]>("/customs/declarations"),
  });

  return (
    <>
      <SectionHeader title={t("customs.tabs.declarations")}>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("customs.action.newDeclaration")}
          </Button>
        )}
      </SectionHeader>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t("customs.notice.manual")}
      </Alert>
      <QueryState isPending={declarations.isPending} error={declarations.error} />
      {declarations.data && (
        <DataTable
          rows={declarations.data}
          rowKey={(row) => row.id}
          columns={[
            {
              header: t("finance.field.number"),
              render: (r) => (
                <Link component={RouterLink} to={`/customs/declarations/${r.id}`}>
                  {r.number}
                </Link>
              ),
            },
            { header: t("customs.field.shipment"), render: (r) => r.shipmentNumber },
            { header: t("customs.field.type"), render: (r) => t(`customs.type.${r.type}`) },
            { header: t("customs.field.office"), render: (r) => r.customsOffice },
            { header: t("customs.field.registrationNo"), render: (r) => r.registrationNo },
            { header: t("finance.field.date"), render: (r) => formatDate(r.declaredOn) },
            {
              header: t("customs.field.totalValue"),
              align: "right",
              render: (r) => formatMoney(r.totalValue),
            },
            {
              header: t("finance.field.status"),
              render: (r) => (
                <Chip
                  size="small"
                  color={STATUS_COLORS[r.status]}
                  label={t(`customs.status.${r.status}`)}
                />
              ),
            },
          ]}
        />
      )}
      {adding && options.data && currencies.data && (
        <FormDialog
          title={t("customs.action.newDeclaration")}
          fields={[
            {
              name: "shipmentId",
              label: t("customs.field.shipment"),
              type: "select",
              required: true,
              options: options.data.shipments.map((s) => ({ value: s.id, label: s.label })),
            },
            {
              name: "type",
              label: t("customs.field.type"),
              type: "select",
              required: true,
              defaultValue: "EXPORT",
              options: TYPES.map((value) => ({ value, label: t(`customs.type.${value}`) })),
            },
            { name: "customsOffice", label: t("customs.field.office"), required: true },
            {
              name: "declaredOn",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "EUR",
              options: currencies.data.map((c) => ({ value: c.code, label: c.code })),
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) => apiRequest("POST", "/customs/declarations", values)}
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["customs"] });
          }}
        />
      )}
    </>
  );
}

export function DeclarationDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const canEdit = useCan("CUSTOMS_EDIT");
  const [addingLine, setAddingLine] = useState(false);
  const [target, setTarget] = useState<DeclarationStatus | null>(null);
  const declaration = useQuery({
    queryKey: ["customs", "declarations", id],
    queryFn: () => apiGet<Declaration>(`/customs/declarations/${id}`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["customs"] });
  const removeLine = useMutation({
    mutationFn: (lineId: string) => apiRequest("DELETE", `/customs/declaration-lines/${lineId}`),
    onSuccess: refresh,
  });
  const move = useMutation({
    mutationFn: (status: DeclarationStatus) =>
      apiRequest("POST", `/customs/declarations/${id}/status`, { status }),
    onSuccess: refresh,
  });

  if (!declaration.data) {
    return <QueryState isPending={declaration.isPending} error={declaration.error} />;
  }
  const data = declaration.data;
  const draft = data.status === "DRAFT";

  return (
    <Stack spacing={2}>
      <SectionHeader title={`${data.number} · ${data.shipmentNumber}`}>
        <Chip color={STATUS_COLORS[data.status]} label={t(`customs.status.${data.status}`)} />
        {canEdit &&
          nextDeclarationStatuses(data.status).map((status) => (
            <Button
              key={status}
              variant={status === "SUBMITTED" || status === "CLEARED" ? "contained" : "outlined"}
              color={status === "REJECTED" || status === "CANCELLED" ? "error" : "primary"}
              disabled={move.isPending}
              onClick={() => (status === "SUBMITTED" ? setTarget(status) : move.mutate(status))}
            >
              {t(`customs.action.to.${status}`)}
            </Button>
          ))}
      </SectionHeader>
      {move.isError && <ErrorState error={move.error} />}
      {removeLine.isError && <ErrorState error={removeLine.error} />}
      <Typography variant="body2">
        {t(`customs.type.${data.type}`)} · {data.customsOffice} · {formatDate(data.declaredOn)}
        {data.registrationNo
          ? ` · ${t("customs.field.registrationNo")}: ${data.registrationNo}`
          : ""}
      </Typography>
      <SectionHeader title={t("customs.sections.lines")}>
        {canEdit && draft && (
          <Button variant="outlined" onClick={() => setAddingLine(true)}>
            {t("customs.action.addLine")}
          </Button>
        )}
      </SectionHeader>
      <DataTable
        rows={data.lines}
        rowKey={(row) => row.id}
        columns={[
          { header: t("customs.field.hsCode"), render: (r) => r.hsCode },
          { header: t("finance.field.description"), render: (r) => r.description },
          {
            header: t("operations.field.quantity"),
            align: "right",
            render: (r) => (r.quantity ? formatAmount(r.quantity) : ""),
          },
          {
            header: t("operations.field.weightKg"),
            align: "right",
            render: (r) => (r.weightKg ? formatAmount(r.weightKg) : ""),
          },
          {
            header: t("customs.field.value"),
            align: "right",
            render: (r) => `${formatAmount(r.value)} ${data.totalValue.currency}`,
          },
          {
            header: t("common.actions"),
            align: "right",
            render: (r) =>
              canEdit &&
              draft && (
                <Button size="small" color="error" onClick={() => removeLine.mutate(r.id)}>
                  {t("common.delete")}
                </Button>
              ),
          },
        ]}
      />
      <Typography variant="subtitle2" sx={{ textAlign: "right" }}>
        {t("customs.field.totalValue")}: {formatMoney(data.totalValue)}
      </Typography>
      {addingLine && (
        <FormDialog
          title={t("customs.action.addLine")}
          fields={[
            { name: "hsCode", label: t("customs.field.hsCode"), required: true },
            { name: "description", label: t("finance.field.description"), required: true },
            { name: "quantity", label: t("operations.field.quantity"), type: "amount" },
            { name: "weightKg", label: t("operations.field.weightKg"), type: "amount" },
            { name: "value", label: t("customs.field.value"), type: "amount", required: true },
          ]}
          onClose={() => setAddingLine(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/customs/declarations/${id}/lines`, {
              hsCode: values.hsCode,
              description: values.description,
              quantity: orNull(values.quantity),
              weightKg: orNull(values.weightKg),
              value: values.value,
            })
          }
          onSaved={() => {
            setAddingLine(false);
            void refresh();
          }}
        />
      )}
      {target && (
        <FormDialog
          title={t(`customs.action.to.${target}`)}
          fields={[
            { name: "registrationNo", label: t("customs.field.registrationNo"), required: true },
          ]}
          onClose={() => setTarget(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/customs/declarations/${id}/status`, {
              status: target,
              registrationNo: values.registrationNo,
            })
          }
          onSaved={() => {
            setTarget(null);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { apiDownload, apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { orNull } from "../crm/common";
import { FilesSection } from "../crm/FilesSection";
import { PriceBreakdownTable } from "../crm/PriceBreakdownTable";
import { DataTable, FormDialog, QueryState, SectionHeader, useCan } from "../finance/common";
import {
  canCancel,
  formatDateTime,
  localDateTime,
  nextStatus,
  STATUS_COLORS,
  toInstant,
} from "./common";
import { CostsSection, InvoiceSection } from "./FinanceSections";
import { LegsSection } from "./LegsSection";
import { Pod, Shipment, ShipmentDocument, ShipmentEvent } from "./types";

/** Çıkış ve varış ülkesi farklıysa CMR üç dilli ve Konvansiyon maddeli üretilir. */
function InternationalSection({ shipment }: { shipment: Shipment }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canDispatch = useCan("SHIPMENT_DISPATCH");
  const [editing, setEditing] = useState(false);
  const field = (name: string) => t(`operations.field.${name}`);
  return (
    <Box>
      <SectionHeader title={t("operations.sections.international")}>
        {canDispatch && (
          <Button variant="outlined" onClick={() => setEditing(true)}>
            {t("common.edit")}
          </Button>
        )}
      </SectionHeader>
      {shipment.international ? (
        <Typography variant="body2">
          {shipment.originCountry} → {shipment.destinationCountry}
          {shipment.incoterm ? ` · ${shipment.incoterm}` : ""}
          {shipment.liabilityPolicy
            ? ` · ${field("liabilityPolicy")}: ${shipment.liabilityPolicy}`
            : ""}
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {t("operations.notice.domestic")}
        </Typography>
      )}
      {editing && (
        <FormDialog
          title={t("operations.sections.international")}
          fields={[
            {
              name: "originCountry",
              label: field("originCountry"),
              required: true,
              defaultValue: shipment.originCountry ?? "TR",
              helperText: field("countryHelp"),
            },
            {
              name: "destinationCountry",
              label: field("destinationCountry"),
              required: true,
              defaultValue: shipment.destinationCountry ?? "",
            },
            { name: "incoterm", label: field("incoterm"), defaultValue: shipment.incoterm ?? "" },
            {
              name: "liabilityPolicy",
              label: field("liabilityPolicy"),
              defaultValue: shipment.liabilityPolicy ?? "",
            },
            {
              name: "senderInstructions",
              label: field("senderInstructions"),
              defaultValue: shipment.senderInstructions ?? "",
            },
            {
              name: "attachedDocuments",
              label: field("attachedDocuments"),
              defaultValue: shipment.attachedDocuments ?? "",
            },
          ]}
          onClose={() => setEditing(false)}
          onSubmit={(values) =>
            apiRequest("PUT", `/shipment/shipments/${shipment.id}/international`, {
              originCountry: values.originCountry.toUpperCase(),
              destinationCountry: values.destinationCountry.toUpperCase(),
              incoterm: orNull(values.incoterm),
              liabilityPolicy: orNull(values.liabilityPolicy),
              senderInstructions: orNull(values.senderInstructions),
              attachedDocuments: orNull(values.attachedDocuments),
            })
          }
          onSaved={() => {
            setEditing(false);
            void client.invalidateQueries({ queryKey: ["shipment"] });
          }}
        />
      )}
    </Box>
  );
}

function PodSection({ shipment }: { shipment: Shipment }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canDispatch = useCan("SHIPMENT_DISPATCH");
  const [editing, setEditing] = useState(false);
  const pod = useQuery({
    queryKey: ["shipment", "pod", shipment.id],
    queryFn: async () =>
      (await apiGet<Pod | undefined>(`/shipment/shipments/${shipment.id}/pod`)) ?? null,
  });
  const allowed = shipment.status === "LOADED" || shipment.status === "IN_TRANSIT";

  return (
    <Box>
      <SectionHeader title={t("operations.sections.pod")}>
        {canDispatch && allowed && (
          <Button variant="outlined" onClick={() => setEditing(true)}>
            {t("operations.action.savePod")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={pod.isPending} error={pod.error} />
      {pod.data && (
        <Typography variant="body2">
          {pod.data.recipientName} · {formatDateTime(pod.data.deliveredAt)}
          {pod.data.note ? ` · ${pod.data.note}` : ""}
        </Typography>
      )}
      {editing && (
        <FormDialog
          title={t("operations.action.savePod")}
          fields={[
            {
              name: "recipientName",
              label: t("operations.field.recipientName"),
              required: true,
              defaultValue: pod.data?.recipientName ?? "",
            },
            {
              name: "deliveredAt",
              label: t("operations.field.deliveredAt"),
              type: "datetime",
              required: true,
              defaultValue: localDateTime(),
            },
            { name: "note", label: t("operations.field.note") },
          ]}
          onClose={() => setEditing(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/shipment/shipments/${shipment.id}/pod`, {
              recipientName: values.recipientName,
              deliveredAt: toInstant(values.deliveredAt),
              note: orNull(values.note),
            })
          }
          onSaved={() => {
            setEditing(false);
            void client.invalidateQueries({ queryKey: ["shipment", "pod", shipment.id] });
          }}
        />
      )}
    </Box>
  );
}

function DocumentsSection({ shipment }: { shipment: Shipment }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canDispatch = useCan("SHIPMENT_DISPATCH");
  const key = ["shipment", "documents", shipment.id];
  const documents = useQuery({
    queryKey: key,
    queryFn: () => apiGet<ShipmentDocument[]>(`/shipment/shipments/${shipment.id}/documents`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const generate = useMutation({
    mutationFn: (type: "CMR" | "WAYBILL") =>
      apiRequest("POST", `/shipment/shipments/${shipment.id}/documents/${type}`),
    onSuccess: refresh,
  });
  const issue = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/shipment/documents/${id}/issue`),
    onSuccess: refresh,
  });
  const pdf = useMutation({
    mutationFn: (row: ShipmentDocument) =>
      apiDownload(`/shipment/documents/${row.id}/pdf`, `${row.number}.pdf`),
  });
  const error = generate.error ?? issue.error ?? pdf.error;

  return (
    <Box>
      <SectionHeader title={t("operations.sections.documents")}>
        {canDispatch && shipment.status !== "CANCELLED" && (
          <>
            <Button variant="outlined" onClick={() => generate.mutate("CMR")}>
              {t("operations.action.generateCmr")}
            </Button>
            <Button variant="outlined" onClick={() => generate.mutate("WAYBILL")}>
              {t("operations.action.generateWaybill")}
            </Button>
          </>
        )}
      </SectionHeader>
      {error && <ErrorState error={error} />}
      <QueryState isPending={documents.isPending} error={documents.error} />
      <Alert severity="info" sx={{ mb: 2 }}>
        {t("operations.notice.notLegalWaybill")}
      </Alert>
      {documents.data && (
        <DataTable
          rows={documents.data}
          rowKey={(row) => row.id}
          columns={[
            {
              header: t("operations.field.type"),
              render: (r) => t(`operations.documentType.${r.type}`),
            },
            { header: t("finance.field.number"), render: (r) => r.number },
            {
              header: t("finance.field.status"),
              render: (r) => t(`operations.documentStatus.${r.status}`),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) => (
                <>
                  <Button size="small" onClick={() => pdf.mutate(r)}>
                    {t("operations.action.pdf")}
                  </Button>
                  {canDispatch && r.status === "DRAFT" && (
                    <Button size="small" onClick={() => issue.mutate(r.id)}>
                      {t("operations.action.issue")}
                    </Button>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </Box>
  );
}

function TimelineSection({ shipmentId }: { shipmentId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canDispatch = useCan("SHIPMENT_DISPATCH");
  const [adding, setAdding] = useState(false);
  const key = ["shipment", "timeline", shipmentId];
  const events = useQuery({
    queryKey: key,
    queryFn: () => apiGet<ShipmentEvent[]>(`/shipment/shipments/${shipmentId}/timeline`),
  });

  return (
    <Box>
      <SectionHeader title={t("operations.sections.timeline")}>
        {canDispatch && (
          <Button variant="outlined" onClick={() => setAdding(true)}>
            {t("operations.action.addEvent")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={events.isPending} error={events.error} />
      {events.data && (
        <DataTable
          rows={events.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("operations.field.when"), render: (r) => formatDateTime(r.createdAt) },
            {
              header: t("operations.field.type"),
              render: (r) => (
                <Chip
                  size="small"
                  color={r.type === "EXCEPTION" ? "error" : "default"}
                  label={t(`operations.eventType.${r.type}`)}
                />
              ),
            },
            {
              header: t("finance.field.status"),
              render: (r) => (r.toStatus ? t(`operations.status.${r.toStatus}`) : ""),
            },
            { header: t("operations.field.message"), render: (r) => r.message },
            { header: t("operations.field.createdBy"), render: (r) => r.createdBy },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("operations.action.addEvent")}
          fields={[
            {
              name: "type",
              label: t("operations.field.type"),
              type: "select",
              required: true,
              defaultValue: "EXCEPTION",
              options: ["EXCEPTION", "NOTE"].map((value) => ({
                value,
                label: t(`operations.eventType.${value}`),
              })),
            },
            { name: "message", label: t("operations.field.message"), required: true },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/shipment/shipments/${shipmentId}/events`, values)
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: key });
          }}
        />
      )}
    </Box>
  );
}

export function ShipmentDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const canDispatch = useCan("SHIPMENT_DISPATCH");
  const [cancelling, setCancelling] = useState(false);
  const shipment = useQuery({
    queryKey: ["shipment", "detail", id],
    queryFn: () => apiGet<Shipment>(`/shipment/shipments/${id}`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["shipment"] });
  const move = useMutation({
    mutationFn: (status: string) =>
      apiRequest("POST", `/shipment/shipments/${id}/status`, { status }),
    onSuccess: refresh,
  });

  if (!shipment.data) {
    return <QueryState isPending={shipment.isPending} error={shipment.error} />;
  }
  const data = shipment.data;
  const next = nextStatus(data.status);

  return (
    <Stack spacing={4}>
      <Box>
        <SectionHeader title={`${data.number} · ${data.accountName}`}>
          <Chip color={STATUS_COLORS[data.status]} label={t(`operations.status.${data.status}`)} />
          {canDispatch && next && (
            <Button variant="contained" disabled={move.isPending} onClick={() => move.mutate(next)}>
              {t(`operations.action.to.${next}`)}
            </Button>
          )}
          {canDispatch && canCancel(data.status) && (
            <Button color="error" onClick={() => setCancelling(true)}>
              {t("operations.action.cancel")}
            </Button>
          )}
        </SectionHeader>
        {move.isError && <ErrorState error={move.error} />}
        <Typography variant="body2">
          {data.origin} → {data.destination} · {formatDateTime(data.plannedPickup)} –{" "}
          {formatDateTime(data.plannedDelivery)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("operations.field.shipperName")}: {data.shipperName ?? "—"} ·{" "}
          {t("operations.field.consigneeName")}: {data.consigneeName ?? "—"}
        </Typography>
      </Box>
      <Box>
        <SectionHeader title={t("operations.sections.cargo")} />
        <DataTable
          rows={data.cargo}
          rowKey={(row) => row.id}
          columns={[
            { header: t("operations.field.cargoDescription"), render: (r) => r.description },
            { header: t("operations.field.quantity"), render: (r) => r.quantity },
            { header: t("operations.field.packaging"), render: (r) => r.packaging },
            { header: t("operations.field.weightKg"), render: (r) => r.weightKg },
            { header: t("operations.field.adrClass"), render: (r) => r.adrClass },
            { header: t("operations.field.unNumber"), render: (r) => r.unNumber },
          ]}
        />
      </Box>
      <Box>
        <SectionHeader title={t("operations.sections.price")} />
        <PriceBreakdownTable price={data.breakdown} />
      </Box>
      <LegsSection shipment={data} />
      <InternationalSection shipment={data} />
      <PodSection shipment={data} />
      <DocumentsSection shipment={data} />
      <CostsSection shipment={data} />
      <InvoiceSection shipment={data} />
      <FilesSection ownerType="SHIPMENT" ownerId={id} editPermission="SHIPMENT_DISPATCH" />
      <TimelineSection shipmentId={id} />
      {cancelling && (
        <FormDialog
          title={t("operations.action.cancel")}
          fields={[{ name: "message", label: t("operations.field.message"), required: true }]}
          onClose={() => setCancelling(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/shipment/shipments/${id}/status`, {
              status: "CANCELLED",
              message: values.message,
            })
          }
          onSaved={() => {
            setCancelling(false);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

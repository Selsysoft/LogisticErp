import { Box, Button, Chip } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { orNull } from "../crm/common";
import {
  DataTable,
  FormDialog,
  formatDate,
  QueryState,
  SectionHeader,
  today,
  useCan,
} from "../finance/common";
import { ComplianceDocument, ResourceBlock } from "./types";

type Subject = "VEHICLE" | "DRIVER";

const DOC_TYPES: Record<Subject, string[]> = {
  VEHICLE: [
    "INSPECTION",
    "TRAFFIC_INSURANCE",
    "KASKO",
    "K_CERTIFICATE",
    "U_ETT",
    "EXHAUST",
    "VEHICLE_ADR",
  ],
  DRIVER: ["LICENSE", "SRC", "PSYCHOTECHNIC", "DRIVER_ADR", "HEALTH"],
};

export function DocumentsSection({ subject, id }: { subject: Subject; id: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const [adding, setAdding] = useState(false);
  const key = ["fleet", "documents", subject, id];

  const documents = useQuery({
    queryKey: key,
    queryFn: () => apiGet<ComplianceDocument[]>(`/fleet/${subject}/${id}/documents`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["fleet"] });
  const remove = useMutation({
    mutationFn: (documentId: string) => apiRequest("DELETE", `/fleet/documents/${documentId}`),
    onSuccess: refresh,
  });
  const now = today();

  return (
    <Box>
      <SectionHeader title={t("fleet.sections.documents")}>
        {canEdit && (
          <Button variant="outlined" onClick={() => setAdding(true)}>
            {t("fleet.action.addDocument")}
          </Button>
        )}
      </SectionHeader>
      {remove.isError && <ErrorState error={remove.error} />}
      <QueryState isPending={documents.isPending} error={documents.error} />
      {documents.data && (
        <DataTable
          rows={documents.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("fleet.field.docType"), render: (r) => t(`fleet.docType.${r.docType}`) },
            { header: t("finance.field.number"), render: (r) => r.number },
            { header: t("fleet.field.expiresOn"), render: (r) => formatDate(r.expiresOn) },
            {
              header: t("finance.field.status"),
              render: (r) =>
                r.expiresOn < now ? (
                  <Chip size="small" color="error" label={t("fleet.status.expired")} />
                ) : (
                  <Chip size="small" color="success" label={t("fleet.status.valid")} />
                ),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canEdit && (
                  <Button size="small" color="error" onClick={() => remove.mutate(r.id)}>
                    {t("common.delete")}
                  </Button>
                ),
            },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("fleet.action.addDocument")}
          fields={[
            {
              name: "docType",
              label: t("fleet.field.docType"),
              type: "select",
              required: true,
              options: DOC_TYPES[subject].map((value) => ({
                value,
                label: t(`fleet.docType.${value}`),
              })),
            },
            { name: "number", label: t("finance.field.number") },
            { name: "issuedOn", label: t("fleet.field.issuedOn"), type: "date" },
            { name: "expiresOn", label: t("fleet.field.expiresOn"), type: "date", required: true },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/fleet/${subject}/${id}/documents`, {
              docType: values.docType,
              number: orNull(values.number),
              issuedOn: orNull(values.issuedOn),
              expiresOn: values.expiresOn,
            })
          }
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
    </Box>
  );
}

export function BlocksSection({ subject, id }: { subject: Subject; id: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const [adding, setAdding] = useState(false);

  const blocks = useQuery({
    queryKey: ["fleet", "blocks", subject, id],
    queryFn: () => apiGet<ResourceBlock[]>(`/fleet/${subject}/${id}/blocks`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["fleet"] });
  const remove = useMutation({
    mutationFn: (blockId: string) => apiRequest("DELETE", `/fleet/blocks/${blockId}`),
    onSuccess: refresh,
  });

  return (
    <Box>
      <SectionHeader title={t("fleet.sections.blocks")}>
        {canEdit && (
          <Button variant="outlined" onClick={() => setAdding(true)}>
            {t("fleet.action.addBlock")}
          </Button>
        )}
      </SectionHeader>
      {remove.isError && <ErrorState error={remove.error} />}
      <QueryState isPending={blocks.isPending} error={blocks.error} />
      {blocks.data && (
        <DataTable
          rows={blocks.data}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.from"), render: (r) => formatDate(r.startDate) },
            { header: t("finance.field.to"), render: (r) => formatDate(r.endDate) },
            { header: t("finance.field.description"), render: (r) => r.reason },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canEdit && (
                  <Button size="small" color="error" onClick={() => remove.mutate(r.id)}>
                    {t("common.delete")}
                  </Button>
                ),
            },
          ]}
        />
      )}
      {adding && (
        <FormDialog
          title={t("fleet.action.addBlock")}
          fields={[
            {
              name: "startDate",
              label: t("finance.field.from"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "endDate",
              label: t("finance.field.to"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "reason", label: t("finance.field.description") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/fleet/${subject}/${id}/blocks`, {
              startDate: values.startDate,
              endDate: values.endDate,
              reason: orNull(values.reason),
            })
          }
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
    </Box>
  );
}

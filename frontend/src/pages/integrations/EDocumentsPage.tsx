import { Alert, Button, Chip, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { orNull } from "../crm/common";
import { DataTable, FormDialog, QueryState, SectionHeader, useCan } from "../finance/common";
import { kindsFor } from "./common";
import { EDocument, EDocumentCandidate, EDocumentSettings } from "./types";

const STATUS_COLORS = {
  SENT: "info",
  ACCEPTED: "success",
  REJECTED: "error",
  CANCELLED: "default",
} as const;

export function EDocumentsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canSend = useCan("SHIPMENT_INVOICE");
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState<EDocumentCandidate | null>(null);
  const settings = useQuery({
    queryKey: ["integration", "settings"],
    queryFn: () => apiGet<EDocumentSettings>("/integration/e-document-settings"),
  });
  const documents = useQuery({
    queryKey: ["integration", "edocuments"],
    queryFn: () => apiGet<EDocument[]>("/integration/e-documents"),
  });
  const candidates = useQuery({
    queryKey: ["integration", "candidates"],
    queryFn: () => apiGet<EDocumentCandidate[]>("/integration/e-documents/candidates"),
  });
  const refresh = () => {
    setEditing(false);
    setSending(null);
    void client.invalidateQueries({ queryKey: ["integration"] });
  };
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "refresh" | "cancel" }) =>
      apiRequest("POST", `/integration/e-documents/${id}/${action}`),
    onSuccess: refresh,
  });

  return (
    <Stack spacing={3}>
      {settings.data?.testProvider && (
        <Alert severity="warning">{t("integrations.notice.testProvider")}</Alert>
      )}
      {settings.data?.provider === "NONE" && (
        <Alert severity="info">{t("integrations.notice.noProvider")}</Alert>
      )}
      <div>
        <SectionHeader title={t("integrations.sections.company")}>
          {canSend && (
            <Button variant="outlined" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
          )}
        </SectionHeader>
        <Typography variant="body2">
          {settings.data?.taxNumber
            ? `${t("integrations.field.taxNumber")}: ${settings.data.taxNumber}${settings.data.taxOffice ? ` · ${settings.data.taxOffice}` : ""}`
            : t("integrations.notice.noTaxNumber")}
        </Typography>
      </div>
      <div>
        <SectionHeader title={t("integrations.sections.waiting")} />
        <QueryState isPending={candidates.isPending} error={candidates.error} />
        {candidates.data && (
          <DataTable
            rows={candidates.data}
            rowKey={(row) => row.id}
            columns={[
              { header: t("finance.field.number"), render: (r) => r.label },
              {
                header: t("integrations.field.source"),
                render: (r) => t(`integrations.source.${r.sourceType}`),
              },
              {
                header: t("common.actions"),
                align: "right",
                render: (r) =>
                  canSend && (
                    <Button size="small" onClick={() => setSending(r)}>
                      {t("integrations.action.send")}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </div>
      <div>
        <SectionHeader title={t("integrations.sections.sent")} />
        {act.isError && <ErrorState error={act.error} />}
        <QueryState isPending={documents.isPending} error={documents.error} />
        {documents.data && (
          <DataTable
            rows={documents.data}
            rowKey={(row) => row.id}
            columns={[
              { header: t("finance.field.number"), render: (r) => r.sourceNo },
              {
                header: t("integrations.field.kind"),
                render: (r) => t(`integrations.kind.${r.kind}`),
              },
              { header: "ETTN", render: (r) => r.ettn },
              { header: t("integrations.field.provider"), render: (r) => r.provider },
              {
                header: t("finance.field.status"),
                render: (r) => (
                  <Chip
                    size="small"
                    color={STATUS_COLORS[r.status]}
                    label={t(`integrations.status.${r.status}`)}
                  />
                ),
              },
              { header: t("integrations.field.message"), render: (r) => r.message },
              {
                header: t("common.actions"),
                align: "right",
                render: (r) =>
                  canSend && (
                    <>
                      {r.status === "SENT" && (
                        <Button
                          size="small"
                          onClick={() => act.mutate({ id: r.id, action: "refresh" })}
                        >
                          {t("integrations.action.refresh")}
                        </Button>
                      )}
                      {(r.status === "SENT" || r.status === "ACCEPTED") && (
                        <Button
                          size="small"
                          color="error"
                          onClick={() => act.mutate({ id: r.id, action: "cancel" })}
                        >
                          {t("integrations.action.cancel")}
                        </Button>
                      )}
                    </>
                  ),
              },
            ]}
          />
        )}
      </div>
      {editing && (
        <FormDialog
          title={t("integrations.sections.company")}
          fields={[
            {
              name: "taxNumber",
              label: t("integrations.field.taxNumber"),
              required: true,
              defaultValue: settings.data?.taxNumber ?? "",
            },
            {
              name: "taxOffice",
              label: t("integrations.field.taxOffice"),
              defaultValue: settings.data?.taxOffice ?? "",
            },
            {
              name: "address",
              label: t("warehouse.field.address"),
              defaultValue: settings.data?.address ?? "",
            },
          ]}
          onClose={() => setEditing(false)}
          onSubmit={(values) =>
            apiRequest("PUT", "/integration/e-document-settings", {
              taxNumber: values.taxNumber,
              taxOffice: orNull(values.taxOffice),
              address: orNull(values.address),
            })
          }
          onSaved={refresh}
        />
      )}
      {sending && (
        <FormDialog
          title={`${t("integrations.action.send")} · ${sending.label}`}
          fields={[
            {
              name: "kind",
              label: t("integrations.field.kind"),
              type: "select",
              required: true,
              defaultValue: kindsFor(sending.sourceType)[0],
              helperText: t("integrations.notice.chooseKind"),
              options: kindsFor(sending.sourceType).map((value) => ({
                value,
                label: t(`integrations.kind.${value}`),
              })),
            },
          ]}
          onClose={() => setSending(null)}
          onSubmit={(values) =>
            apiRequest("POST", "/integration/e-documents", {
              kind: values.kind,
              sourceType: sending.sourceType,
              sourceId: sending.id,
            })
          }
          onSaved={refresh}
        />
      )}
    </Stack>
  );
}

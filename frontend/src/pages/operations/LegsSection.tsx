import { Alert, Box, Button, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { DataTable, FormDialog, SectionHeader, useCan, useCurrencies } from "../finance/common";
import { AvailabilityRow } from "../fleet/types";
import { canEditLegs, formatDateTime, toInstant, useShipmentOptions } from "./common";
import { Candidates, Leg, Shipment } from "./types";

/** Kaynağın durumunu seçim listesinde okunur metne çevirir. */
function useIssueText() {
  const { t } = useTranslation();
  return (issue: string, subject: "VEHICLE" | "DRIVER") => {
    const [code, value] = issue.split(":");
    if (code === "EXPIRED" || code === "MISSING") {
      return `${t(`fleet.issue.${code}`)}: ${t(`fleet.docType.${value}`)}`;
    }
    if (code === "STATUS") {
      return t(`fleet.${subject === "VEHICLE" ? "vehicleStatus" : "driverStatus"}.${value}`);
    }
    return t(`fleet.issue.${code}`);
  };
}

function AssignFleetDialog({
  leg,
  onClose,
  onAssigned,
}: {
  leg: Leg;
  onClose: () => void;
  onAssigned: (warnings: string[]) => void;
}) {
  const { t } = useTranslation();
  const issueText = useIssueText();
  const warnings = useRef<string[]>([]);
  const candidates = useQuery({
    queryKey: ["shipment", "candidates", leg.id],
    queryFn: () => apiGet<Candidates>(`/shipment/legs/${leg.id}/candidates`),
  });
  if (candidates.error) {
    return <ErrorState error={candidates.error} />;
  }
  if (!candidates.data) {
    return null;
  }
  const toOption = (row: AvailabilityRow) => ({
    value: row.subjectId,
    label:
      row.issues.length === 0
        ? row.name
        : `${row.name} — ${row.issues.map((issue) => issueText(issue, row.subjectType)).join(", ")}`,
  });
  return (
    <FormDialog
      title={t("operations.action.assignFleet")}
      fields={[
        {
          name: "vehicleId",
          label: t("operations.field.vehicle"),
          type: "select",
          required: true,
          defaultValue: leg.vehicleId ?? "",
          options: candidates.data.vehicles.map(toOption),
        },
        {
          name: "trailerId",
          label: t("operations.field.trailer"),
          type: "select",
          defaultValue: leg.trailerId ?? "",
          options: candidates.data.trailers.map(toOption),
        },
        {
          name: "driverId",
          label: t("operations.field.driver"),
          type: "select",
          required: true,
          defaultValue: leg.driverId ?? "",
          options: candidates.data.drivers.map(toOption),
        },
      ]}
      onClose={onClose}
      onSubmit={async (values) => {
        const result = await apiRequest<{ warnings: string[] }>(
          "POST",
          `/shipment/legs/${leg.id}/assign`,
          {
            vehicleId: values.vehicleId,
            trailerId: values.trailerId || null,
            driverId: values.driverId,
          },
        );
        warnings.current = result.warnings;
      }}
      onSaved={() => onAssigned(warnings.current)}
    />
  );
}

function AssignCarrierDialog({
  leg,
  onClose,
  onAssigned,
}: {
  leg: Leg;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { t } = useTranslation();
  const options = useShipmentOptions();
  const currencies = useCurrencies();
  if (!options.data || !currencies.data) {
    return null;
  }
  return (
    <FormDialog
      title={t("operations.action.assignCarrier")}
      fields={[
        {
          name: "carrierAccountId",
          label: t("operations.field.carrier"),
          type: "select",
          required: true,
          defaultValue: leg.carrierAccountId ?? "",
          options: options.data.carriers.map((c) => ({ value: c.id, label: c.label })),
        },
        {
          name: "amount",
          label: t("operations.field.carrierCost"),
          type: "amount",
          required: true,
        },
        {
          name: "currency",
          label: t("finance.field.currency"),
          type: "select",
          required: true,
          defaultValue: "TRY",
          options: currencies.data.map((c) => ({ value: c.code, label: c.code })),
        },
      ]}
      onClose={onClose}
      onSubmit={(values) =>
        apiRequest("POST", `/shipment/legs/${leg.id}/assign`, {
          carrierAccountId: values.carrierAccountId,
          carrierCost: { amount: values.amount, currency: values.currency },
        })
      }
      onSaved={onAssigned}
    />
  );
}

export function LegsSection({ shipment }: { shipment: Shipment }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canDispatch = useCan("SHIPMENT_DISPATCH");
  const editable = canDispatch && canEditLegs(shipment.status);
  const [dialog, setDialog] = useState<{ kind: "fleet" | "carrier"; leg: Leg } | null>(null);
  const [adding, setAdding] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const issueText = useIssueText();

  const refresh = () => client.invalidateQueries({ queryKey: ["shipment"] });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/shipment/legs/${id}`),
    onSuccess: refresh,
  });

  /** Sunucu "Ad · KOD:DEĞER" döner; kodu okunur metne çevirir. */
  const warningText = (warning: string) => {
    const [name, issue] = warning.split(" · ");
    return issue ? `${name}: ${issueText(issue, "VEHICLE")}` : warning;
  };

  return (
    <Box>
      <SectionHeader title={t("operations.sections.legs")}>
        {editable && (
          <Button variant="outlined" onClick={() => setAdding(true)}>
            {t("operations.action.addLeg")}
          </Button>
        )}
      </SectionHeader>
      {remove.isError && <ErrorState error={remove.error} />}
      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setWarnings([])}>
          {t("operations.notice.warnings")}
          {warnings.map((warning) => (
            <div key={warning}>{warningText(warning)}</div>
          ))}
        </Alert>
      )}
      <DataTable
        rows={shipment.legs}
        rowKey={(leg) => leg.id}
        columns={[
          { header: "#", render: (leg) => leg.sequenceNo },
          {
            header: t("operations.field.origin"),
            render: (leg) => `${leg.origin} → ${leg.destination}`,
          },
          {
            header: t("operations.field.start"),
            render: (leg) => formatDateTime(leg.plannedStart),
          },
          { header: t("operations.field.end"), render: (leg) => formatDateTime(leg.plannedEnd) },
          {
            header: t("operations.field.assignment"),
            render: (leg) =>
              leg.carrierName
                ? `${t("operations.field.carrier")}: ${leg.carrierName}`
                : leg.vehiclePlate
                  ? `${leg.vehiclePlate}${leg.trailerPlate ? ` / ${leg.trailerPlate}` : ""} · ${leg.driverName}`
                  : t("operations.field.unassigned"),
          },
          {
            header: t("common.actions"),
            align: "right",
            render: (leg) =>
              editable && (
                <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                  <Button size="small" onClick={() => setDialog({ kind: "fleet", leg })}>
                    {t("operations.action.assignFleet")}
                  </Button>
                  <Button size="small" onClick={() => setDialog({ kind: "carrier", leg })}>
                    {t("operations.action.assignCarrier")}
                  </Button>
                  {shipment.legs.length > 1 && (
                    <Button size="small" color="error" onClick={() => remove.mutate(leg.id)}>
                      {t("operations.action.removeLeg")}
                    </Button>
                  )}
                </Stack>
              ),
          },
        ]}
      />
      {dialog?.kind === "fleet" && (
        <AssignFleetDialog
          leg={dialog.leg}
          onClose={() => setDialog(null)}
          onAssigned={(result) => {
            setDialog(null);
            setWarnings(result);
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "carrier" && (
        <AssignCarrierDialog
          leg={dialog.leg}
          onClose={() => setDialog(null)}
          onAssigned={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("operations.action.addLeg")}
          fields={[
            { name: "origin", label: t("operations.field.origin"), required: true },
            { name: "destination", label: t("operations.field.destination"), required: true },
            {
              name: "plannedStart",
              label: t("operations.field.start"),
              type: "datetime",
              required: true,
            },
            {
              name: "plannedEnd",
              label: t("operations.field.end"),
              type: "datetime",
              required: true,
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", `/shipment/shipments/${shipment.id}/legs`, {
              origin: values.origin,
              destination: values.destination,
              plannedStart: toInstant(values.plannedStart),
              plannedEnd: toInstant(values.plannedEnd),
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

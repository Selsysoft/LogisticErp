import { Chip, Link, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiGet } from "../../api/client";
import { DataTable, QueryState, SectionHeader, shiftDays, today } from "../finance/common";
import { formatDateTime, STATUS_COLORS } from "./common";
import { BoardRow } from "./types";

const DEFAULT_RANGE_DAYS = 7;

export function BoardPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(shiftDays(today(), DEFAULT_RANGE_DAYS));
  const rows = useQuery({
    queryKey: ["shipment", "board", from, to],
    queryFn: () => apiGet<BoardRow[]>(`/shipment/board?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });

  return (
    <>
      <SectionHeader title={t("operations.tabs.board")}>
        <TextField
          size="small"
          type="date"
          label={t("finance.field.from")}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={t("finance.field.to")}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </SectionHeader>
      <QueryState isPending={rows.isPending} error={rows.error} />
      {rows.data && (
        <DataTable
          rows={rows.data}
          rowKey={(row) => row.leg.id}
          columns={[
            {
              header: t("operations.field.number"),
              render: (r) => (
                <Link component={RouterLink} to={`/operations/shipments/${r.shipmentId}`}>
                  {r.shipmentNumber}
                </Link>
              ),
            },
            {
              header: t("finance.field.status"),
              render: (r) => (
                <Chip
                  size="small"
                  color={STATUS_COLORS[r.status]}
                  label={t(`operations.status.${r.status}`)}
                />
              ),
            },
            {
              header: t("operations.field.origin"),
              render: (r) => `${r.leg.origin} → ${r.leg.destination}`,
            },
            {
              header: t("operations.field.start"),
              render: (r) => formatDateTime(r.leg.plannedStart),
            },
            { header: t("operations.field.end"), render: (r) => formatDateTime(r.leg.plannedEnd) },
            {
              header: t("operations.field.vehicle"),
              render: (r) =>
                r.leg.vehiclePlate
                  ? `${r.leg.vehiclePlate}${r.leg.trailerPlate ? ` / ${r.leg.trailerPlate}` : ""}`
                  : "",
            },
            { header: t("operations.field.driver"), render: (r) => r.leg.driverName },
            {
              header: t("operations.field.carrier"),
              render: (r) =>
                r.leg.carrierName ??
                (r.leg.vehiclePlate ? (
                  ""
                ) : (
                  <Chip size="small" color="warning" label={t("operations.field.unassigned")} />
                )),
            },
          ]}
        />
      )}
    </>
  );
}

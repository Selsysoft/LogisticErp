import { Button, Chip, Link, MenuItem, TextField } from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { orNull } from "../crm/common";
import {
  DataTable,
  FieldDef,
  FormDialog,
  formatMoney,
  QueryState,
  SectionHeader,
  useBranches,
  useCan,
  useCurrencies,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import {
  formatDateTime,
  localDateTime,
  STATUS_COLORS,
  STATUSES,
  toInstant,
  useShipmentOptions,
} from "./common";
import { Shipment, ShipmentSummary } from "./types";

function NewShipmentDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const createdId = useRef("");
  const options = useShipmentOptions();
  const branches = useBranches();
  const currencies = useCurrencies();
  const field = (name: string) => t(`operations.field.${name}`);

  if (!options.data || !branches.data || !currencies.data) {
    return null;
  }
  const toOptions = (items: { id: string; label: string }[]) =>
    items.map((item) => ({ value: item.id, label: item.label }));
  const fields: FieldDef[] = [
    {
      name: "accountId",
      label: field("customer"),
      type: "select",
      required: true,
      options: toOptions(options.data.customers),
    },
    {
      name: "branchId",
      label: t("finance.field.branch"),
      type: "select",
      required: true,
      options: branches.data.map((branch) => ({ value: branch.id, label: branch.name })),
    },
    { name: "shipperName", label: field("shipperName") },
    { name: "shipperAddress", label: field("shipperAddress") },
    { name: "consigneeName", label: field("consigneeName") },
    { name: "consigneeAddress", label: field("consigneeAddress") },
    { name: "origin", label: field("origin"), required: true },
    { name: "destination", label: field("destination"), required: true },
    {
      name: "plannedPickup",
      label: field("plannedPickup"),
      type: "datetime",
      required: true,
      defaultValue: localDateTime(1),
    },
    {
      name: "plannedDelivery",
      label: field("plannedDelivery"),
      type: "datetime",
      required: true,
      defaultValue: localDateTime(2),
    },
    { name: "cargoDescription", label: field("cargoDescription") },
    { name: "weightKg", label: field("weightKg"), type: "amount" },
    { name: "quantity", label: field("quantity"), type: "amount" },
    { name: "packaging", label: field("packaging") },
    { name: "adrClass", label: field("adrClass") },
    { name: "unNumber", label: field("unNumber") },
    { name: "vehicleType", label: field("vehicleType") },
    { name: "distanceKm", label: field("distanceKm"), type: "amount", helperText: field("kmHelp") },
    {
      name: "quoteLineId",
      label: field("quoteLine"),
      type: "select",
      options: toOptions(options.data.acceptedQuoteLines),
      helperText: field("priceHelp"),
    },
    { name: "manualNet", label: field("manualNet"), type: "amount" },
    {
      name: "currency",
      label: t("finance.field.currency"),
      type: "select",
      required: true,
      defaultValue: "TRY",
      options: currencies.data.map((currency) => ({
        value: currency.code,
        label: currency.code,
      })),
    },
    {
      name: "tariffId",
      label: field("tariff"),
      type: "select",
      options: toOptions(options.data.tariffs),
    },
    {
      name: "taxRateId",
      label: field("taxRate"),
      type: "select",
      options: toOptions(options.data.taxRates),
    },
    { name: "waitingHours", label: field("waitingHours"), type: "amount" },
    { name: "extraStops", label: field("extraStops"), type: "integer" },
    { name: "pallets", label: field("pallets"), type: "integer" },
    { name: "tollAmount", label: field("tollAmount"), type: "amount" },
    { name: "adr", label: field("adr"), type: "checkbox" },
    { name: "notes", label: field("note") },
  ];

  return (
    <FormDialog
      title={t("operations.action.newShipment")}
      fields={fields}
      onClose={onClose}
      onSubmit={async (values, flags) => {
        const created = await apiRequest<Shipment>("POST", "/shipment/shipments", {
          accountId: values.accountId,
          branchId: values.branchId,
          shipperName: orNull(values.shipperName),
          shipperAddress: orNull(values.shipperAddress),
          consigneeName: orNull(values.consigneeName),
          consigneeAddress: orNull(values.consigneeAddress),
          origin: values.origin,
          destination: values.destination,
          plannedPickup: toInstant(values.plannedPickup),
          plannedDelivery: toInstant(values.plannedDelivery),
          vehicleType: orNull(values.vehicleType),
          distanceKm: orNull(values.distanceKm),
          waitingHours: orNull(values.waitingHours),
          extraStops: orNull(values.extraStops),
          pallets: orNull(values.pallets),
          tollAmount: orNull(values.tollAmount),
          adr: flags.adr,
          quoteLineId: orNull(values.quoteLineId),
          tariffId: orNull(values.tariffId),
          taxRateId: orNull(values.taxRateId),
          manualNet: orNull(values.manualNet),
          currency: values.currency,
          notes: orNull(values.notes),
          cargo: values.cargoDescription
            ? [
                {
                  description: values.cargoDescription,
                  weightKg: orNull(values.weightKg),
                  quantity: orNull(values.quantity),
                  packaging: orNull(values.packaging),
                  adrClass: orNull(values.adrClass),
                  unNumber: orNull(values.unNumber),
                },
              ]
            : [],
        });
        createdId.current = created.id;
      }}
      onSaved={() => {
        void client.invalidateQueries({ queryKey: ["shipment"] });
        navigate(`/operations/shipments/${createdId.current}`);
      }}
    />
  );
}

export function ShipmentsPage() {
  const { t } = useTranslation();
  const canDispatch = useCan("SHIPMENT_DISPATCH");
  const paging = usePaging();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const shipments = useQuery({
    queryKey: ["shipment", "list", status, search, paging.page, paging.size],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(paging.page),
        size: String(paging.size),
        sort: "plannedPickup,desc",
      });
      if (status) {
        params.set("status", status);
      }
      if (search) {
        params.set("search", search);
      }
      return apiGet<Page<ShipmentSummary>>(`/shipment/shipments?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <SectionHeader title={t("operations.tabs.shipments")}>
        <TextField
          size="small"
          label={t("finance.field.search")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            paging.setPage(0);
          }}
        />
        <TextField
          select
          size="small"
          label={t("finance.field.status")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            paging.setPage(0);
          }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">—</MenuItem>
          {STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`operations.status.${value}`)}
            </MenuItem>
          ))}
        </TextField>
        {canDispatch && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("operations.action.newShipment")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={shipments.isPending} error={shipments.error} />
      {shipments.data && (
        <DataTable
          rows={shipments.data.content}
          rowKey={(row) => row.id}
          columns={[
            {
              header: t("operations.field.number"),
              render: (r) => (
                <Link component={RouterLink} to={`/operations/shipments/${r.id}`}>
                  {r.number}
                </Link>
              ),
            },
            { header: t("operations.field.customer"), render: (r) => r.accountName },
            {
              header: t("operations.field.origin"),
              render: (r) => `${r.origin} → ${r.destination}`,
            },
            {
              header: t("operations.field.plannedPickup"),
              render: (r) => formatDateTime(r.plannedPickup),
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
              header: t("crm.field.total"),
              align: "right",
              render: (r) => formatMoney(r.total),
            },
          ]}
          pagination={{
            count: shipments.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && <NewShipmentDialog onClose={() => setAdding(false)} />}
    </>
  );
}

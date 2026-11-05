import { Alert, Box, Button, Chip, Link, Stack, TextField } from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { orNull } from "../crm/common";
import { FilesSection } from "../crm/FilesSection";
import {
  DataTable,
  FieldDef,
  FormDialog,
  formatAmount,
  formatDate,
  QueryState,
  SectionHeader,
  useBranches,
  useCan,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import { EXPENSE_KINDS, ExpenseDialog } from "./ExpenseDialog";
import { BlocksSection, DocumentsSection } from "./ResourceSections";
import { FuelConsumption, Vehicle } from "./types";

const KINDS = ["TRACTOR", "TRUCK", "VAN", "TRAILER"];
const OWNERSHIPS = ["OWNED", "LEASED", "SUBCONTRACTED"];
const STATUSES = ["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"];

function useVehicleFields(vehicle?: Vehicle): FieldDef[] {
  const { t } = useTranslation();
  const branches = useBranches();
  return [
    {
      name: "plate",
      label: t("fleet.field.plate"),
      required: true,
      defaultValue: vehicle?.plate ?? "",
    },
    {
      name: "kind",
      label: t("fleet.field.kind"),
      type: "select",
      required: true,
      defaultValue: vehicle?.kind ?? "TRACTOR",
      options: KINDS.map((value) => ({ value, label: t(`fleet.vehicleKind.${value}`) })),
    },
    { name: "brand", label: t("fleet.field.brand"), defaultValue: vehicle?.brand ?? "" },
    { name: "model", label: t("fleet.field.model"), defaultValue: vehicle?.model ?? "" },
    {
      name: "modelYear",
      label: t("fleet.field.modelYear"),
      defaultValue: vehicle?.modelYear?.toString() ?? "",
    },
    {
      name: "capacityTon",
      label: t("fleet.field.capacityTon"),
      type: "amount",
      defaultValue: vehicle?.capacityTon?.toString() ?? "",
    },
    {
      name: "capacityM3",
      label: t("fleet.field.capacityM3"),
      type: "amount",
      defaultValue: vehicle?.capacityM3?.toString() ?? "",
    },
    {
      name: "capacityPallet",
      label: t("fleet.field.capacityPallet"),
      defaultValue: vehicle?.capacityPallet?.toString() ?? "",
    },
    { name: "fuelType", label: t("fleet.field.fuelType"), defaultValue: vehicle?.fuelType ?? "" },
    {
      name: "ownership",
      label: t("fleet.field.ownership"),
      type: "select",
      required: true,
      defaultValue: vehicle?.ownership ?? "OWNED",
      options: OWNERSHIPS.map((value) => ({ value, label: t(`fleet.ownership.${value}`) })),
    },
    {
      name: "status",
      label: t("finance.field.status"),
      type: "select",
      required: true,
      defaultValue: vehicle?.status ?? "ACTIVE",
      options: STATUSES.map((value) => ({ value, label: t(`fleet.vehicleStatus.${value}`) })),
    },
    {
      name: "branchId",
      label: t("finance.field.branch"),
      type: "select",
      defaultValue: vehicle?.branchId ?? "",
      options: (branches.data ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
    },
  ];
}

function vehiclePayload(values: Record<string, string>) {
  return {
    plate: values.plate,
    kind: values.kind,
    brand: orNull(values.brand),
    model: orNull(values.model),
    modelYear: orNull(values.modelYear),
    capacityTon: orNull(values.capacityTon),
    capacityM3: orNull(values.capacityM3),
    capacityPallet: orNull(values.capacityPallet),
    fuelType: orNull(values.fuelType),
    ownership: values.ownership,
    status: values.status,
    branchId: orNull(values.branchId),
  };
}

export function VehiclesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const paging = usePaging();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const fields = useVehicleFields();

  const vehicles = useQuery({
    queryKey: ["fleet", "vehicles", search, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Vehicle>>(
        `/fleet/vehicles?page=${paging.page}&size=${paging.size}&sort=plate&search=${encodeURIComponent(search)}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <SectionHeader title={t("fleet.tabs.vehicles")}>
        <TextField
          size="small"
          label={t("finance.field.search")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            paging.setPage(0);
          }}
        />
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("fleet.action.newVehicle")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={vehicles.isPending} error={vehicles.error} />
      {vehicles.data && (
        <DataTable
          rows={vehicles.data.content}
          rowKey={(row) => row.id}
          columns={[
            {
              header: t("fleet.field.plate"),
              render: (r) => (
                <Link component={RouterLink} to={`/fleet/vehicles/${r.id}`}>
                  {r.plate}
                </Link>
              ),
            },
            { header: t("fleet.field.kind"), render: (r) => t(`fleet.vehicleKind.${r.kind}`) },
            {
              header: t("fleet.field.brand"),
              render: (r) => [r.brand, r.model].filter(Boolean).join(" "),
            },
            {
              header: t("fleet.field.ownership"),
              render: (r) => t(`fleet.ownership.${r.ownership}`),
            },
            {
              header: t("finance.field.status"),
              render: (r) => t(`fleet.vehicleStatus.${r.status}`),
            },
            {
              header: t("fleet.field.capacityTon"),
              align: "right",
              render: (r) => (r.capacityTon ? formatAmount(r.capacityTon) : ""),
            },
            {
              header: t("fleet.field.odometerKm"),
              align: "right",
              render: (r) => (r.odometerKm ? formatAmount(r.odometerKm) : ""),
            },
          ]}
          pagination={{
            count: vehicles.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("fleet.action.newVehicle")}
          fields={fields}
          onClose={() => setAdding(false)}
          onSubmit={(values) => apiRequest("POST", "/fleet/vehicles", vehiclePayload(values))}
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["fleet"] });
          }}
        />
      )}
    </>
  );
}

export function VehicleDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const [editing, setEditing] = useState(false);
  const [expenseKind, setExpenseKind] = useState<string | null>(null);

  const vehicle = useQuery({
    queryKey: ["fleet", "vehicles", "detail", id],
    queryFn: () => apiGet<Vehicle>(`/fleet/vehicles/${id}`),
  });
  const fuel = useQuery({
    queryKey: ["fleet", "fuel", id],
    queryFn: () => apiGet<FuelConsumption>(`/fleet/vehicles/${id}/fuel-consumption`),
  });
  const fields = useVehicleFields(vehicle.data);
  const refresh = () => client.invalidateQueries({ queryKey: ["fleet"] });

  return (
    <Stack spacing={4}>
      <QueryState isPending={vehicle.isPending} error={vehicle.error} />
      {vehicle.data && (
        <SectionHeader
          title={`${vehicle.data.plate} · ${t(`fleet.vehicleKind.${vehicle.data.kind}`)} · ${t(`fleet.vehicleStatus.${vehicle.data.status}`)}`}
        >
          {canEdit && (
            <>
              <Button variant="outlined" onClick={() => setEditing(true)}>
                {t("common.edit")}
              </Button>
              {EXPENSE_KINDS.map((kind) => (
                <Button key={kind} variant="outlined" onClick={() => setExpenseKind(kind)}>
                  {t(`fleet.expenseKind.${kind}`)}
                </Button>
              ))}
            </>
          )}
        </SectionHeader>
      )}
      <DocumentsSection subject="VEHICLE" id={id} />
      <BlocksSection subject="VEHICLE" id={id} />
      <Box>
        <SectionHeader title={t("fleet.sections.fuel")} />
        <QueryState isPending={fuel.isPending} error={fuel.error} />
        {fuel.data?.averageLitersPer100Km && (
          <Alert severity="info" icon={false} sx={{ mb: 1 }}>
            {t("fleet.field.average")}: {formatAmount(fuel.data.averageLitersPer100Km)} L/100 km
          </Alert>
        )}
        {fuel.data && (
          <DataTable
            rows={fuel.data.rows}
            rowKey={(row) => row.expenseId}
            columns={[
              { header: t("finance.field.date"), render: (r) => formatDate(r.date) },
              {
                header: t("fleet.field.odometerKm"),
                align: "right",
                render: (r) => formatAmount(r.odometerKm),
              },
              {
                header: t("fleet.field.liters"),
                align: "right",
                render: (r) => formatAmount(r.liters),
              },
              {
                header: "L/100 km",
                align: "right",
                render: (r) => (r.litersPer100Km ? formatAmount(r.litersPer100Km) : ""),
              },
              {
                header: t("finance.field.status"),
                render: (r) =>
                  r.anomaly && (
                    <Chip size="small" color="warning" label={t("fleet.status.anomaly")} />
                  ),
              },
            ]}
          />
        )}
      </Box>
      {id && <FilesSection ownerType="VEHICLE" ownerId={id} editPermission="FLEET_EDIT" />}
      {editing && vehicle.data && (
        <FormDialog
          title={t("common.edit")}
          fields={fields}
          onClose={() => setEditing(false)}
          onSubmit={(values) => apiRequest("PUT", `/fleet/vehicles/${id}`, vehiclePayload(values))}
          onSaved={() => {
            setEditing(false);
            void refresh();
          }}
        />
      )}
      {expenseKind && vehicle.data && (
        <ExpenseDialog
          kind={expenseKind}
          vehicles={[vehicle.data]}
          onClose={() => setExpenseKind(null)}
          onSaved={() => {
            setExpenseKind(null);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

import { Button, Link, Stack, TextField } from "@mui/material";
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
  QueryState,
  SectionHeader,
  useBranches,
  useCan,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import { BlocksSection, DocumentsSection } from "./ResourceSections";
import { Driver } from "./types";

const STATUSES = ["ACTIVE", "ON_LEAVE", "LEFT"];

function useDriverFields(driver?: Driver): FieldDef[] {
  const { t } = useTranslation();
  const branches = useBranches();
  const fields: FieldDef[] = [
    {
      name: "fullName",
      label: t("crm.field.fullName"),
      required: true,
      defaultValue: driver?.fullName ?? "",
    },
    { name: "phone", label: t("crm.field.phone"), defaultValue: driver?.phone ?? "" },
    {
      name: "licenseClass",
      label: t("fleet.field.licenseClass"),
      defaultValue: driver?.licenseClass ?? "",
    },
    {
      name: "status",
      label: t("finance.field.status"),
      type: "select",
      required: true,
      defaultValue: driver?.status ?? "ACTIVE",
      options: STATUSES.map((value) => ({ value, label: t(`fleet.driverStatus.${value}`) })),
    },
    {
      name: "branchId",
      label: t("finance.field.branch"),
      type: "select",
      defaultValue: driver?.branchId ?? "",
      options: (branches.data ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
    },
  ];
  return driver
    ? fields
    : [{ name: "code", label: t("finance.field.code"), required: true }, ...fields];
}

function driverPayload(values: Record<string, string>) {
  return {
    fullName: values.fullName,
    phone: orNull(values.phone),
    licenseClass: orNull(values.licenseClass),
    status: values.status,
    branchId: orNull(values.branchId),
  };
}

export function DriversPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const paging = usePaging();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const fields = useDriverFields();

  const drivers = useQuery({
    queryKey: ["fleet", "drivers", search, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Driver>>(
        `/fleet/drivers?page=${paging.page}&size=${paging.size}&sort=fullName&search=${encodeURIComponent(search)}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <SectionHeader title={t("fleet.tabs.drivers")}>
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
            {t("fleet.action.newDriver")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={drivers.isPending} error={drivers.error} />
      {drivers.data && (
        <DataTable
          rows={drivers.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.code"), render: (r) => r.code },
            {
              header: t("crm.field.fullName"),
              render: (r) => (
                <Link component={RouterLink} to={`/fleet/drivers/${r.id}`}>
                  {r.fullName}
                </Link>
              ),
            },
            { header: t("crm.field.phone"), render: (r) => r.phone },
            { header: t("fleet.field.licenseClass"), render: (r) => r.licenseClass },
            {
              header: t("finance.field.status"),
              render: (r) => t(`fleet.driverStatus.${r.status}`),
            },
          ]}
          pagination={{
            count: drivers.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("fleet.action.newDriver")}
          fields={fields}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/fleet/drivers", { code: values.code, ...driverPayload(values) })
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["fleet"] });
          }}
        />
      )}
    </>
  );
}

export function DriverDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const [editing, setEditing] = useState(false);

  const driver = useQuery({
    queryKey: ["fleet", "drivers", "detail", id],
    queryFn: () => apiGet<Driver>(`/fleet/drivers/${id}`),
  });
  const fields = useDriverFields(driver.data);

  return (
    <Stack spacing={4}>
      <QueryState isPending={driver.isPending} error={driver.error} />
      {driver.data && (
        <SectionHeader
          title={`${driver.data.code} · ${driver.data.fullName} · ${t(`fleet.driverStatus.${driver.data.status}`)}`}
        >
          {canEdit && (
            <Button variant="outlined" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
          )}
        </SectionHeader>
      )}
      <DocumentsSection subject="DRIVER" id={id} />
      <BlocksSection subject="DRIVER" id={id} />
      {id && <FilesSection ownerType="DRIVER" ownerId={id} editPermission="FLEET_EDIT" />}
      {editing && driver.data && (
        <FormDialog
          title={t("common.edit")}
          fields={fields}
          onClose={() => setEditing(false)}
          onSubmit={(values) => apiRequest("PUT", `/fleet/drivers/${id}`, driverPayload(values))}
          onSaved={() => {
            setEditing(false);
            void client.invalidateQueries({ queryKey: ["fleet"] });
          }}
        />
      )}
    </Stack>
  );
}

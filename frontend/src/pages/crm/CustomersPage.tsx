import { Box, Button, Chip, Link, Stack, TextField, Typography } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatDate,
  QueryState,
  SectionHeader,
  useCan,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import { orNull } from "./common";
import { FilesSection } from "./FilesSection";
import { Activity, Contact, Customer } from "./types";

const TYPES = ["LEAD", "CUSTOMER", "CARRIER", "SUPPLIER"];
const ACTIVITY_TYPES = ["NOTE", "CALL", "MEETING", "TASK"];

function splitTags(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function CustomersPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CRM_EDIT");
  const paging = usePaging();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const customers = useQuery({
    queryKey: ["crm", "customers", search, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Customer>>(
        `/crm/customers?page=${paging.page}&size=${paging.size}&sort=name&search=${encodeURIComponent(search)}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <SectionHeader title={t("crm.tabs.customers")}>
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
            {t("crm.action.newCustomer")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={customers.isPending} error={customers.error} />
      {customers.data && (
        <DataTable
          rows={customers.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.code"), render: (r) => r.code },
            {
              header: t("finance.field.name"),
              render: (r) => (
                <Link component={RouterLink} to={`/crm/customers/${r.id}`}>
                  {r.name}
                </Link>
              ),
            },
            { header: t("finance.field.type"), render: (r) => t(`finance.accountType.${r.type}`) },
            { header: t("crm.field.segment"), render: (r) => r.segment },
            {
              header: t("crm.field.tags"),
              render: (r) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {r.tags.map((tag) => (
                    <Chip key={tag} size="small" label={tag} />
                  ))}
                </Box>
              ),
            },
          ]}
          pagination={{
            count: customers.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("crm.action.newCustomer")}
          fields={[
            { name: "code", label: t("finance.field.code"), required: true },
            { name: "name", label: t("finance.field.name"), required: true },
            {
              name: "type",
              label: t("finance.field.type"),
              type: "select",
              required: true,
              defaultValue: "LEAD",
              options: TYPES.map((value) => ({
                value,
                label: t(`finance.accountType.${value}`),
              })),
            },
            { name: "taxNumber", label: t("finance.field.taxNumber") },
            { name: "segment", label: t("crm.field.segment") },
            { name: "tags", label: t("crm.field.tags"), helperText: t("crm.field.tagsHint") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/crm/customers", {
              code: values.code,
              name: values.name,
              type: values.type,
              taxNumber: orNull(values.taxNumber),
              segment: orNull(values.segment),
              tags: splitTags(values.tags),
            })
          }
          onSaved={() => {
            setAdding(false);
            void client.invalidateQueries({ queryKey: ["crm", "customers"] });
          }}
        />
      )}
    </>
  );
}

export function CustomerDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const canEdit = useCan("CRM_EDIT");
  const [dialog, setDialog] = useState<"contact" | "activity" | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["crm"] });

  const customer = useQuery({
    queryKey: ["crm", "customers", "detail", id],
    queryFn: () => apiGet<Customer>(`/crm/customers/${id}`),
  });
  const contacts = useQuery({
    queryKey: ["crm", "contacts", id],
    queryFn: () => apiGet<Contact[]>(`/crm/customers/${id}/contacts`),
  });
  const activities = useQuery({
    queryKey: ["crm", "activities", id],
    queryFn: () =>
      apiGet<Page<Activity>>(`/crm/customers/${id}/activities?size=50&sort=createdAt,desc`),
  });
  const removeContact = useMutation({
    mutationFn: (contactId: string) => apiRequest("DELETE", `/crm/contacts/${contactId}`),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: (activityId: string) =>
      apiRequest("POST", `/crm/activities/${activityId}/complete`),
    onSuccess: refresh,
  });

  return (
    <Stack spacing={4}>
      <QueryState isPending={customer.isPending} error={customer.error} />
      {customer.data && (
        <Typography variant="h6" component="h2">
          {customer.data.code} · {customer.data.name} ·{" "}
          {t(`finance.accountType.${customer.data.type}`)}
        </Typography>
      )}
      <Box>
        <SectionHeader title={t("crm.sections.contacts")}>
          {canEdit && (
            <Button variant="outlined" onClick={() => setDialog("contact")}>
              {t("crm.action.newContact")}
            </Button>
          )}
        </SectionHeader>
        {removeContact.isError && <ErrorState error={removeContact.error} />}
        {contacts.data && (
          <DataTable
            rows={contacts.data}
            rowKey={(row) => row.id}
            columns={[
              { header: t("crm.field.fullName"), render: (r) => r.fullName },
              { header: t("crm.field.title"), render: (r) => r.title },
              { header: t("crm.field.email"), render: (r) => r.email },
              { header: t("crm.field.phone"), render: (r) => r.phone },
              {
                header: t("common.actions"),
                align: "right",
                render: (r) =>
                  canEdit && (
                    <Button size="small" color="error" onClick={() => removeContact.mutate(r.id)}>
                      {t("common.delete")}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Box>
      <Box>
        <SectionHeader title={t("crm.sections.activities")}>
          {canEdit && (
            <Button variant="outlined" onClick={() => setDialog("activity")}>
              {t("crm.action.newActivity")}
            </Button>
          )}
        </SectionHeader>
        {complete.isError && <ErrorState error={complete.error} />}
        {activities.data && (
          <DataTable
            rows={activities.data.content}
            rowKey={(row) => row.id}
            columns={[
              {
                header: t("crm.field.activityType"),
                render: (r) => t(`crm.activityType.${r.type}`),
              },
              { header: t("crm.field.subject"), render: (r) => r.subject },
              {
                header: t("finance.field.dueDate"),
                render: (r) => (r.dueDate ? formatDate(r.dueDate) : ""),
              },
              {
                header: t("common.actions"),
                align: "right",
                render: (r) =>
                  canEdit &&
                  !r.completedAt &&
                  r.type !== "STAGE_CHANGE" && (
                    <Button size="small" onClick={() => complete.mutate(r.id)}>
                      {t("crm.action.complete")}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Box>
      {id && <FilesSection ownerType="ACCOUNT" ownerId={id} />}
      {dialog === "contact" && (
        <FormDialog
          title={t("crm.action.newContact")}
          fields={[
            { name: "fullName", label: t("crm.field.fullName"), required: true },
            { name: "title", label: t("crm.field.title") },
            { name: "email", label: t("crm.field.email") },
            { name: "phone", label: t("crm.field.phone") },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/crm/customers/${id}/contacts`, {
              fullName: values.fullName,
              title: orNull(values.title),
              email: orNull(values.email),
              phone: orNull(values.phone),
            })
          }
          onSaved={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
      {dialog === "activity" && (
        <FormDialog
          title={t("crm.action.newActivity")}
          fields={[
            {
              name: "type",
              label: t("crm.field.activityType"),
              type: "select",
              required: true,
              defaultValue: "CALL",
              options: ACTIVITY_TYPES.map((value) => ({
                value,
                label: t(`crm.activityType.${value}`),
              })),
            },
            { name: "subject", label: t("crm.field.subject"), required: true },
            { name: "dueDate", label: t("finance.field.dueDate"), type: "date" },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values) =>
            apiRequest("POST", "/crm/activities", {
              accountId: id,
              type: values.type,
              subject: values.subject,
              dueDate: orNull(values.dueDate),
            })
          }
          onSaved={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

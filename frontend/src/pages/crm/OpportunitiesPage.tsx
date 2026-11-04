import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import {
  DataTable,
  FormDialog,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  useCan,
  useCurrencies,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import { customerName, customerOptions, orNull, useCustomers } from "./common";
import { Activity, Opportunity } from "./types";

const STAGES = ["LEAD", "QUALIFIED", "QUOTE", "WON", "LOST"];

/** Backend'deki aşama tablosunun ekrandaki karşılığı. */
const NEXT: Record<string, string[]> = {
  LEAD: ["QUALIFIED", "LOST"],
  QUALIFIED: ["QUOTE", "LOST"],
  QUOTE: ["WON", "LOST", "QUALIFIED"],
};

export function OpportunitiesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CRM_EDIT");
  const customers = useCustomers();
  const currencies = useCurrencies();
  const paging = usePaging();
  const [stage, setStage] = useState("");
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<Opportunity | null>(null);
  const [viewing, setViewing] = useState<Opportunity | null>(null);

  const list = useQuery({
    queryKey: ["crm", "opportunities", stage, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Opportunity>>(
        `/crm/opportunities?page=${paging.page}&size=${paging.size}&sort=createdAt,desc${stage ? `&stage=${stage}` : ""}`,
      ),
    placeholderData: keepPreviousData,
  });
  const history = useQuery({
    queryKey: ["crm", "opportunity-history", viewing?.id],
    queryFn: () => apiGet<Activity[]>(`/crm/opportunities/${viewing?.id}/history`),
    enabled: !!viewing,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["crm"] });

  return (
    <>
      <SectionHeader title={t("crm.tabs.opportunities")}>
        <TextField
          select
          size="small"
          label={t("crm.field.stage")}
          value={stage}
          onChange={(event) => {
            setStage(event.target.value);
            paging.setPage(0);
          }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">{t("finance.plans.all")}</MenuItem>
          {STAGES.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`crm.stage.${value}`)}
            </MenuItem>
          ))}
        </TextField>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("crm.action.newOpportunity")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={list.isPending} error={list.error} />
      {list.data && (
        <DataTable
          rows={list.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("crm.field.subject"), render: (r) => r.title },
            {
              header: t("finance.field.account"),
              render: (r) => customerName(customers.data, r.accountId),
            },
            { header: t("crm.field.stage"), render: (r) => t(`crm.stage.${r.stage}`) },
            { header: t("crm.field.owner"), render: (r) => r.ownerEmail },
            {
              header: t("crm.field.expectedClose"),
              render: (r) => (r.expectedCloseDate ? formatDate(r.expectedCloseDate) : ""),
            },
            { header: t("crm.field.value"), align: "right", render: (r) => formatMoney(r.money) },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) => (
                <>
                  {canEdit && NEXT[r.stage] && (
                    <Button size="small" onClick={() => setMoving(r)}>
                      {t("crm.action.moveStage")}
                    </Button>
                  )}
                  <Button size="small" onClick={() => setViewing(r)}>
                    {t("crm.action.history")}
                  </Button>
                </>
              ),
            },
          ]}
          pagination={{
            count: list.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("crm.action.newOpportunity")}
          fields={[
            {
              name: "accountId",
              label: t("finance.field.account"),
              type: "select",
              required: true,
              options: customerOptions(customers.data),
            },
            { name: "title", label: t("crm.field.subject"), required: true },
            { name: "amount", label: t("crm.field.value"), type: "amount", required: true },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "TRY",
              options: (currencies.data ?? []).map((c) => ({ value: c.code, label: c.code })),
            },
            { name: "expectedCloseDate", label: t("crm.field.expectedClose"), type: "date" },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/crm/opportunities", {
              accountId: values.accountId,
              title: values.title,
              money: { amount: values.amount, currency: values.currency },
              expectedCloseDate: orNull(values.expectedCloseDate),
            })
          }
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
      {moving && (
        <FormDialog
          title={`${t("crm.action.moveStage")} · ${moving.title}`}
          fields={[
            {
              name: "stage",
              label: t("crm.field.stage"),
              type: "select",
              required: true,
              options: (NEXT[moving.stage] ?? []).map((value) => ({
                value,
                label: t(`crm.stage.${value}`),
              })),
            },
            { name: "note", label: t("crm.field.note") },
          ]}
          onClose={() => setMoving(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/crm/opportunities/${moving.id}/stage`, {
              stage: values.stage,
              note: orNull(values.note),
            })
          }
          onSaved={() => {
            setMoving(null);
            void refresh();
          }}
        />
      )}
      <Dialog open={!!viewing} fullWidth maxWidth="sm" onClose={() => setViewing(null)}>
        <DialogTitle>
          {t("crm.action.history")} · {viewing?.title}
        </DialogTitle>
        <DialogContent>
          <QueryState isPending={history.isPending} error={history.error} />
          {history.data && (
            <DataTable
              rows={history.data}
              rowKey={(row) => row.id}
              columns={[
                {
                  header: t("crm.field.activityType"),
                  render: (r) => t(`crm.activityType.${r.type}`),
                },
                { header: t("crm.field.subject"), render: (r) => r.subject },
                { header: t("audit.actor"), render: (r) => r.createdBy },
              ]}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewing(null)}>{t("crm.action.close")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

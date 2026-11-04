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
  today,
  useAccounts,
  useCan,
  useFunds,
  usePaging,
} from "./common";
import { Instrument, InstrumentMovement, Page } from "./types";

const STATUSES = [
  "PORTFOLIO",
  "AT_BANK",
  "COLLECTED",
  "ENDORSED",
  "COLLECTED_TO_CASH",
  "BOUNCED",
  "ISSUED",
  "PAID",
];

/** Backend'deki geçiş tablosunun ekrandaki karşılığı; ciro ödeme ekranından yapılır. */
const NEXT: Record<string, Record<string, string[]>> = {
  RECEIVED: {
    PORTFOLIO: ["AT_BANK", "COLLECTED_TO_CASH"],
    AT_BANK: ["COLLECTED", "BOUNCED", "PORTFOLIO"],
    ENDORSED: ["BOUNCED"],
  },
  ISSUED: { ISSUED: ["PAID", "BOUNCED"] },
};

export function InstrumentsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const accounts = useAccounts();
  const funds = useFunds();
  const paging = usePaging();
  const [status, setStatus] = useState("");
  const [moving, setMoving] = useState<Instrument | null>(null);
  const [viewing, setViewing] = useState<Instrument | null>(null);

  const list = useQuery({
    queryKey: ["finance", "instruments", status, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Instrument>>(
        `/finance/instruments?page=${paging.page}&size=${paging.size}&sort=dueDate${status ? `&status=${status}` : ""}`,
      ),
    placeholderData: keepPreviousData,
  });
  const history = useQuery({
    queryKey: ["finance", "instrument-movements", viewing?.id],
    queryFn: () => apiGet<InstrumentMovement[]>(`/finance/instruments/${viewing?.id}/movements`),
    enabled: !!viewing,
  });
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name ?? "—";

  return (
    <>
      <SectionHeader title={t("finance.tabs.instruments")}>
        <TextField
          select
          size="small"
          label={t("finance.field.status")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            paging.setPage(0);
          }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">{t("finance.plans.all")}</MenuItem>
          {STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`finance.instrumentStatus.${value}`)}
            </MenuItem>
          ))}
        </TextField>
      </SectionHeader>
      <QueryState isPending={list.isPending} error={list.error} />
      {list.data && (
        <DataTable
          rows={list.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("finance.field.number"), render: (r) => r.number },
            {
              header: t("finance.field.kind"),
              render: (r) => t(`finance.instrumentKind.${r.kind}`),
            },
            {
              header: t("finance.field.direction"),
              render: (r) => t(`finance.instrumentDirection.${r.direction}`),
            },
            { header: t("finance.field.account"), render: (r) => accountName(r.accountId) },
            { header: t("finance.field.dueDate"), render: (r) => formatDate(r.dueDate) },
            {
              header: t("finance.field.status"),
              render: (r) => t(`finance.instrumentStatus.${r.status}`),
            },
            {
              header: t("finance.field.amount"),
              align: "right",
              render: (r) => formatMoney(r.money),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) => (
                <>
                  {canPost && (NEXT[r.direction][r.status] ?? []).length > 0 && (
                    <Button size="small" onClick={() => setMoving(r)}>
                      {t("finance.action.move")}
                    </Button>
                  )}
                  <Button size="small" onClick={() => setViewing(r)}>
                    {t("finance.action.history")}
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
      {moving && (
        <FormDialog
          title={`${t("finance.action.move")} · ${moving.number}`}
          fields={[
            {
              name: "toStatus",
              label: t("finance.field.target"),
              type: "select",
              required: true,
              options: (NEXT[moving.direction][moving.status] ?? []).map((value) => ({
                value,
                label: t(`finance.instrumentStatus.${value}`),
              })),
            },
            {
              name: "fundAccountId",
              label: t("finance.field.fund"),
              type: "select",
              options: (funds.data ?? [])
                .filter((fund) => fund.currency === moving.money.currency)
                .map((fund) => ({
                  value: fund.id,
                  label: `${fund.name} · ${t(`finance.fundKind.${fund.kind}`)}`,
                })),
            },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            { name: "note", label: t("finance.field.note") },
            {
              name: "exchangeRate",
              label: t("finance.field.rate"),
              type: "amount",
              helperText: t("finance.field.rateHint"),
            },
          ]}
          onClose={() => setMoving(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/finance/instruments/${moving.id}/transition`, {
              toStatus: values.toStatus,
              fundAccountId: values.fundAccountId || null,
              date: values.date,
              note: values.note || null,
              exchangeRate: values.exchangeRate || null,
            })
          }
          onSaved={() => {
            setMoving(null);
            void client.invalidateQueries({ queryKey: ["finance"] });
          }}
        />
      )}
      <Dialog open={!!viewing} fullWidth maxWidth="sm" onClose={() => setViewing(null)}>
        <DialogTitle>
          {t("finance.action.history")} · {viewing?.number}
        </DialogTitle>
        <DialogContent>
          <QueryState isPending={history.isPending} error={history.error} />
          {history.data && (
            <DataTable
              rows={history.data}
              rowKey={(row) => row.id}
              columns={[
                { header: t("finance.field.date"), render: (r) => formatDate(r.movementDate) },
                {
                  header: t("finance.field.status"),
                  render: (r) => t(`finance.instrumentStatus.${r.toStatus}`),
                },
                { header: t("finance.field.note"), render: (r) => r.note },
                { header: t("audit.actor"), render: (r) => r.createdBy },
              ]}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewing(null)}>{t("finance.action.close")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

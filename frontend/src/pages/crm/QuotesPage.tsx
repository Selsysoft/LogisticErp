import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { apiDownload, apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatAmount,
  formatDate,
  formatMoney,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  useCan,
  useCurrencies,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import {
  customerName,
  customerOptions,
  orNull,
  useCustomers,
  useTariffs,
  useTaxRates,
} from "./common";
import { FilesSection } from "./FilesSection";
import { PriceBreakdownTable } from "./PriceBreakdownTable";
import { Opportunity, Quote, QuoteLine } from "./types";

const STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "SUPERSEDED"];

export function QuotesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canEdit = useCan("CRM_EDIT");
  const customers = useCustomers();
  const tariffs = useTariffs();
  const taxRates = useTaxRates();
  const currencies = useCurrencies();
  const paging = usePaging();
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);

  const list = useQuery({
    queryKey: ["crm", "quotes", status, paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Quote>>(
        `/crm/quotes?page=${paging.page}&size=${paging.size}&sort=createdAt,desc${status ? `&status=${status}` : ""}`,
      ),
    placeholderData: keepPreviousData,
  });
  const opportunities = useQuery({
    queryKey: ["crm", "opportunities", "options"],
    queryFn: () => apiGet<Page<Opportunity>>("/crm/opportunities?size=200&sort=createdAt,desc"),
    select: (page) => page.content.filter((o) => o.stage !== "WON" && o.stage !== "LOST"),
    enabled: adding,
  });

  return (
    <>
      <SectionHeader title={t("crm.tabs.quotes")}>
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
          <MenuItem value="">{t("finance.plans.all")}</MenuItem>
          {STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`crm.quoteStatus.${value}`)}
            </MenuItem>
          ))}
        </TextField>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("crm.action.newQuote")}
          </Button>
        )}
      </SectionHeader>
      <QueryState isPending={list.isPending} error={list.error} />
      {list.data && (
        <DataTable
          rows={list.data.content}
          rowKey={(row) => row.id}
          columns={[
            {
              header: t("crm.field.number"),
              render: (r) => (
                <Link component={RouterLink} to={`/crm/quotes/${r.id}`}>
                  {r.number} / v{r.version}
                </Link>
              ),
            },
            {
              header: t("finance.field.account"),
              render: (r) => customerName(customers.data, r.accountId),
            },
            { header: t("crm.field.validUntil"), render: (r) => formatDate(r.validUntil) },
            { header: t("finance.field.status"), render: (r) => t(`crm.quoteStatus.${r.status}`) },
            { header: t("crm.field.total"), align: "right", render: (r) => formatMoney(r.total) },
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
          title={t("crm.action.newQuote")}
          fields={[
            {
              name: "accountId",
              label: t("finance.field.account"),
              type: "select",
              required: true,
              options: customerOptions(customers.data),
            },
            {
              name: "opportunityId",
              label: t("crm.field.opportunity"),
              type: "select",
              options: (opportunities.data ?? []).map((o) => ({ value: o.id, label: o.title })),
            },
            {
              name: "tariffId",
              label: t("crm.field.tariff"),
              type: "select",
              options: (tariffs.data ?? []).map((x) => ({
                value: x.id,
                label: `${x.code} · ${x.name}`,
              })),
            },
            {
              name: "taxRateId",
              label: t("crm.field.taxRate"),
              type: "select",
              options: (taxRates.data ?? []).map((x) => ({ value: x.id, label: x.name })),
            },
            {
              name: "currency",
              label: t("finance.field.currency"),
              type: "select",
              required: true,
              defaultValue: "TRY",
              options: (currencies.data ?? []).map((c) => ({ value: c.code, label: c.code })),
            },
            {
              name: "validUntil",
              label: t("crm.field.validUntil"),
              type: "date",
              required: true,
              defaultValue: shiftDays(today(), 15),
            },
            { name: "notes", label: t("crm.field.notes") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={async (values) => {
            const quote = await apiRequest<Quote>("POST", "/crm/quotes", {
              accountId: values.accountId,
              opportunityId: orNull(values.opportunityId),
              tariffId: orNull(values.tariffId),
              taxRateId: orNull(values.taxRateId),
              currency: values.currency,
              validUntil: values.validUntil,
              notes: orNull(values.notes),
            });
            navigate(`/crm/quotes/${quote.id}`);
          }}
          onSaved={() => setAdding(false)}
        />
      )}
    </>
  );
}

export function QuoteDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const canEdit = useCan("CRM_EDIT");
  const customers = useCustomers();
  const tariffs = useTariffs();
  const [dialog, setDialog] = useState<"line" | "accept" | null>(null);
  const [viewing, setViewing] = useState<QuoteLine | null>(null);

  const quote = useQuery({
    queryKey: ["crm", "quotes", "detail", id],
    queryFn: () => apiGet<Quote>(`/crm/quotes/${id}`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["crm"] });
  const action = useMutation({
    mutationFn: (name: "send" | "reject") => apiRequest("POST", `/crm/quotes/${id}/${name}`),
    onSuccess: refresh,
  });
  const removeLine = useMutation({
    mutationFn: (lineId: string) => apiRequest("DELETE", `/crm/quotes/${id}/lines/${lineId}`),
    onSuccess: refresh,
  });
  const newVersion = useMutation({
    mutationFn: () => apiRequest<Quote>("POST", `/crm/quotes/${id}/new-version`),
    onSuccess: (next) => {
      void refresh();
      navigate(`/crm/quotes/${next.id}`);
    },
  });
  const pdf = useMutation({
    mutationFn: (name: string) => apiDownload(`/crm/quotes/${id}/pdf`, `${name}.pdf`),
  });

  const data = quote.data;
  const isDraft = data?.status === "DRAFT";
  const amount = (value: number) => `${formatAmount(value)} ${data?.currency}`;

  return (
    <Stack spacing={3}>
      <QueryState isPending={quote.isPending} error={quote.error} />
      {action.isError && <ErrorState error={action.error} />}
      {newVersion.isError && <ErrorState error={newVersion.error} />}
      {removeLine.isError && <ErrorState error={removeLine.error} />}
      {pdf.isError && <ErrorState error={pdf.error} />}
      {data && (
        <>
          <SectionHeader title={`${data.number} / v${data.version}`}>
            <Button variant="outlined" onClick={() => pdf.mutate(data.number)}>
              {t("crm.action.pdf")}
            </Button>
            {canEdit && isDraft && (
              <>
                <Button variant="outlined" onClick={() => setDialog("line")}>
                  {t("crm.action.addLine")}
                </Button>
                <Button
                  variant="contained"
                  disabled={action.isPending}
                  onClick={() => action.mutate("send")}
                >
                  {t("crm.action.send")}
                </Button>
              </>
            )}
            {canEdit && data.status === "SENT" && (
              <>
                <Button variant="contained" onClick={() => setDialog("accept")}>
                  {t("crm.action.accept")}
                </Button>
                <Button color="error" onClick={() => action.mutate("reject")}>
                  {t("crm.action.reject")}
                </Button>
              </>
            )}
            {canEdit && (data.status === "SENT" || data.status === "REJECTED") && (
              <Button
                variant="outlined"
                disabled={newVersion.isPending}
                onClick={() => newVersion.mutate()}
              >
                {t("crm.action.newVersion")}
              </Button>
            )}
          </SectionHeader>
          <Alert severity="info" icon={false}>
            {customerName(customers.data, data.accountId)} · {t(`crm.quoteStatus.${data.status}`)} ·{" "}
            {t("crm.field.validUntil")}: {formatDate(data.validUntil)}
          </Alert>
          <DataTable
            rows={data.lines}
            rowKey={(row) => row.id}
            columns={[
              { header: t("crm.field.origin"), render: (r) => r.origin },
              { header: t("crm.field.destination"), render: (r) => r.destination },
              { header: t("crm.field.vehicleType"), render: (r) => r.vehicleType },
              { header: t("crm.field.net"), align: "right", render: (r) => amount(r.net) },
              { header: t("crm.field.vat"), align: "right", render: (r) => amount(r.vat) },
              { header: t("crm.field.total"), align: "right", render: (r) => amount(r.total) },
              {
                header: t("common.actions"),
                align: "right",
                render: (r) => (
                  <>
                    <Button size="small" onClick={() => setViewing(r)}>
                      {t("crm.action.detail")}
                    </Button>
                    {canEdit && isDraft && (
                      <Button size="small" color="error" onClick={() => removeLine.mutate(r.id)}>
                        {t("crm.action.removeLine")}
                      </Button>
                    )}
                  </>
                ),
              },
            ]}
          />
          <Stack sx={{ alignItems: "flex-end" }}>
            <Typography variant="body2">
              {t("crm.field.net")}: {formatMoney(data.net)}
            </Typography>
            <Typography variant="body2">
              {t("crm.field.vat")}: {formatMoney(data.vat)}
            </Typography>
            {Number(data.withholding.amount) > 0 && (
              <Typography variant="body2">
                {t("crm.field.withholding")}: −{formatMoney(data.withholding)}
              </Typography>
            )}
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t("crm.field.total")}: {formatMoney(data.total)}
            </Typography>
          </Stack>
          <FilesSection ownerType="QUOTE" ownerId={data.id} />
        </>
      )}
      {dialog === "line" && (
        <FormDialog
          title={t("crm.action.addLine")}
          fields={[
            { name: "origin", label: t("crm.field.origin"), required: true },
            { name: "destination", label: t("crm.field.destination"), required: true },
            { name: "vehicleType", label: t("crm.field.vehicleType") },
            { name: "weightTon", label: t("crm.field.weightTon"), type: "amount" },
            { name: "pallets", label: t("crm.field.pallets") },
            { name: "distanceKm", label: t("crm.field.distanceKm"), type: "amount" },
            { name: "waitingHours", label: t("crm.field.waitingHours"), type: "amount" },
            { name: "extraStops", label: t("crm.field.extraStops") },
            { name: "tollAmount", label: t("crm.field.tollAmount"), type: "amount" },
            { name: "adr", label: t("crm.field.adr"), type: "checkbox" },
            {
              name: "manualNet",
              label: t("crm.field.manualNet"),
              type: "amount",
              helperText: t("crm.field.manualNetHint"),
            },
            { name: "description", label: t("finance.field.description") },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values, flags) =>
            apiRequest("POST", `/crm/quotes/${id}/lines`, {
              origin: values.origin,
              destination: values.destination,
              vehicleType: orNull(values.vehicleType),
              weightTon: orNull(values.weightTon),
              pallets: orNull(values.pallets),
              distanceKm: orNull(values.distanceKm),
              waitingHours: orNull(values.waitingHours),
              extraStops: orNull(values.extraStops),
              tollAmount: orNull(values.tollAmount),
              adr: flags.adr,
              manualNet: orNull(values.manualNet),
              description: orNull(values.description),
            })
          }
          onSaved={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
      {dialog === "accept" && (
        <FormDialog
          title={t("crm.action.accept")}
          fields={[
            {
              name: "startDate",
              label: t("crm.field.startDate"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "endDate",
              label: t("crm.field.endDate"),
              type: "date",
              required: true,
              defaultValue: shiftDays(today(), 365),
            },
            {
              name: "tariffId",
              label: t("crm.field.tariff"),
              type: "select",
              defaultValue: data?.tariffId ?? "",
              options: (tariffs.data ?? []).map((x) => ({
                value: x.id,
                label: `${x.code} · ${x.name}`,
              })),
            },
            { name: "paymentTermDays", label: t("crm.field.paymentTerm") },
            { name: "fuelSurchargePercent", label: t("crm.field.fuelPercent"), type: "amount" },
            { name: "waitingHourlyFee", label: t("crm.field.waitingFee"), type: "amount" },
            { name: "specialTerms", label: t("crm.field.specialTerms") },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={(values) =>
            apiRequest("POST", `/crm/quotes/${id}/accept`, {
              startDate: values.startDate,
              endDate: values.endDate,
              tariffId: orNull(values.tariffId),
              paymentTermDays: orNull(values.paymentTermDays),
              fuelSurchargePercent: orNull(values.fuelSurchargePercent),
              waitingHourlyFee: orNull(values.waitingHourlyFee),
              specialTerms: orNull(values.specialTerms),
            })
          }
          onSaved={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
      <Dialog open={!!viewing} fullWidth maxWidth="sm" onClose={() => setViewing(null)}>
        <DialogTitle>{t("crm.sections.breakdown")}</DialogTitle>
        <DialogContent>
          {viewing && <PriceBreakdownTable price={viewing.breakdown} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewing(null)}>{t("crm.action.close")}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

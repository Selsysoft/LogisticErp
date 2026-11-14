import {
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import { branchLabel } from "./branchOptions";
import { withCompany } from "./companyQuery";
import {
  DataTable,
  formatAmount,
  formatMoney,
  QueryState,
  SectionHeader,
  today,
  useAccounts,
  useBranches,
  useMultiCompany,
} from "./common";
import { Aging, DailyReport } from "./types";

export function ReportsPage() {
  return (
    <Stack spacing={5}>
      <DailySection />
      <AgingSection />
    </Stack>
  );
}

/** Şube filtresi boşken tüm şubeler raporlanır. */
function DailySection() {
  const { t } = useTranslation();
  const branches = useBranches();
  const accounts = useAccounts();
  const [type, setType] = useState<"PAYMENT" | "COLLECTION">("PAYMENT");
  const [date, setDate] = useState(today());
  const [selected, setSelected] = useState<string[]>([]);
  const companyId = useActiveCompanyId();
  const multiCompany = useMultiCompany();
  // Aktif şirketin iş yerleri (pasifler dahil: geçmiş hareketleri raporlanır); konsolidede tümü.
  const visible = (branches.data ?? []).filter(
    (branch) => !companyId || branch.companyId === companyId,
  );
  const branchIds = selected.filter((id) => visible.some((branch) => branch.id === id));

  const report = useQuery({
    queryKey: ["finance", "daily", type, date, branchIds, companyId],
    queryFn: () => {
      const branchParams = branchIds.map((id) => `&branchIds=${id}`).join("");
      return apiGet<DailyReport>(
        withCompany(`/finance/reports/daily?type=${type}&date=${date}${branchParams}`, companyId),
      );
    },
    enabled: !!date,
  });
  const branchName = (id: string) => branches.data?.find((b) => b.id === id)?.name ?? "—";
  const accountName = (id: string | null) => accounts.data?.find((a) => a.id === id)?.name ?? "—";

  return (
    <Box>
      <SectionHeader title={t("finance.reports.daily")}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={type}
          onChange={(_, value: "PAYMENT" | "COLLECTION" | null) => value && setType(value)}
        >
          <ToggleButton value="PAYMENT">{t("finance.settlementType.PAYMENT")}</ToggleButton>
          <ToggleButton value="COLLECTION">{t("finance.settlementType.COLLECTION")}</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          type="date"
          label={t("finance.field.date")}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </SectionHeader>
      <FormGroup row sx={{ mb: 2 }}>
        {visible.map((branch) => (
          <FormControlLabel
            key={branch.id}
            label={branchLabel(branch, multiCompany)}
            control={
              <Checkbox
                size="small"
                checked={selected.includes(branch.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, branch.id]
                      : selected.filter((id) => id !== branch.id),
                  )
                }
              />
            }
          />
        ))}
      </FormGroup>
      <QueryState isPending={report.isPending} error={report.error} />
      {report.data && (
        <Stack spacing={2}>
          <DataTable
            rows={report.data.totals}
            rowKey={(row) => `${row.branchId}-${row.currency}`}
            columns={[
              { header: t("finance.field.branch"), render: (r) => branchName(r.branchId) },
              { header: t("finance.field.count"), align: "right", render: (r) => r.count },
              {
                header: t("finance.field.total"),
                align: "right",
                render: (r) => `${formatAmount(r.total)} ${r.currency}`,
              },
            ]}
          />
          {report.data.rows.length > 0 && (
            <DataTable
              rows={report.data.rows}
              rowKey={(row) => row.id}
              columns={[
                { header: t("finance.field.branch"), render: (r) => branchName(r.branchId) },
                { header: t("finance.field.account"), render: (r) => accountName(r.accountId) },
                {
                  header: t("finance.field.method"),
                  render: (r) => t(`finance.method.${r.method}`),
                },
                { header: t("finance.field.description"), render: (r) => r.description },
                {
                  header: t("finance.field.amount"),
                  align: "right",
                  render: (r) => formatMoney(r.money),
                },
              ]}
            />
          )}
        </Stack>
      )}
    </Box>
  );
}

function AgingSection() {
  const { t } = useTranslation();
  const [type, setType] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE");
  const [asOf, setAsOf] = useState(today());
  const companyId = useActiveCompanyId();
  const multiCompany = useMultiCompany();
  const report = useQuery({
    queryKey: ["finance", "aging", type, asOf, companyId],
    queryFn: () =>
      apiGet<Aging[]>(withCompany(`/finance/reports/aging?type=${type}&asOf=${asOf}`, companyId)),
    enabled: !!asOf,
  });
  const amount = (value: number, currency: string) => `${formatAmount(value)} ${currency}`;

  return (
    <Box>
      <SectionHeader title={t("finance.reports.aging")}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={type}
          onChange={(_, value: "RECEIVABLE" | "PAYABLE" | null) => value && setType(value)}
        >
          <ToggleButton value="RECEIVABLE">{t("finance.accountType.CUSTOMER")}</ToggleButton>
          <ToggleButton value="PAYABLE">{t("finance.accountType.SUPPLIER")}</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          type="date"
          label={t("finance.field.date")}
          value={asOf}
          onChange={(event) => setAsOf(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </SectionHeader>
      {multiCompany && !companyId && (
        // Konsolide yaşlandırma şirket kırılımlı FIFO ile hesaplanır (12.1a §4.14 karar 2).
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mb: 1 }}>
          {t("finance.aging.perCompanyNote")}
        </Typography>
      )}
      <QueryState isPending={report.isPending} error={report.error} />
      {report.data && (
        <DataTable
          rows={report.data}
          rowKey={(row) => `${row.accountId}-${row.currency}`}
          columns={[
            { header: t("finance.field.account"), render: (r) => r.accountName },
            {
              header: t("finance.reports.days0To30"),
              align: "right",
              render: (r) => amount(r.days0To30, r.currency),
            },
            {
              header: t("finance.reports.days31To60"),
              align: "right",
              render: (r) => amount(r.days31To60, r.currency),
            },
            {
              header: t("finance.reports.days61To90"),
              align: "right",
              render: (r) => amount(r.days61To90, r.currency),
            },
            {
              header: t("finance.reports.daysOver90"),
              align: "right",
              render: (r) => amount(r.daysOver90, r.currency),
            },
            {
              header: t("finance.field.total"),
              align: "right",
              render: (r) => amount(r.total, r.currency),
            },
          ]}
        />
      )}
    </Box>
  );
}

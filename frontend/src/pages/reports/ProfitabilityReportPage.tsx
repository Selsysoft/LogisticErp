import { Alert, MenuItem, Stack, TextField } from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import {
  DataTable,
  formatAmount,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  usePaging,
} from "../finance/common";
import { formatPercent, reportQuery } from "./common";
import { ExportButtons, PeriodFilter, StatGrid, StatTile } from "./components";
import { ProfitGroup, ProfitReport } from "./types";

const GROUPS: ProfitGroup[] = ["SHIPMENT", "CUSTOMER", "ROUTE", "VEHICLE", "OWNERSHIP"];
const DEFAULT_RANGE_DAYS = 30;

export function ProfitabilityReportPage() {
  const { t } = useTranslation();
  const [group, setGroup] = useState<ProfitGroup>("CUSTOMER");
  const [from, setFrom] = useState(shiftDays(today(), -DEFAULT_RANGE_DAYS));
  const [to, setTo] = useState(shiftDays(today(), DEFAULT_RANGE_DAYS));
  const [branchId, setBranchId] = useState("");
  const paging = usePaging(50);
  const filters = { group, from, to, branchId };
  const report = useQuery({
    queryKey: ["reports", "profitability", filters, paging.page, paging.size],
    queryFn: () =>
      apiGet<ProfitReport>(
        `/reports/profitability${reportQuery({ ...filters, page: paging.page, size: paging.size })}`,
      ),
    enabled: !!from && !!to,
    placeholderData: keepPreviousData,
  });
  const resetAnd = (apply: () => void) => {
    paging.setPage(0);
    apply();
  };
  const splitAcrossLegs = group === "VEHICLE" || group === "OWNERSHIP";

  return (
    <Stack spacing={2}>
      <SectionHeader title={t("reports.tabs.profitability")}>
        <TextField
          size="small"
          select
          label={t("reports.field.group")}
          value={group}
          onChange={(event) => resetAnd(() => setGroup(event.target.value as ProfitGroup))}
          sx={{ minWidth: 150 }}
        >
          {GROUPS.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`reports.group.${value}`)}
            </MenuItem>
          ))}
        </TextField>
        <PeriodFilter
          from={from}
          to={to}
          branchId={branchId}
          onFrom={(value) => resetAnd(() => setFrom(value))}
          onTo={(value) => resetAnd(() => setTo(value))}
          onBranch={(value) => resetAnd(() => setBranchId(value))}
        />
        <ExportButtons report="PROFITABILITY" params={filters} />
      </SectionHeader>
      <Alert severity="info">
        {t("reports.profitNote")}
        {splitAcrossLegs && ` ${t("reports.legSplitNote")}`}
      </Alert>
      <QueryState isPending={report.isPending} error={report.error} />
      {report.data && (
        <>
          <StatGrid>
            <StatTile
              label={t("reports.field.revenue")}
              value={`${formatAmount(report.data.revenueTl)} TL`}
            />
            <StatTile
              label={t("reports.field.cost")}
              value={`${formatAmount(report.data.costTl)} TL`}
            />
            <StatTile
              label={t("reports.field.margin")}
              value={`${formatAmount(report.data.marginTl)} TL`}
            />
            <StatTile
              label={t("reports.field.marginPercent")}
              value={formatPercent(report.data.marginPercent)}
            />
          </StatGrid>
          <DataTable
            rows={report.data.rows}
            rowKey={(row) => row.key}
            pagination={{
              count: report.data.totalElements,
              page: paging.page,
              size: paging.size,
              onPage: paging.setPage,
              onSize: paging.setSize,
            }}
            columns={[
              { header: t(`reports.group.${group}`), render: (row) => row.label },
              {
                header: t("reports.field.shipments"),
                align: "right",
                render: (row) => row.shipments,
              },
              {
                header: t("reports.field.revenue"),
                align: "right",
                render: (row) => formatAmount(row.revenueTl),
              },
              {
                header: t("reports.field.cost"),
                align: "right",
                render: (row) => formatAmount(row.costTl),
              },
              {
                header: t("reports.field.margin"),
                align: "right",
                render: (row) => formatAmount(row.marginTl),
              },
              {
                header: t("reports.field.marginPercent"),
                align: "right",
                render: (row) => formatPercent(row.marginPercent),
              },
            ]}
          />
        </>
      )}
    </Stack>
  );
}

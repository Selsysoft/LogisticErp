import { Chip, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { DataTable, QueryState, SectionHeader, shiftDays, today } from "../finance/common";
import { AvailabilityRow } from "./types";

const COLORS = { AVAILABLE: "success", WARNING: "warning", BLOCKED: "error" } as const;

export function AvailabilityPage() {
  const { t } = useTranslation();
  const [type, setType] = useState<"VEHICLE" | "DRIVER">("VEHICLE");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(shiftDays(today(), 3));
  const [minTon, setMinTon] = useState("");

  const rows = useQuery({
    queryKey: ["fleet", "availability", type, from, to, minTon],
    queryFn: () =>
      apiGet<AvailabilityRow[]>(
        `/fleet/availability?type=${type}&from=${from}&to=${to}${minTon && type === "VEHICLE" ? `&minTon=${minTon}` : ""}`,
      ),
    enabled: !!from && !!to,
  });

  /** Kodları okunur metne çevirir: EXPIRED:SRC → "Süresi dolmuş: SRC". */
  const describe = (issue: string) => {
    const [code, value] = issue.split(":");
    if (code === "EXPIRED" || code === "MISSING") {
      return `${t(`fleet.issue.${code}`)}: ${t(`fleet.docType.${value}`)}`;
    }
    if (code === "STATUS") {
      return t(`fleet.${type === "VEHICLE" ? "vehicleStatus" : "driverStatus"}.${value}`);
    }
    return t(`fleet.issue.${code}`);
  };

  return (
    <>
      <SectionHeader title={t("fleet.tabs.availability")}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={type}
          onChange={(_, value: "VEHICLE" | "DRIVER" | null) => value && setType(value)}
        >
          <ToggleButton value="VEHICLE">{t("fleet.tabs.vehicles")}</ToggleButton>
          <ToggleButton value="DRIVER">{t("fleet.tabs.drivers")}</ToggleButton>
        </ToggleButtonGroup>
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
        {type === "VEHICLE" && (
          <TextField
            size="small"
            label={t("fleet.field.minTon")}
            value={minTon}
            onChange={(event) => setMinTon(event.target.value.replace(",", "."))}
            sx={{ width: 130 }}
          />
        )}
      </SectionHeader>
      <QueryState isPending={rows.isPending} error={rows.error} />
      {rows.data && (
        <DataTable
          rows={rows.data}
          rowKey={(row) => row.subjectId}
          columns={[
            { header: t("finance.field.name"), render: (r) => r.name },
            {
              header: t("finance.field.status"),
              render: (r) => (
                <Chip
                  size="small"
                  color={COLORS[r.availability]}
                  label={t(`fleet.availability.${r.availability}`)}
                />
              ),
            },
            {
              header: t("fleet.field.issues"),
              render: (r) => r.issues.map((issue) => <div key={issue}>{describe(issue)}</div>),
            },
          ]}
        />
      )}
    </>
  );
}

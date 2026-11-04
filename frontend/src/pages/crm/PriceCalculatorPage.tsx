import { Box, Button } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../api/client";
import { FormDialog, SectionHeader, today } from "../finance/common";
import { customerOptions, orNull, useCustomers, useTariffs, useTaxRates } from "./common";
import { PriceBreakdownTable } from "./PriceBreakdownTable";
import { PriceBreakdown } from "./types";

export function PriceCalculatorPage() {
  const { t } = useTranslation();
  const customers = useCustomers();
  const tariffs = useTariffs();
  const taxRates = useTaxRates();
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState<PriceBreakdown | null>(null);

  return (
    <Box>
      <SectionHeader title={t("crm.tabs.pricing")}>
        <Button variant="contained" onClick={() => setOpen(true)}>
          {t("crm.action.calculate")}
        </Button>
      </SectionHeader>
      {result && <PriceBreakdownTable price={result} />}
      {open && customers.isSuccess && tariffs.isSuccess && taxRates.isSuccess && (
        <FormDialog
          title={t("crm.tabs.pricing")}
          submitLabel={t("crm.action.calculate")}
          fields={[
            {
              name: "accountId",
              label: t("finance.field.account"),
              type: "select",
              options: customerOptions(customers.data),
            },
            {
              name: "tariffId",
              label: t("crm.field.tariff"),
              type: "select",
              options: tariffs.data.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` })),
            },
            {
              name: "taxRateId",
              label: t("crm.field.taxRate"),
              type: "select",
              options: taxRates.data.map((x) => ({ value: x.id, label: x.name })),
            },
            {
              name: "date",
              label: t("finance.field.date"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
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
          ]}
          onClose={() => setOpen(false)}
          onSubmit={async (values, flags) => {
            setResult(
              await apiRequest<PriceBreakdown>("POST", "/crm/pricing/calculate", {
                accountId: orNull(values.accountId),
                tariffId: orNull(values.tariffId),
                taxRateId: orNull(values.taxRateId),
                date: values.date,
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
              }),
            );
          }}
          onSaved={() => setOpen(false)}
        />
      )}
    </Box>
  );
}

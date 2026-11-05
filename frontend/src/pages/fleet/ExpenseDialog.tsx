import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { orNull } from "../crm/common";
import { FieldDef, FormDialog, today, useBranches, useCurrencies } from "../finance/common";
import { FleetOptions } from "./types";

export const EXPENSE_KINDS = ["FUEL", "MAINTENANCE", "REPAIR", "TIRE"];

/** Yakıtta litre ve km, bakımda sonraki vade, lastikte konum sorulur. */
export function ExpenseDialog({
  kind,
  vehicles,
  onClose,
  onSaved,
}: {
  kind: string;
  vehicles: { id: string; plate: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const branches = useBranches();
  const currencies = useCurrencies();
  const options = useQuery({
    queryKey: ["fleet", "options"],
    queryFn: () => apiGet<FleetOptions>("/fleet/options"),
  });

  if (!branches.isSuccess || !currencies.isSuccess || !options.isSuccess) {
    return null;
  }

  const fields: FieldDef[] = [
    {
      name: "vehicleId",
      label: t("fleet.field.vehicle"),
      type: "select",
      required: true,
      defaultValue: vehicles.length === 1 ? vehicles[0].id : "",
      options: vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plate })),
    },
    {
      name: "branchId",
      label: t("finance.field.branch"),
      type: "select",
      required: true,
      options: branches.data.map((branch) => ({ value: branch.id, label: branch.name })),
    },
    {
      name: "date",
      label: t("finance.field.date"),
      type: "date",
      required: true,
      defaultValue: today(),
    },
    { name: "amount", label: t("finance.field.amount"), type: "amount", required: true },
    {
      name: "currency",
      label: t("finance.field.currency"),
      type: "select",
      required: true,
      defaultValue: "TRY",
      options: currencies.data.map((c) => ({ value: c.code, label: c.code })),
    },
    {
      name: "supplierAccountId",
      label: t("fleet.field.supplier"),
      type: "select",
      helperText: t("fleet.field.targetHint"),
      options: options.data.suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.label,
      })),
    },
    {
      name: "fundAccountId",
      label: t("finance.field.fund"),
      type: "select",
      options: options.data.funds.map((fund) => ({
        value: fund.id,
        label: `${fund.label} (${fund.currency})`,
      })),
    },
    {
      name: "odometerKm",
      label: t("fleet.field.odometerKm"),
      type: "amount",
      required: kind === "FUEL",
    },
  ];
  if (kind === "FUEL") {
    fields.push(
      { name: "liters", label: t("fleet.field.liters"), type: "amount", required: true },
      { name: "station", label: t("fleet.field.station") },
    );
  }
  if (kind === "TIRE") {
    fields.push({ name: "tirePosition", label: t("fleet.field.tirePosition") });
  }
  if (kind === "MAINTENANCE") {
    fields.push(
      { name: "nextDueDate", label: t("fleet.field.nextDueDate"), type: "date" },
      { name: "nextDueKm", label: t("fleet.field.nextDueKm"), type: "amount" },
    );
  }
  fields.push(
    { name: "description", label: t("finance.field.description") },
    {
      name: "exchangeRate",
      label: t("finance.field.rate"),
      type: "amount",
      helperText: t("finance.field.rateHint"),
    },
  );

  return (
    <FormDialog
      title={t(`fleet.expenseKind.${kind}`)}
      fields={fields}
      onClose={onClose}
      onSubmit={(values) =>
        apiRequest("POST", `/fleet/vehicles/${values.vehicleId}/expenses`, {
          kind,
          date: values.date,
          branchId: values.branchId,
          money: { amount: values.amount, currency: values.currency },
          supplierAccountId: orNull(values.supplierAccountId),
          fundAccountId: orNull(values.fundAccountId),
          odometerKm: orNull(values.odometerKm),
          liters: orNull(values.liters),
          station: orNull(values.station),
          tirePosition: orNull(values.tirePosition),
          nextDueDate: orNull(values.nextDueDate),
          nextDueKm: orNull(values.nextDueKm),
          description: orNull(values.description),
          exchangeRate: orNull(values.exchangeRate),
        })
      }
      onSaved={onSaved}
    />
  );
}

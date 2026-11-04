import { Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { DataTable, formatAmount } from "../finance/common";
import { PriceBreakdown } from "./types";

/** Hangi kalemin ne kattığını gösterir. */
export function PriceBreakdownTable({ price }: { price: PriceBreakdown }) {
  const { t } = useTranslation();
  const amount = (value: string) => `${formatAmount(value)} ${price.currency}`;

  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        {t("crm.field.source")}: {t(`crm.source.${price.source}`)}
        {price.tariffCode ? ` · ${price.tariffCode}` : ""}
      </Typography>
      <DataTable
        rows={price.components}
        rowKey={(row) => row.code}
        columns={[
          { header: t("crm.field.component"), render: (r) => t(`crm.component.${r.code}`) },
          { header: t("crm.field.basis"), render: (r) => r.basis },
          { header: t("crm.field.amount"), align: "right", render: (r) => amount(r.amount) },
        ]}
      />
      <Stack sx={{ alignItems: "flex-end" }}>
        <Typography variant="body2">
          {t("crm.field.net")}: {amount(price.net)}
        </Typography>
        <Typography variant="body2">
          {t("crm.field.vat")} (%{formatAmount(price.vatPercent)}): {amount(price.vat)}
        </Typography>
        {Number(price.withholding) > 0 && (
          <Typography variant="body2">
            {t("crm.field.withholding")}: −{amount(price.withholding)}
          </Typography>
        )}
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {t("crm.field.total")}: {amount(price.total)}
        </Typography>
      </Stack>
    </Stack>
  );
}

import { MenuItem, Select } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../auth/authStore";
import { activeCompanies, isMultiCompany, useCompanyStore } from "../auth/companyStore";

/**
 * AppBar'daki aktif şirket seçici (12.1a §6.13). Yalnız ≥2 aktif şirketi olan kiracıda çizilir.
 * "Tüm şirketler (konsolide)" = null: ekranlar şirket süzgeci göndermez. Seçim companyStore'a
 * yazılır; listeler ve ZTO seçim bileşenleri sorgu anahtarlarındaki companyId ile kendiliğinden yenilenir.
 */
export function ActiveCompanySwitcher() {
  const { t } = useTranslation();
  const companies = useAuthStore((state) => state.me?.companies);
  const activeCompanyId = useCompanyStore((state) => state.activeCompanyId);
  const setActive = useCompanyStore((state) => state.setActive);

  if (!isMultiCompany(companies)) {
    return null;
  }

  return (
    <Select
      size="small"
      variant="standard"
      disableUnderline
      value={activeCompanyId ?? ""}
      onChange={(event) => setActive(event.target.value === "" ? null : event.target.value)}
      displayEmpty
      inputProps={{ "aria-label": t("common.activeCompany") }}
      sx={{
        color: "inherit",
        mr: 1,
        maxWidth: { xs: 140, sm: 240 },
        "& .MuiSelect-select": {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
        "& .MuiSelect-icon": { color: "inherit" },
      }}
    >
      <MenuItem value="">{t("common.consolidated")}</MenuItem>
      {activeCompanies(companies).map((company) => (
        <MenuItem key={company.id} value={company.id}>
          {company.shortName}
        </MenuItem>
      ))}
    </Select>
  );
}

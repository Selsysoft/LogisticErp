import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useActiveCompanyId } from "../../../../auth/companyStore";
import { filterTreeByCompany, useBranchTree } from "../../../branch/branchTree";
import { branchIdsOf, filterOptions, filterStateOf } from "./subcontractLogic";

type Props = {
  /** "STE" (liste) ya da "CSD" (detay): ZTO kimlikleri `#branchFilterSTE`, `#workPlaceFilterCSD`. */
  suffix: "STE" | "CSD";
  branchIds: readonly string[];
  onChange: (branchIds: string[]) => void;
};

const BASE = {
  fontSize: 10,
  border: "1px solid #dee2e6",
  borderRadius: 6,
  padding: "4px 8px",
  color: "#333",
  background: "#fff",
  cursor: "pointer",
} as const;
const WIDTHS = {
  STE: { branch: { minWidth: 120, maxWidth: 160 }, workPlace: { minWidth: 130, maxWidth: 180 } },
  CSD: { branch: { minWidth: 115, maxWidth: 150 }, workPlace: { minWidth: 130, maxWidth: 170 } },
} as const;

/**
 * Şube + İş Yeri süzgeci (ZTO SalesTruckExpenses Index.cshtml:321-344, CompanySalesDetails:496-519).
 * Şube = şube grubu, İş Yeri = Blackrose iş yeri (branch); seçim URL'ye `branchIds` olarak yazılır.
 * Ağaç aktif şirkete göre süzülür (12.1a §6.5).
 */
export function SubcontractFilters({ suffix, branchIds, onChange }: Props) {
  const { t } = useTranslation("ztoFinans");
  const tree = useBranchTree("mine");
  const activeCompanyId = useActiveCompanyId();
  const options = useMemo(
    () => filterOptions(tree.data ? filterTreeByCompany(tree.data, activeCompanyId) : undefined),
    [tree.data, activeCompanyId],
  );
  const state = filterStateOf(options, branchIds);
  const places = state.groupKey
    ? options.workPlaces.filter((place) => place.groupKey === state.groupKey)
    : options.workPlaces;
  const widths = WIDTHS[suffix];

  return (
    <>
      <select
        id={`branchFilter${suffix}`}
        className="no-select2"
        aria-label={t("salesTruckExpenses.filters.branchLabel")}
        style={{ ...BASE, ...widths.branch }}
        value={state.groupKey}
        disabled={tree.isPending}
        onChange={(event) =>
          onChange(branchIdsOf(options, { groupKey: event.target.value, workPlaceId: "" }))
        }
      >
        <option value="">{t("salesTruckExpenses.filters.allBranches")}</option>
        {options.groups.map((group) => (
          <option key={group.key} value={group.key}>
            {group.name}
          </option>
        ))}
      </select>
      <select
        id={`workPlaceFilter${suffix}`}
        className="no-select2"
        aria-label={t("salesTruckExpenses.filters.workPlaceLabel")}
        style={{ ...BASE, ...widths.workPlace }}
        value={state.workPlaceId}
        disabled={tree.isPending}
        onChange={(event) =>
          onChange(
            branchIdsOf(options, { groupKey: state.groupKey, workPlaceId: event.target.value }),
          )
        }
      >
        <option value="">{t("salesTruckExpenses.filters.allWorkPlaces")}</option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name}
          </option>
        ))}
      </select>
    </>
  );
}

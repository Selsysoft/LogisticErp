import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { subtree, useBranchTree } from "../../zto/branch/branchTree";
import { ZtoBranchMultiSelect } from "../../zto/components/ZtoBranchMultiSelect";
import { ZtoBranchSelect } from "../../zto/components/ZtoBranchSelect";
import { ZtoFinansRoot } from "../../zto/ZtoFinansRoot";
import type { BranchScopeValue } from "./types";

export type UserBranchScopePickerProps = {
  scope: BranchScopeValue;
  branchIds: string[];
  defaultBranchId: string | null;
  onBranchIdsChange: (ids: string[]) => void;
  onDefaultBranchChange: (id: string | null) => void;
};

/**
 * İş yeri seçimi ZTO bileşenleriyle (12.1a §6.13, §9.2): MUI diyaloğunun içinde .zto-finans kökü.
 * UserBranchScopeTab bu modülü React.lazy ile yükler; ZTO CSS'i yalnız sekme açılınca iner. Ağaç
 * tüm şirketleri (companyId null) ve pasif iş yerlerini içerir: kapsam pasif iş yerine de verilebilir.
 */
export default function UserBranchScopePicker({
  scope,
  branchIds,
  defaultBranchId,
  onBranchIdsChange,
  onDefaultBranchChange,
}: UserBranchScopePickerProps) {
  const { t } = useTranslation();
  const tree = useBranchTree("all", true);
  // ALL: varsayılan iş yeri tüm ağaçtan; LIMITED: yalnız seçilenlerden. İki bileşen aynı sorguyu paylaşır.
  const limitedTree = useMemo(
    () => (scope === "LIMITED" ? subtree(tree.data ?? [], branchIds) : undefined),
    [scope, tree.data, branchIds],
  );

  return (
    <ZtoFinansRoot>
      {scope === "LIMITED" && (
        <div className="form-group mb-3">
          <ZtoBranchMultiSelect
            variant="list"
            scope="all"
            includeInactive
            emptyMeansAll={false}
            companyId={null}
            value={branchIds}
            onChange={onBranchIdsChange}
          />
        </div>
      )}
      <div className="form-group">
        <label htmlFor="user-default-branch">{t("users.defaultBranch")}</label>
        <ZtoBranchSelect
          id="user-default-branch"
          tree={limitedTree}
          scope="all"
          includeInactive
          companyId={null}
          allowClear
          value={defaultBranchId ?? ""}
          onChange={(id) => onDefaultBranchChange(id === "" ? null : id)}
        />
      </div>
    </ZtoFinansRoot>
  );
}

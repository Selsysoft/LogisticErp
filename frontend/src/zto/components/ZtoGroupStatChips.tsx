import { useTranslation } from "react-i18next";
import { toggleStatSelection, type StatGroup } from "./branchMultiSelectLogic";

/*
 * Varyant D: istatistik çipleri (MX5 §1.7). Markup BankIntroduction/Index.cshtml:1095-1111
 * ("İş Yerleri" kartı), davranış toggleDynamicFilter (:2372-2387). Veri sayfanın kendi listesinden
 * buildStatGroups ile kurulur (BankIntroductionController.cs:228-230, :472-488).
 * Stiller (.stat-main-card, .stat-item.active …) sayfaya özgüdür; sayfa CSS'iyle gelir.
 */

export type ZtoGroupStat = StatGroup;

export interface ZtoGroupStatChipsProps {
  groups: ZtoGroupStat[];
  /** Etkin çipin adı; null/undefined = süzgeç yok. */
  active?: string | null;
  /** Etkin çipe yeniden tıklanınca null. */
  onSelect: (name: string | null) => void;
  /** Kart başlığı; varsayılan "İş Yerleri". */
  title?: string;
  /** Başlık simgesi; varsayılan "fas fa-building text-success". */
  iconClassName?: string;
  /** data-filter-type; varsayılan "workplacename". */
  filterType?: string;
}

export function ZtoGroupStatChips({
  groups,
  active,
  onSelect,
  title,
  iconClassName = "fas fa-building text-success",
  filterType = "workplacename",
}: ZtoGroupStatChipsProps) {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="stat-main-card">
      <div className="stat-main-header">
        <i className={iconClassName} aria-hidden="true" />
        <span>{title ?? t("branch.statTitle")}</span>
      </div>
      <div className="stat-items-wrapper">
        {groups.map((group) => {
          const isActive = active === group.name;
          const select = () => onSelect(toggleStatSelection(active, group.name));
          return (
            <div
              key={group.name}
              className={isActive ? "stat-item active" : "stat-item"}
              data-filter-type={filterType}
              data-filter-value={group.name}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onClick={select}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select();
                }
              }}
            >
              <span className="stat-item-label">{group.name}</span>
              <span className="stat-item-value">{group.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

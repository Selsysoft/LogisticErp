import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export type ZtoDefinitionListCardProps = {
  title: ReactNode;
  /** Font Awesome sınıfı (introduction-details.js:51 entityIcons), ör. "fas fa-building". */
  icon: string;
  count: number;
  /** Verilirse "Yeni Kayıt" bağlantısı (yetki varken). */
  newHref?: string;
  newLabel?: ReactNode;
  /** Tablonun üstünde, kart gövdesinde (ör. "Pasifleri göster"). */
  toolbar?: ReactNode;
  /** Kart gövdesinin üstündeki bildirim (ZtoAlert). */
  notice?: ReactNode;
  /** ZtoDataTable (id="dataTable", "table table-hover definition-list-table"). */
  children: ReactNode;
};

const HEADER_ROW_STYLE = {
  margin: 2,
  display: "flex",
  justifyContent: "space-between",
  flexDirection: "row",
  alignItems: "center",
} as const;
const TITLE_HOST_STYLE = { alignItems: "center" } as const;
const TITLE_STYLE = { margin: 0, alignItems: "center" } as const;

/**
 * ZTO tanım listesi kartı (12.1a §6.8 Şablon A): WorkPlace/Index.cshtml:8-27 iskeleti ve
 * introduction-details.js decorateHeader (:291-321) + enhanceDefinitionTable (:354-364) süslemesi
 * sonrası son DOM, bildirimsel.
 */
export function ZtoDefinitionListCard({
  title,
  icon,
  count,
  newHref,
  newLabel,
  toolbar,
  notice,
  children,
}: ZtoDefinitionListCardProps) {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="row">
      <div className="col-xl-12">
        <section className="card custom-card definition-list-surface">
          <header className="card-header custom-card-header definition-list-header">
            <div style={HEADER_ROW_STYLE}>
              <div style={TITLE_HOST_STYLE} className="definition-list-title">
                <span className="definition-list-title__icon">
                  <i className={icon} />
                </span>
                <span className="definition-list-title__copy">
                  <h5 style={TITLE_STYLE}>
                    {title}
                    {" "}
                    <i className="fas fa-list-ul" />
                    <span className="definition-list-count" title={t("definitions.totalRecords")}>
                      {count}
                    </span>
                  </h5>
                  <small>{t("definitions.subtitle")}</small>
                </span>
              </div>
              {newHref !== undefined && (
                <Link to={newHref} className="btn btn-primary">
                  <i className="fas fa-plus" /> {newLabel ?? t("definitions.newRecord")}
                </Link>
              )}
            </div>
          </header>
          <div className="card-body definition-list-body">
            {notice}
            {toolbar}
            <div className="table-responsive definition-list-table-wrap">{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

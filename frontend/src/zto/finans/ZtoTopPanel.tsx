import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../auth/authStore";

const INDUSTRY_STYLE = { color: "#007bff" } as const;
const BRANCH_STYLE = { color: "#0056b3", textDecoration: "none" } as const;
const WORKPLACE_STYLE = { color: "#007bff" } as const;

interface ZtoTopPanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Varsayılan "fas fa-user-tie". */
  icon?: string;
  /** Seçili şube/il; boşsa "Tüm Şubeler". */
  branchName?: string;
  /** Seçili iş yeri; boşsa "Tüm İş Yerleri". */
  workPlaceName?: string;
}

/**
 * Finans paneli üst şeridi (AllTransactions.cshtml:1160-1196, kaynağı customeraccounts/index başlığı):
 * sayfa başlığı + alt yazı, şube/iş yeri bilgisi, karşılama kutusu. Stiller
 * styles/pages/all-transactions.css (.at-top-panel). ZTO'daki 👋 ve marka adı alınmadı.
 */
export function ZtoTopPanel({
  title,
  subtitle,
  icon = "fas fa-user-tie",
  branchName,
  workPlaceName,
}: ZtoTopPanelProps) {
  const { t } = useTranslation("ztoFinans");
  const fullName = useAuthStore((state) => state.me?.fullName ?? "");
  return (
    <div className="row at-top-panel">
      <div className="col-md-7">
        <div className="content page-header-modern">
          <h6>
            <i className={icon} aria-hidden="true" /> <b>{title}</b>
          </h6>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
          <hr />
        </div>
      </div>
      <div className="col-md-2">
        <div className="mt-2">
          <div className="d-flex justify-content-between align-items-start">
            <div className="mr-2">
              <i className="fas fa-industry fa-2x" style={INDUSTRY_STYLE} aria-hidden="true" />
            </div>
            <div className="text-right flex-grow-1">
              <span className="d-block mb-1 font-weight-bold" style={BRANCH_STYLE}>
                <i className="fas fa-map-marker-alt mr-1" aria-hidden="true" />{" "}
                {branchName || t("common.allBranches")}
              </span>
              <small className="d-block font-weight-bold" style={WORKPLACE_STYLE}>
                <i className="fas fa-globe mr-1" aria-hidden="true" />{" "}
                {workPlaceName || t("common.allWorkPlaces")}
              </small>
            </div>
          </div>
          <hr />
        </div>
      </div>
      <div className="col-md-3">
        <div className="welcome">
          <div className="welcome-content">
            {t("common.hello")},{" "}
            <b>
              {fullName} ({t("common.financeRole")})
            </b>
          </div>
          <div className="welcome-content lower-opacity">{t("common.welcomeBack")}</div>
        </div>
      </div>
    </div>
  );
}

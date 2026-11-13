import { useTranslation } from "react-i18next";
import { ZtoPageHeader } from "../../components/ZtoPageHeader";
import { ZtoTopPanel } from "../ZtoTopPanel";

// ZTO sidebar düzeninde sayfa kabı: container-fluid + padding-left:25px (AllTransactions.cshtml:1153).
const PAGE_STYLE = { paddingLeft: 25 } as const;

/**
 * Günlük Tüm Cari İşlemleri iskeleti (AllTransactions.cshtml:1153-1216 ve tablo kartı :1319-1343).
 * Filtre, arama, çipler ve tablo ekranla birlikte Faz 12.1'de gelir; 12.0'da yalnız sayfa başı ve
 * bilgilendirme.
 */
export function AllTransactionsPlaceholderPage() {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="container-fluid bank-statement-page" style={PAGE_STYLE}>
      <ZtoTopPanel
        title={t("pages.allTransactions.panelTitle")}
        subtitle={t("pages.allTransactions.panelSubtitle")}
      />
      <div className="card mb-3 at-header-card">
        <ZtoPageHeader
          variant="panel"
          icon="fas fa-calendar-day"
          title={t("pages.allTransactions.title")}
          breadcrumb={[
            { icon: "fas fa-home", label: t("pages.allTransactions.breadcrumbRoot") },
            {
              icon: "fas fa-file-invoice-dollar",
              label: t("pages.allTransactions.breadcrumbCurrent"),
            },
          ]}
        />
      </div>
      <div className="card">
        <div className="card-body">
          <div className="alert alert-info mb-0" role="status">
            <i className="fas fa-info-circle mr-1" aria-hidden="true" />{" "}
            <strong>{t("pages.placeholder.title")}:</strong>{" "}
            {t("pages.placeholder.body", { step: "12.1" })}
          </div>
        </div>
      </div>
    </div>
  );
}

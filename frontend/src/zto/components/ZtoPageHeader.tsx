import { CSSProperties, Fragment, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export interface ZtoBreadcrumbItem {
  label: ReactNode;
  /** Font Awesome sınıfı, ör. "fas fa-chart-line". */
  icon?: string;
  /** Verilirse bağlantı olur. */
  to?: string;
}

export interface ZtoPageHeaderProps {
  title: ReactNode;
  /** Başlık kutusundaki simge (.erp-header-icon), ör. "fas fa-money-bill-wave". */
  icon: string;
  /** Simge kutusunun satır içi stili (BankTransactions'taki mavi degrade gibi). */
  iconStyle?: CSSProperties;
  breadcrumb?: ZtoBreadcrumbItem[];
  /** Geri düğmesi (erp-btn erp-btn-secondary). */
  back?: { to: string; title?: string; label?: ReactNode };
  /** Sağdaki düğmeler. */
  actions?: ReactNode;
  /** Başlık ile düğmeler arasındaki alan (AllTransactions'taki cari arama, çipler). */
  children?: ReactNode;
  /**
   * "page": finans sayfalarının "PROFESYONEL HEADER"ı (Payments.cshtml:2001-2026, Checks, BankTransactions):
   *   card-header bg-white border-bottom, başlık h6.text-dark 600, ayırıcı "›", son öğe text-primary.
   * "panel": AllTransactions.cshtml:1200-1216 başlık kartı: card-header bg-white py-2 px-3,
   *   başlık h6.font-weight-bold #1e293b, ayırıcı "/", breadcrumb dar ekranda gizli.
   */
  variant?: "page" | "panel";
}

const PAGE_HEADER_STYLE: CSSProperties = { padding: "10px 20px" };
const PANEL_HEADER_STYLE: CSSProperties = { overflow: "visible" };
const PAGE_TITLE_STYLE: CSSProperties = { fontSize: 14, fontWeight: 600 };
const PANEL_TITLE_STYLE: CSSProperties = { fontSize: 14, color: "#1e293b" };
const GAP_12: CSSProperties = { gap: 12 };
const GAP_14: CSSProperties = { gap: 14 };
const SHRINK_0: CSSProperties = { flexShrink: 0 };
const BACK_STYLE: CSSProperties = { marginRight: 8 };

/**
 * ZTO finans sayfa başlığı. Bir `.card`'ın ilk çocuğu olarak kullanılır:
 * `<div className="card"><ZtoPageHeader …/><div className="card-body">…</div></div>`.
 * Stiller styles/pages/erp-header.css (bankstatement/index.css:723-971).
 */
export function ZtoPageHeader({
  title,
  icon,
  iconStyle,
  breadcrumb = [],
  back,
  actions,
  children,
  variant = "page",
}: ZtoPageHeaderProps) {
  const { t } = useTranslation("ztoFinans");
  const panel = variant === "panel";
  const separator = panel ? "/" : "›";

  const crumbs = breadcrumb.map((item, index) => {
    const last = index === breadcrumb.length - 1;
    const inner = (
      <>
        {item.icon && <i className={item.icon} aria-hidden="true" />} {item.label}
      </>
    );
    const node = item.to ? <Link to={item.to}>{inner}</Link> : inner;
    return (
      <Fragment key={index}>
        {/* "panel" varyantında kap display:block (d-md-block); ZTO işaretlemesindeki boşluklar korunur. */}
        {index > 0 && panel && " "}
        {index > 0 && (
          <span className="separator" aria-hidden="true">
            {separator}
          </span>
        )}
        {index > 0 && panel && " "}
        {panel ? (
          node
        ) : (
          <span
            className={last && index > 0 ? "text-primary font-weight-semibold" : undefined}
            aria-current={last ? "page" : undefined}
          >
            {node}
          </span>
        )}
      </Fragment>
    );
  });

  const heading = panel ? (
    <div>
      <h6 className="mb-0 font-weight-bold" style={PANEL_TITLE_STYLE}>
        {title}
      </h6>
      {breadcrumb.length > 0 && <div className="erp-breadcrumb d-none d-md-block">{crumbs}</div>}
    </div>
  ) : (
    <div className="ml-3">
      <h6 className="mb-0 text-dark" style={PAGE_TITLE_STYLE}>
        {title}
      </h6>
      {breadcrumb.length > 0 && <div className="erp-breadcrumb mt-1">{crumbs}</div>}
    </div>
  );

  const iconBox = (
    <div className="erp-header-icon" style={iconStyle}>
      <i className={icon} aria-hidden="true" />
    </div>
  );

  if (panel) {
    return (
      <div className="card-header bg-white py-2 px-3" style={PANEL_HEADER_STYLE}>
        <div
          className="d-flex justify-content-between align-items-center flex-nowrap"
          style={GAP_14}
        >
          <div className="d-flex align-items-center gap-2" style={SHRINK_0}>
            {iconBox}
            {heading}
          </div>
          {children}
          {(actions || back) && (
            <div className="d-flex align-items-center gap-2" style={SHRINK_0}>
              {actions}
              {back && (
                <Link to={back.to} className="erp-btn erp-btn-secondary" title={back.title}>
                  <i className="fas fa-arrow-left" aria-hidden="true" />
                  <span className="d-none d-lg-inline">{back.label ?? t("common.back")}</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card-header bg-white border-bottom" style={PAGE_HEADER_STYLE}>
      <div className="d-flex justify-content-between align-items-center flex-wrap">
        <div className="d-flex align-items-center flex-wrap" style={GAP_12}>
          {back && (
            <Link
              to={back.to}
              className="erp-btn erp-btn-secondary"
              title={back.title}
              style={BACK_STYLE}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
              <span className="d-none d-md-inline">{back.label ?? t("common.back")}</span>
            </Link>
          )}
          <div className="d-flex align-items-center">
            {iconBox}
            {heading}
          </div>
          {children}
        </div>
        {actions && (
          <div className="d-flex align-items-center flex-wrap" style={GAP_12}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

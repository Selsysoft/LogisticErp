import { Fragment, ReactNode } from "react";
import { Link } from "react-router-dom";

export type ZtoDefinitionCrumb = { label: ReactNode; to?: string };

export type ZtoDefinitionBreadcrumbProps = {
  /** Son öğe etkin (li.active); öncekiler bağlantı. Öğeler arasına li.divider girer. */
  items: ZtoDefinitionCrumb[];
  title: ReactNode;
  /** Font Awesome sınıfı, ör. "fas fa-building" (introduction-details.js entityIcons). */
  icon: string;
  /** ZTO Add view'larında `<hr />` var, Edit'lerde yok (definition-form.css:64 zaten gizler). */
  showHr?: boolean;
};

/**
 * ZTO tanım formu başı (WorkPlace/Add.cshtml:12-18, BranchProvince/Add.cshtml:13-19): ol.breadcrumb
 * + h4 başlık; introduction-details.js:489-495 süslemesiyle h4.definition-form-title ve ilk çocuk
 * span.definition-form-title__icon.
 */
export function ZtoDefinitionBreadcrumb({
  items,
  title,
  icon,
  showHr = false,
}: ZtoDefinitionBreadcrumbProps) {
  return (
    <>
      <ol className="breadcrumb">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={index}>
              {index > 0 && <li className="divider" />}
              {last ? (
                <li className="active">{item.label}</li>
              ) : (
                <li>
                  {item.to !== undefined ? <Link to={item.to}>{item.label}</Link> : item.label}
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
      <h4 className="definition-form-title">
        <span className="definition-form-title__icon">
          <i className={icon} />
        </span>
        {title}
      </h4>
      {showHr && <hr />}
    </>
  );
}

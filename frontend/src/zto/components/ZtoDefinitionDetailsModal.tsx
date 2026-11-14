import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../format";
import type { ZtoAuditInfo } from "./ZtoAuditCell";
import {
  actorText,
  entityAccent,
  ENTITY_ICONS,
  fieldIcon,
  type DefinitionEntityKey,
} from "./definitionLogic";
import { ZtoModal } from "./ZtoModal";

export type ZtoDefinitionField = { label: string; value: ReactNode };

export type ZtoDefinitionDetailsModalProps = {
  show: boolean;
  onHide: () => void;
  entityKey: DefinitionEntityKey;
  /** Varlık adı ("İş Yeri", "Şube", "Şirket"): içerik gelince modal başlığı olur. */
  entityTitle: string;
  /** Kaydın adı (hero h4). */
  recordTitle: ReactNode;
  /** "Kayıt No #…": Blackrose'da UUID yerine kod (şube grubunda ad). */
  recordId: string;
  /** "Aktif"/"Pasif"; verilirse hero rozetinde. */
  status?: string;
  fields: ZtoDefinitionField[];
  /** null: içerik hazırlanıyor (definition-details-loading, başlık "Tanım Bilgileri"). */
  audit: ZtoAuditInfo | null;
};

/**
 * Tanım "Detay" modalı (12.1a §6.8 Şablon C): ZTO _DefinitionDetailsModal.cshtml çerçevesi ve
 * DefinitionDetails/_Details.cshtml gövdesi birebir. Veri listedeki satırdan gelir (ek uç yok). ZTO'nun
 * üçüncü "Son Erişen" kartı ve "Son Finansal Hareket" bölümü yok (Blackrose erişim kaydı tutmuyor;
 * kayıtlı sapma §9.2).
 */
export function ZtoDefinitionDetailsModal({
  show,
  onHide,
  entityKey,
  entityTitle,
  recordTitle,
  recordId,
  status,
  fields,
  audit,
}: ZtoDefinitionDetailsModalProps) {
  const { t } = useTranslation("ztoFinans");
  const system = t("definitions.systemImport");
  const loaded = audit !== null;
  const updated = (audit?.updateCount ?? 0) > 0;

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      centered
      size="lg"
      className="definition-details-modal"
      id="definitionDetailsModal"
      titlePrefix={
        <span className="definition-details-modal__eyebrow">{t("definitions.eyebrow")}</span>
      }
      title={loaded ? entityTitle : t("definitions.modalTitle")}
    >
      {!loaded ? (
        <div className="definition-details-loading">
          <span className="spinner-border spinner-border-sm" role="status" />
          <span>{t("definitions.loading")}</span>
        </div>
      ) : (
        <div
          className={`definition-details definition-details--vivid dd-accent-${entityAccent(entityKey)}`}
          data-definition-modal-title={entityTitle}
        >
          <section className="definition-details__hero definition-details__hero--vivid">
            <span className="definition-details__hero-icon">
              <i className={`fas ${ENTITY_ICONS[entityKey]}`} />
            </span>
            <div className="definition-details__hero-content">
              <small>{entityTitle}</small>
              <h4>{recordTitle}</h4>
              {status && (
                <div className="definition-details__hero-meta">
                  <span className="definition-details__status">
                    <i className="fas fa-circle" />
                    {status}
                  </span>
                </div>
              )}
            </div>
            <span className="definition-details__record-number">
              {t("definitions.recordNo")} <strong>#{recordId}</strong>
            </span>
          </section>

          <section className="definition-details__section">
            <div className="definition-details__section-title">
              <i className="fas fa-info-circle" />
              <span>{t("definitions.generalInfo")}</span>
            </div>
            <div className="definition-details__field-grid">
              {fields.map((field, index) => (
                <div
                  key={`${field.label}-${index}`}
                  className="definition-details__field definition-details__field--icon"
                >
                  <span className="definition-details__field-icon">
                    <i className={`fas ${fieldIcon(field.label)}`} />
                  </span>
                  <div className="definition-details__field-content">
                    <span>{field.label}</span>
                    <strong>
                      {field.value === null || field.value === undefined || field.value === ""
                        ? "-"
                        : field.value}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="definition-details__section definition-details__section--audit">
            <div className="definition-details__section-title">
              <i className="fas fa-history" />
              <span>{t("definitions.auditSection")}</span>
            </div>
            <div className="definition-audit-cards">
              <article className="definition-audit-card definition-audit-card--created">
                <span>
                  <i className="fas fa-plus" />
                </span>
                <div>
                  <small>{t("definitions.createdBy")}</small>
                  <strong>{actorText(audit.createdBy, system)}</strong>
                  <time>{formatDateTime(audit.createdAt) || "-"}</time>
                </div>
              </article>
              <article className="definition-audit-card definition-audit-card--updated">
                <span>
                  <i className="fas fa-pen" />
                </span>
                <div>
                  <small>{t("definitions.lastUpdatedBy")}</small>
                  <strong>{updated ? actorText(audit.updatedBy, system) : "-"}</strong>
                  <time>
                    {updated ? formatDateTime(audit.updatedAt) || "-" : t("definitions.notUpdated")}
                  </time>
                </div>
                <b title={t("definitions.updateCountTitle")}>{audit.updateCount}</b>
              </article>
            </div>
          </section>
        </div>
      )}
    </ZtoModal>
  );
}

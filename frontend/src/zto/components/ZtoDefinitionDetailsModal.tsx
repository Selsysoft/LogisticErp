import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../format";
import type { ZtoAuditInfo } from "./ZtoAuditCell";
import {
  actorText,
  detailsVariant,
  fieldIcon,
  fieldValueOf,
  historyRows,
  type DefinitionEntityKey,
  type DefinitionHistoryEntry,
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
  /**
   * Verilirse "Düzenleme Geçmişi" bölümü çizilir (Blackrose eki; cari kart `GET …/history`). Boş dizi
   * "Henüz değişiklik kaydı yok." gösterir.
   */
  history?: DefinitionHistoryEntry[];
  /** Geçmiş olay kodunun görünen adı; verilmezse kod aynen. */
  historyEventLabel?: (event: string) => string;
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
  history,
  historyEventLabel,
}: ZtoDefinitionDetailsModalProps) {
  const { t } = useTranslation("ztoFinans");
  const system = t("definitions.systemImport");
  const loaded = audit !== null;
  const updated = (audit?.updateCount ?? 0) > 0;
  const variant = detailsVariant(entityKey);
  // ZTO: cari kartta modal başlığı "Cari Hesap Detayı", hero üst metni sabit (ZTO Fabrika yerine).
  const modalTitle = variant.customerAccount ? t("definitions.customerAccountTitle") : entityTitle;
  const rows = history
    ? historyRows(history, {
        systemImport: system,
        formatAt: formatDateTime,
        eventLabel: historyEventLabel,
      })
    : null;

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
      title={loaded ? modalTitle : t("definitions.modalTitle")}
    >
      {!loaded ? (
        <div className="definition-details-loading">
          <span className="spinner-border spinner-border-sm" role="status" />
          <span>{t("definitions.loading")}</span>
        </div>
      ) : (
        <div className={variant.rootClass} data-definition-modal-title={modalTitle}>
          <section className={variant.heroClass}>
            <span className="definition-details__hero-icon">
              <i className={`fas ${variant.icon}`} />
            </span>
            <div className="definition-details__hero-content">
              <small>
                {variant.customerAccount ? t("definitions.customerAccountCaption") : entityTitle}
              </small>
              <h4>{recordTitle}</h4>
              {variant.customerAccount ? (
                <div className="definition-details__hero-meta">
                  <span>
                    <i className="fas fa-barcode" />
                    {fieldValueOf(fields, "Cari Kodu") as ReactNode}
                  </span>
                  <span>
                    <i className="fas fa-layer-group" />
                    {fieldValueOf(fields, "Cari Grubu") as ReactNode}
                  </span>
                  <span className="definition-details__status">
                    <i className="fas fa-circle" />
                    {fieldValueOf(fields, "Durum") as ReactNode}
                  </span>
                </div>
              ) : (
                status && (
                  <div className="definition-details__hero-meta">
                    <span className="definition-details__status">
                      <i className="fas fa-circle" />
                      {status}
                    </span>
                  </div>
                )
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

          {rows && (
            <section className="definition-details__section definition-details__section--history">
              <div className="definition-details__section-title">
                <i className="fas fa-list-ul" />
                <span>{t("definitions.historySection")}</span>
              </div>
              {rows.length === 0 ? (
                <p className="text-muted small mb-0">{t("definitions.historyEmpty")}</p>
              ) : (
                <ul className="list-unstyled mb-0 definition-history">
                  {rows.map((row) => (
                    <li key={row.key} className="definition-history__item">
                      <time>{row.at}</time> <strong>{row.actor}</strong> — <span>{row.event}</span>
                      {row.details && <small className="d-block text-muted">{row.details}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </ZtoModal>
  );
}

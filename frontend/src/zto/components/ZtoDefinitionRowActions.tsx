import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export type ZtoDefinitionRowToggle = {
  active: boolean;
  onDeactivate: () => void;
  onActivate: () => void;
  disabled?: boolean;
};

export type ZtoDefinitionRowActionsProps = {
  /** Detay modalını açar (her zaman, en sonda). */
  detail: () => void;
  /** Düzenle bağlantısı (göreli yol); yetki yoksa verilmez. */
  edit?: string;
  /** Sil (pasifleştir) / Aktifleştir; yetki yoksa verilmez. */
  toggle?: ZtoDefinitionRowToggle;
  /** BranchProvince/Index.cshtml:56-67: Düzenle ve Sil div.btn-group içinde; WorkPlace'te sarmalayıcı yok. */
  grouped?: boolean;
};

/**
 * Tanım listesi işlem hücresinin içeriği (12.1a §6.8 Şablon B): introduction-details.js
 * wrapRowActions (:323-341; div.definition-row-actions, metinsiz düğmeye definition-icon-action +
 * title/aria-label) ve addDetailButton (:435-461; Detay `appendChild` ile EN SONA) sonrası DOM.
 * ZTO'da yinelenen id="DeleteBtn" kullanılmaz.
 */
export function ZtoDefinitionRowActions({
  detail,
  edit,
  toggle,
  grouped = false,
}: ZtoDefinitionRowActionsProps) {
  const { t } = useTranslation("ztoFinans");
  const editLabel = t("definitions.edit");
  const deleteLabel = t("definitions.delete");
  const activateLabel = t("definitions.activate");
  const detailLabel = t("definitions.detailTitle");

  const buttons: ReactNode[] = [];
  if (edit !== undefined) {
    buttons.push(
      <Link
        key="edit"
        to={edit}
        className="btn btn-success definition-icon-action"
        title={editLabel}
        aria-label={editLabel}
      >
        <i className="fas fa-edit" />
      </Link>,
    );
  }
  if (toggle) {
    buttons.push(
      toggle.active ? (
        <button
          key="delete"
          type="button"
          className="btn btn-danger demo definition-icon-action"
          title={deleteLabel}
          aria-label={deleteLabel}
          disabled={toggle.disabled}
          onClick={toggle.onDeactivate}
        >
          <i className="fas fa-trash-alt" />
        </button>
      ) : (
        <button
          key="activate"
          type="button"
          className="btn btn-warning definition-icon-action"
          title={activateLabel}
          aria-label={activateLabel}
          disabled={toggle.disabled}
          onClick={toggle.onActivate}
        >
          <i className="fas fa-undo" />
        </button>
      ),
    );
  }

  return (
    <div className="definition-row-actions">
      {grouped && buttons.length > 0 ? <div className="btn-group">{buttons}</div> : buttons}
      <button
        type="button"
        className="btn btn-sm definition-detail-button"
        title={detailLabel}
        aria-label={detailLabel}
        onClick={detail}
      >
        <i className="fas fa-eye" />
        <span>{t("definitions.detail")}</span>
      </button>
    </div>
  );
}

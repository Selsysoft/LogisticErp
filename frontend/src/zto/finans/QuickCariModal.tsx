import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCan } from "../../pages/finance/common";
import type { Account } from "../../pages/finance/types";
import { QCA_SEARCH_IDS, ZtoAccountSearch, ZtoModal, groupIcon } from "../components";
import { quickCariCards } from "./quickCariCards";

export type QuickCariModalProps = {
  show: boolean;
  onHide: () => void;
};

const TITLE_ID = "quickCariActionTitle";

/**
 * Hızlı Cari İşlemi modalı (ZTO _ProductionLayout.cshtml:3838-3990; 12.1 §5.12). İşaretleme ZTO:
 * `.modal#quickCariActionModal > .modal-dialog.modal-lg.modal-dialog-centered > .modal-content.qca-content
 * > .qca-header + .qca-body` (çıplak ZtoModal, `.modal-body` yok). Açılışta arama boşalır ve odak arama
 * kutusundadır; cari seçilince seçili kart ve işlem kartları çizilir; kart tıklanınca modal kapanır ve
 * gezinir (aynı sekme ya da yeni sekme, ZTO'daki gibi). Yetki gerektiren kartlar gizlidir.
 */
export function QuickCariModal({ show, onHide }: QuickCariModalProps) {
  const { t } = useTranslation("ztoFinans");
  const { t: tr } = useTranslation();
  const [selected, setSelected] = useState<Account | null>(null);
  // Her açılışta arama kutusu sıfırlanır (ZTO openQuickCariModal); anahtar değişince bileşen yenilenir.
  const [session, setSession] = useState(0);
  const permissions = {
    manage: useCan("FINANCE_MANAGE"),
    payment: useCan("FINANCE_PAYMENT_CREATE"),
    fleet: useCan("FLEET_VIEW"),
    shipments: useCan("SHIPMENT_VIEW"),
  };

  useEffect(() => {
    if (show) {
      setSelected(null);
      setSession((value) => value + 1);
    }
  }, [show]);

  const cards = selected ? quickCariCards(selected, permissions) : [];

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      rootId="quickCariActionModal"
      bare
      size="lg"
      centered
      contentClassName="qca-content"
      ariaLabelledBy={TITLE_ID}
      onEntered={() => document.getElementById(QCA_SEARCH_IDS.input ?? "")?.focus()}
    >
      <div className="qca-header">
        <div className="qca-title" id={TITLE_ID}>
          <i className="fas fa-bolt" aria-hidden="true" /> {t("quickCari.title")}
        </div>
        <button
          type="button"
          className="qca-close"
          aria-label={tr("common.a11y.close")}
          onClick={onHide}
        >
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>
      <div className="qca-body">
        <ZtoAccountSearch
          key={session}
          variant="qca"
          ids={QCA_SEARCH_IDS}
          placeholder={t("quickCari.searchPlaceholder")}
          emptyText={t("quickCari.noResults")}
          autoFocus
          onSelect={setSelected}
        />
        {selected ? (
          <div id="qcaSelected" className="qca-selected">
            <div className="qca-sel-icon">
              <i className={`fas ${groupIcon("qca", selected.subGroupName)}`} aria-hidden="true" />
            </div>
            <div>
              <div className="qca-sel-name">{selected.name}</div>
              <div className="qca-sel-sub">
                {selected.code} · {selected.subGroupName}
              </div>
            </div>
          </div>
        ) : (
          <div id="qcaEmpty" className="qca-empty">
            <i className="fas fa-hand-pointer" aria-hidden="true" />
            <div className="qca-empty-t">{t("quickCari.emptyTitle")}</div>
            <div className="qca-empty-s">{t("quickCari.emptyText")}</div>
          </div>
        )}
        <div
          id="qcaActions"
          className="qca-actions"
          role={cards.length > 0 ? "group" : undefined}
          aria-label={cards.length > 0 ? t("quickCari.actions") : undefined}
        >
          {cards.map((card) => {
            const content = (
              <>
                <div className="qca-card-ic" style={{ background: card.color }}>
                  <i className={`fas ${card.icon}`} aria-hidden="true" />
                </div>
                <div className="qca-card-lbl">
                  {t(`quickCari.cards.${card.key}`)}
                  {card.newTab && (
                    <span className="sr-only"> {tr("common.a11y.opensInNewTab")}</span>
                  )}
                </div>
              </>
            );
            return card.newTab ? (
              <a
                key={card.key}
                className="qca-card"
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onHide}
              >
                {content}
              </a>
            ) : (
              <Link key={card.key} className="qca-card" to={card.href} onClick={onHide}>
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </ZtoModal>
  );
}

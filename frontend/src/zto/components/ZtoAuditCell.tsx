import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../format";
import { useZtoOverlayContainer } from "../ZtoPortalContext";
import {
  actorText,
  auditPopoverPlacement,
  lastActor,
  type PopoverPlacement,
} from "./definitionLogic";

export type ZtoAuditInfo = {
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
};

export type ZtoAuditCellProps = ZtoAuditInfo;

/**
 * "Kayıt Bilgileri" hücresi (12.1a §6.8): ZTO _IntroductionAuditCellCompact.cshtml tetikleyicisi
 * (button.intro-audit-trigger, fa-history + güncelleme sayısı rozeti) ve introduction-audit-popover.js
 * açılır kutusu (aside.intro-audit-popover). Kutu kapsam köküne portal'lanır (position: fixed); dışarı
 * tıklama, Escape (odak tetikleyiciye döner), pencere boyutu ve kaydırma kapatır. Ad yerine e-posta
 * gösterilir (Blackrose denetim kolonu e-posta tutar; kayıtlı sapma).
 */
export function ZtoAuditCell(audit: ZtoAuditCellProps) {
  const { t } = useTranslation("ztoFinans");
  const container = useZtoOverlayContainer();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);

  const updated = audit.updateCount > 0;
  const system = t("definitions.systemImport");
  const created = formatDateTime(audit.createdAt) || "-";
  const action = lastActor(audit);
  const rows = [
    {
      icon: "fa-user-plus",
      label: t("definitions.createdBy"),
      by: actorText(audit.createdBy, system),
      at: created,
    },
    {
      icon: "fa-user-edit",
      label: t("definitions.lastUpdatedBy"),
      by: updated ? actorText(audit.updatedBy, system) : "-",
      at: updated ? formatDateTime(audit.updatedAt) || "-" : t("definitions.notUpdated"),
    },
    {
      icon: "fa-user-clock",
      label: t("definitions.lastActor"),
      by: actorText(action.by, system),
      at: formatDateTime(action.at) || "-",
    },
  ];

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPlacement(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const height = popoverRef.current?.getBoundingClientRect().height ?? 0;
    setPlacement(
      auditPopoverPlacement(rect, height, { width: window.innerWidth, height: window.innerHeight }),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const title = t("definitions.history");
  const popover = open && (
    <aside
      ref={popoverRef}
      className={
        placement?.above ? "intro-audit-popover intro-audit-popover--above" : "intro-audit-popover"
      }
      role="dialog"
      aria-label={title}
      style={
        placement
          ? { width: placement.width, left: placement.left, top: placement.top }
          : { visibility: "hidden" }
      }
    >
      <div className="intro-audit-popover__header">
        <strong>{title}</strong>
        <span className="intro-audit-popover__total">
          {t("definitions.updateCountValue", { count: audit.updateCount })}
        </span>
      </div>
      {rows.map((row) => (
        <div key={row.icon} className="intro-audit-popover__row">
          <span className="intro-audit-popover__icon">
            <i className={`fas ${row.icon}`} aria-hidden="true" />
          </span>
          <span className="intro-audit-popover__content">
            <small>{row.label}</small>
            <strong>{row.by || "-"}</strong>
            <time>{row.at || "-"}</time>
          </span>
        </div>
      ))}
    </aside>
  );

  const label = t("definitions.auditTrigger");
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="intro-audit-trigger"
        title={label}
        aria-label={label}
        aria-expanded={open}
        data-intro-audit-trigger=""
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        <i className="fas fa-history" aria-hidden="true" />
        {audit.updateCount > 0 && (
          <span className="intro-audit-trigger__count" aria-hidden="true">
            {audit.updateCount}
          </span>
        )}
      </button>
      {popover && (container ? createPortal(popover, container) : popover)}
    </>
  );
}

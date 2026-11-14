import { Fragment, KeyboardEvent, PointerEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { hasPermission, useAuthStore } from "../../auth/authStore";
import {
  isActive,
  isNavigable,
  itemPath,
  visibleSections,
  ZTO_NAV_SECTIONS,
  type ZtoNavItem,
  type ZtoNavSection,
} from "./navItems";

/** ZTO'nun fareyle çıkınca kapanma gecikmesi (_SideMenu_Assets.cshtml:247-251). */
export const SIDEBAR_LEAVE_DELAY_MS = 120;

const GROUP_ITEM_STYLE = { margin: 0 } as const;

interface ZtoFinanceSidebarProps {
  /** Varsayılan: import.meta.env.DEV (vitrin öğesi yalnız geliştirmede). */
  dev?: boolean;
  sections?: readonly ZtoNavSection[];
}

/**
 * ZTO finans yan menüsü (zt-sidebar). İşaretleme _SideMenu_Finance.cshtml:39-55 ve
 * _SideMenu_FinanceItems.cshtml, davranış _SideMenu_Assets.cshtml:228-275 ile aynı: fare üzerine
 * gelince açılır, çıkınca 120 ms sonra kapanır; dokunmatikte ok ile açılıp kapanır; dışarı tıklayınca
 * kapanır. Blackrose ekleri: Escape ve klavye (ok düğmesi), sayfa değişince kapanma, Faz'ı gelmemiş
 * öğeler pasif ("Faz 12.x"), izni olmayan öğe gizli (TEMEL TANIMLAR: BRANCH_VIEW).
 */
export function ZtoFinanceSidebar({
  dev = import.meta.env.DEV,
  sections = ZTO_NAV_SECTIONS,
}: ZtoFinanceSidebarProps) {
  const { t } = useTranslation("ztoFinans");
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const panelId = useId();
  const me = useAuthStore((state) => state.me);
  const visible = visibleSections(dev, sections, (permission) => hasPermission(me, permission));

  // Sayfa değişince kapanır (ZTO'da tam sayfa yüklemesi menüyü kapatır).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Dışarı tıklama kapatır.
  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [open]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(leaveTimer.current);
    setOpen(true);
  };

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setOpen(false), SIDEBAR_LEAVE_DELAY_MS);
  };

  const onArrowKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((value) => !value);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
      arrowRef.current?.focus();
    }
  };

  return (
    <div
      className={open ? "zt-sidebar open" : "zt-sidebar"}
      id="ztSidebar"
      ref={rootRef}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
    >
      <div
        className="zt-sidebar-arrow"
        ref={arrowRef}
        role="button"
        tabIndex={0}
        aria-label={t("nav.toggleMenu")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onKeyDown={onArrowKeyDown}
      >
        <i className="fas fa-chevron-right" aria-hidden="true" />
      </div>
      <div className="zt-sidebar-panel" id={panelId} aria-hidden={!open}>
        <div className="zt-sidebar-inner">
          <div className="zt-sidebar-header">
            <span>{t("nav.sidebarTitle")}</span>
          </div>
          <ul
            className="zt-sidebar-nav"
            aria-label={t("nav.root")}
            // Bağlantı seçilince kapanır (aynı sayfa seçilse de; ZTO'da sayfa yeniden yüklenir).
            onClick={(event) => {
              if ((event.target as Element).closest("a[href]")) setOpen(false);
            }}
          >
            {visible.map((section, index) => (
              <Fragment key={section.id}>
                {/* ZTO başlık ve ayırıcıyı doğrudan ul içine div olarak koyar; geçerli HTML için
                    margin'siz li içine alındı (".zt-sidebar-nav li" boşluğu uygulanmaz). */}
                <li role="none" style={GROUP_ITEM_STYLE}>
                  {index > 0 && <div className="zt-sidebar-divider" />}
                  <div className="zt-sidebar-group-header">
                    <i className={section.icon} aria-hidden="true" />
                    <span>{t(`nav.${section.label}`)}</span>
                  </div>
                </li>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <SidebarLink item={item} active={isActive(item, pathname)} />
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({ item, active }: { item: ZtoNavItem; active: boolean }) {
  const { t } = useTranslation("ztoFinans");
  const content = (
    <>
      <span className="zt-icon">
        <i className={item.icon} aria-hidden="true" />
      </span>
      <span className="zt-label">{t(`nav.${item.label}`)}</span>
    </>
  );
  const classes = [item.action === "add" ? "zt-action-add" : "", active ? "zt-active" : ""]
    .filter(Boolean)
    .join(" ");

  if (isNavigable(item)) {
    return (
      <Link
        to={itemPath(item)}
        className={classes || undefined}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </Link>
    );
  }
  // Ekranı gelmemiş öğe: görünür, odaklanabilir değil, tıklanamaz (href yok).
  return (
    <a
      className={classes ? `${classes} disabled` : "disabled"}
      aria-disabled="true"
      title={t("nav.notReady", { step: item.step })}
    >
      {content}
      <small className="zt-phase">{t("nav.phase", { step: item.step })}</small>
    </a>
  );
}

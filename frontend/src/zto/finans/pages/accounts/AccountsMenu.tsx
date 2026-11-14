import {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ZtoTooltip } from "../../../components";
import { menuPlacement, nextMenuIndex, type MenuPlacement } from "./menuLogic";

const ITEM_SELECTOR = '[role="menuitem"]';

export type ZtoMenuButtonProps = {
  /** Tetikleyicinin sınıfları (ör. "erp-btn erp-btn-primary dropdown-toggle"). */
  buttonClassName: string;
  buttonStyle?: CSSProperties;
  /** Tetikleyici içeriği (ikon + metin). */
  label: ReactNode;
  title?: string;
  /** Görünür metni olmayan tetikleyicinin erişilebilir adı. */
  ariaLabel?: string;
  menuClassName?: string;
  menuStyle?: CSSProperties;
  align?: "left" | "right";
  /** Sarmalayıcı (ZTO `div.btn-group`). */
  groupClassName?: string;
  id?: string;
  children: ReactNode;
};

/**
 * ZTO `div.btn-group > button.dropdown-toggle[data-toggle=dropdown] + div.dropdown-menu` karşılığı
 * (Bootstrap JS yok). MWG `menu`: tetikleyici `aria-haspopup="menu"` + `aria-expanded`; klavyeyle
 * açılınca (Enter/Space/↓) ilk öğe odaklanır, fareyle açılınca odak tetikleyicide kalır; ↑/↓/Home/End
 * öğeler arası, Escape kapatır ve odağı tetikleyiciye döndürür, Tab menüden çıkar ve kapatır.
 * `focusgroup` Baseline değil: kılavuzun geri dönüşü gibi `role="menu"`/`menuitem` yazılır ve tuşlar
 * betikle işlenir. Menü `position: fixed` ile konumlanır (anchor positioning geri dönüşü).
 */
export function ZtoMenuButton({
  buttonClassName,
  buttonStyle,
  label,
  title,
  ariaLabel,
  menuClassName = "dropdown-menu",
  menuStyle,
  align = "left",
  groupClassName = "btn-group",
  id,
  children,
}: ZtoMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusFirst = useRef(false);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) {
      setPlacement(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setPlacement(
      menuPlacement(
        rect,
        { width: menu.width, height: menu.height },
        { width: window.innerWidth, height: window.innerHeight },
        align,
      ),
    );
    if (focusFirst.current) {
      focusFirst.current = false;
      items()[0]?.focus();
    }
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onViewport = (event: Event) => {
      if (event.type === "scroll" && menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("focusin", onPointer);
    window.addEventListener("resize", onViewport);
    window.addEventListener("scroll", onViewport, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("focusin", onPointer);
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("scroll", onViewport, true);
    };
  }, [open]);

  const onTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    // event.detail === 0: Enter/Space ile tetiklenen tıklama (klavyeyle açılış menüye girer).
    focusFirst.current = event.detail === 0;
    setOpen(true);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (open) {
        items()[0]?.focus();
      } else {
        focusFirst.current = true;
        setOpen(true);
      }
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const list = items();
    const next = nextMenuIndex(
      list.indexOf(document.activeElement as HTMLElement),
      event.key,
      list.length,
    );
    if (next !== null) {
      event.preventDefault();
      list[next].focus();
    }
  };

  const onMenuClick = (event: MouseEvent<HTMLDivElement>) => {
    const item = (event.target as HTMLElement).closest(ITEM_SELECTOR);
    if (!item) return;
    if (item.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      return;
    }
    close(event.detail === 0);
  };

  const triggerId = id ? `${id}-trigger` : undefined;
  return (
    <div className={open ? `${groupClassName} show` : groupClassName}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={buttonClassName}
        style={buttonStyle}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
      >
        {label}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-labelledby={triggerId}
          aria-label={triggerId ? undefined : (ariaLabel ?? title)}
          className={`${menuClassName} show`}
          style={{
            ...menuStyle,
            position: "fixed",
            margin: 0,
            top: placement?.top ?? 0,
            left: placement?.left ?? 0,
            right: "auto",
            visibility: placement ? undefined : "hidden",
          }}
          onKeyDown={onMenuKeyDown}
          onClick={onMenuClick}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export type MenuItemProps = {
  icon: string;
  label: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
  /** Uygulama içi rota. */
  to?: string;
  /** Dış/yeni sekme bağlantısı. */
  href?: string;
  newTab?: boolean;
  onSelect?: () => void;
};

/** Menü öğesi: `a.dropdown-item` / `button.dropdown-item` + ikon (ZTO sınıfları aynen). */
export function MenuItem({
  icon,
  label,
  className = "dropdown-item py-2",
  style,
  title,
  to,
  href,
  newTab,
  onSelect,
}: MenuItemProps) {
  const { t } = useTranslation();
  const content = (
    <>
      <i className={icon} aria-hidden="true" /> {label}
      {newTab && <span className="sr-only"> {t("common.a11y.opensInNewTab")}</span>}
    </>
  );
  const common = { role: "menuitem", tabIndex: -1, className, style, title };
  if (to !== undefined && !newTab) {
    return (
      <Link {...common} to={to} onClick={onSelect}>
        {content}
      </Link>
    );
  }
  if (to !== undefined || href !== undefined) {
    return (
      <a
        {...common}
        href={href ?? to}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        onClick={onSelect}
      >
        {content}
      </a>
    );
  }
  return (
    <button {...common} type="button" onClick={onSelect}>
      {content}
    </button>
  );
}

/** Sonraki adıma ait pasif öğe: odaklanabilir, `aria-disabled`, ipucu "Faz {{step}} ile gelecek.". */
export function PhaseMenuItem({
  icon,
  label,
  step,
  className = "dropdown-item py-2",
  style,
}: {
  icon: string;
  label: ReactNode;
  step: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { t } = useTranslation("ztoFinans");
  const hint = t("accounts.comingIn", { step });
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={`${className} disabled`}
      style={style}
      aria-disabled="true"
      title={hint}
    >
      <i className={icon} aria-hidden="true" /> {label}
      <span className="sr-only"> ({hint})</span>
    </button>
  );
}

export function MenuDivider() {
  return <div className="dropdown-divider" role="separator" />;
}

/**
 * Sonraki adımın hedefine giden üst düzey düğme (§5.0 #9): görünüm ZTO, `aria-disabled` + ZtoTooltip
 * ipucu "Faz {{step}} ile gelecek."; odaklanabilir kalır, tıklama bir şey yapmaz.
 */
export function PhaseButton({
  step,
  className,
  style,
  title,
  children,
}: {
  step: string;
  className: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}): ReactElement {
  const { t } = useTranslation("ztoFinans");
  const hint = t("accounts.comingIn", { step });
  return (
    <ZtoTooltip content={hint}>
      <button
        type="button"
        className={className}
        style={style}
        title={title}
        aria-disabled="true"
        onClick={(event) => event.preventDefault()}
      >
        {children}
        <span className="sr-only"> ({hint})</span>
      </button>
    </ZtoTooltip>
  );
}

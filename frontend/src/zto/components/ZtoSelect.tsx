import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useZtoOverlayContainer } from "../ZtoPortalContext";
import {
  computeDropdownPosition,
  containerIdFor,
  DropdownPosition,
  filterItems,
  flattenOptions,
  initialHighlight,
  isGroup,
  moveHighlight,
  resolveDisplay,
  scrollTopToReveal,
  selectableValues,
  selectKeyAction,
  shouldShowSearch,
  ZtoSelectItem,
  ZtoSelectOption,
} from "./selectLogic";

export type { ZtoSelectGroup, ZtoSelectItem, ZtoSelectOption } from "./selectLogic";

export interface ZtoSelectProps {
  /** Seçili değer; "" boş (yer tutucu). */
  value: string;
  onChange: (value: string) => void;
  options: ZtoSelectItem[];
  /**
   * select2 placeholder: değer "" iken gri metin; "" değerli üst düzey seçenek listede gizlenir.
   * undefined → ZTO global kurulumu "Seçiniz..." (_ProductionLayout.cshtml:2337-2343); null →
   * yer tutucusuz (sayfaya özel select2 kurulumu; "" seçeneği kendi metniyle görünür).
   */
  placeholder?: string | null;
  /** × ile temizleme (select2 allowClear); ZTO global kurulumunda açık, yer tutucu yoksa çalışmaz. */
  allowClear?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  /** Gizli yerel select'in sınıfları (varsayılan "form-control"); "no-select2" yerel select çizer. */
  className?: string;
  /** Seçenek sayısı bunun altındaysa arama kutusu gizlenir; Infinity = hiç arama yok. */
  minimumResultsForSearch?: number;
  title?: string;
  /**
   * Hata bağlantısı (MWG accessible-error-announcement): select2'de odaklanan `role=combobox`
   * öğesine, no-select2'de yerel select'e yazılır; gizli (aria-hidden) select'e yazılmaz.
   */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Verilmişse "true"/"false" (MWG: hata yokken "false"), verilmemişse nitelik yazılmaz. */
const ariaInvalidAttr = (value: boolean | undefined) =>
  value === undefined ? undefined : value ? "true" : "false";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

function NativeOptions({ items }: { items: ZtoSelectItem[] }) {
  return (
    <>
      {items.map((item, index) =>
        isGroup(item) ? (
          <optgroup key={`g${index}`} label={item.label}>
            {item.options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={item.value} value={item.value} disabled={item.disabled}>
            {item.label}
          </option>
        ),
      )}
    </>
  );
}

const hasEmptyOption = (items: ZtoSelectItem[]) =>
  items.some((item) => !isGroup(item) && item.value === "");

/**
 * select2 4.1.0-rc.0 (theme: bootstrap) görünümlü, arama kutulu tekli seçim. ZTO'da
 * select.form-control:not(.no-select2) otomatik select2 olur (_ExpertLayout.cshtml:1240-1275);
 * className "no-select2" içerirse yerel select çizilir.
 */
export function ZtoSelect(props: ZtoSelectProps) {
  const className = props.className ?? "form-control";
  if (className.split(/\s+/).includes("no-select2")) {
    const { value, onChange, options, disabled, id, name, required, title } = props;
    const placeholder = props.placeholder ?? undefined;
    return (
      <select
        id={id}
        name={name}
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
        title={title}
        aria-invalid={ariaInvalidAttr(props["aria-invalid"])}
        aria-describedby={props["aria-describedby"]}
      >
        {placeholder !== undefined && !hasEmptyOption(options) && (
          <option value="">{placeholder}</option>
        )}
        <NativeOptions items={options} />
      </select>
    );
  }
  return <Select2 {...props} className={className} />;
}

/** Mutlak konumlu öğenin başlangıç noktası (görünüm alanı koordinatı). */
function originOf(element: Element | null): { top: number; left: number } {
  if (!element || element === document.body || element === document.documentElement) {
    return { top: -window.scrollY, left: -window.scrollX };
  }
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + element.clientTop - element.scrollTop,
    left: rect.left + element.clientLeft - element.scrollLeft,
  };
}

const samePosition = (a: DropdownPosition | null, b: DropdownPosition) =>
  a !== null &&
  a.top === b.top &&
  a.left === b.left &&
  a.width === b.width &&
  a.direction === b.direction;

function Select2({
  value,
  onChange,
  options,
  placeholder: placeholderProp,
  allowClear = true,
  disabled = false,
  id,
  name,
  required,
  className,
  minimumResultsForSearch = 0,
  title,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: ZtoSelectProps & { className: string }) {
  const { t } = useTranslation("ztoFinans");
  const placeholder =
    placeholderProp === null ? undefined : (placeholderProp ?? t("select.placeholder"));
  // select2'de yer tutucu olmadan allowClear çalışmaz.
  const clearable = allowClear && placeholder !== undefined;
  const portalContainer = useZtoOverlayContainer();
  const uid = useId().replace(/[^A-Za-z0-9]/g, "");
  const containerId = containerIdFor(id, name, uid);
  const resultsId = `${containerId}-results`;
  const renderedId = `${containerId}-container`;

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [position, setPosition] = useState<DropdownPosition | null>(null);
  const [focused, setFocused] = useState(false);

  const containerRef = useRef<HTMLSpanElement>(null);
  const selectionRef = useRef<HTMLSpanElement>(null);
  const dropdownContainerRef = useRef<HTMLSpanElement>(null);
  const dropdownRef = useRef<HTMLSpanElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);

  // select2 HidePlaceholder: yer tutucu varsa "" değerli üst düzey seçenek listede yok.
  const hiddenValue = placeholder !== undefined ? "" : undefined;
  const visibleItems = useMemo(
    () => filterItems(options, term, hiddenValue),
    [options, term, hiddenValue],
  );
  const selectable = useMemo(() => selectableValues(visibleItems), [visibleItems]);
  const optionIndex = useMemo(() => {
    const map = new Map<string, number>();
    flattenOptions(options).forEach((option, index) => map.set(option.value, index));
    return map;
  }, [options]);
  const optionId = useCallback(
    (optionValue: string) => `${containerId}-result-${optionIndex.get(optionValue) ?? 0}`,
    [containerId, optionIndex],
  );

  const display = resolveDisplay(options, value, placeholder);
  const displayedValue = display.kind === "option" ? display.option.value : null;
  const showClear = clearable && display.kind === "option";
  const showSearch = shouldShowSearch(options, minimumResultsForSearch);

  const openDropdown = useCallback(
    (currentValue: string) => {
      if (disabled) {
        return;
      }
      setTerm("");
      setHighlighted(
        initialHighlight(selectableValues(filterItems(options, "", hiddenValue)), currentValue),
      );
      setPosition(null);
      setOpen(true);
    },
    [disabled, options, hiddenValue],
  );

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setTerm("");
    setHighlighted(null);
    setPosition(null);
    // select2: kapanınca odak seçim kutusuna döner.
    selectionRef.current?.focus();
  }, []);

  const toggle = (currentValue: string) => {
    if (open) {
      closeDropdown();
    } else {
      openDropdown(currentValue);
    }
  };

  const choose = (optionValue: string) => {
    if (optionValue !== displayedValue) {
      onChange(optionValue);
    }
    closeDropdown();
  };

  // select2 AllowClear._handleClear: değeri boşaltır, ardından "toggle" (kapalıysa açar).
  const clear = () => {
    if (disabled || !showClear) {
      return;
    }
    onChange("");
    toggle("");
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const action = selectKeyAction({
      key: event.key,
      altKey: event.altKey,
      open,
      allowClear: clearable,
    });
    if (action === null) {
      return;
    }
    if (action === "clear") {
      clear();
      return;
    }
    event.preventDefault();
    if (action === "open") {
      openDropdown(value);
    } else if (action === "close") {
      closeDropdown();
    } else if (action === "select") {
      if (highlighted !== null) {
        choose(highlighted);
      }
    } else {
      setHighlighted(moveHighlight(selectable, highlighted, action));
    }
  };

  const handleSearch = (nextTerm: string) => {
    setTerm(nextTerm);
    setHighlighted(
      initialHighlight(selectableValues(filterItems(options, nextTerm, hiddenValue)), value),
    );
  };

  // Devre dışı kalırsa açık liste kapanır.
  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setTerm("");
      setHighlighted(null);
    }
  }, [disabled, open]);

  // Açılınca arama kutusuna odak; select2 gibi bir de sonraki turda (mousedown'ın odak değişiminden sonra).
  useEffect(() => {
    if (!open) {
      return;
    }
    searchRef.current?.focus();
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Dışarı tıklama kapatır (select2 BaseSelection._attachCloseHandler).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (containerRef.current?.contains(target) || dropdownContainerRef.current?.contains(target))
      ) {
        return;
      }
      closeDropdown();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, closeDropdown]);

  // Konum: tetikleyicinin kutusu portal kapsayıcısına göre; aşağıda yer yoksa yukarı (AttachBody).
  const reposition = useCallback(() => {
    const container = containerRef.current;
    const wrapper = dropdownContainerRef.current;
    const dropdown = dropdownRef.current;
    if (!container || !wrapper || !dropdown) {
      return;
    }
    const rect = container.getBoundingClientRect();
    dropdown.style.width = `${rect.width}px`;
    const dropdownHeight = dropdown.offsetHeight;
    const origin = originOf(wrapper.offsetParent);
    setPosition((current) => {
      const next = computeDropdownPosition({
        trigger: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
        dropdownHeight,
        viewportHeight: window.innerHeight,
        origin,
        current: current?.direction ?? null,
      });
      return samePosition(current, next) ? current : next;
    });
  }, []);

  useLayoutEffect(() => {
    if (open) {
      reposition();
    }
  }, [open, visibleItems, reposition]);

  // Kaydırma (üst kapsayıcılar dahil, capture) ve boyut değişiminde yeniden konumla.
  useEffect(() => {
    if (!open) {
      return;
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("orientationchange", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("orientationchange", reposition);
    };
  }, [open, reposition]);

  // Vurgulu öğe listede görünür kalsın (results.js ensureHighlightVisible).
  useLayoutEffect(() => {
    const list = resultsRef.current;
    if (!open || highlighted === null || !list) {
      return;
    }
    const item = list.ownerDocument.getElementById(optionId(highlighted));
    if (!item || !list.contains(item)) {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const next = scrollTopToReveal(
      list.scrollTop,
      list.clientHeight,
      itemRect.top - listRect.top + list.scrollTop,
      itemRect.height,
    );
    if (next !== null) {
      list.scrollTop = next;
    }
  }, [open, highlighted, optionId]);

  const renderOption = (option: ZtoSelectOption) => {
    const isHighlighted = highlighted === option.value;
    if (option.disabled) {
      return (
        <li
          key={option.value}
          className="select2-results__option select2-results__option--disabled"
          id={optionId(option.value)}
          role="option"
          aria-disabled="true"
        >
          {option.label}
        </li>
      );
    }
    return (
      <li
        key={option.value}
        className={cx(
          "select2-results__option select2-results__option--selectable",
          option.value === displayedValue && "select2-results__option--selected",
          isHighlighted && "select2-results__option--highlighted",
        )}
        id={optionId(option.value)}
        role="option"
        // select2 4.1: aria-selected vurguyu izler (results:focus).
        aria-selected={isHighlighted ? "true" : "false"}
        onMouseEnter={() => setHighlighted(option.value)}
        onMouseUp={() => choose(option.value)}
      >
        {option.label}
      </li>
    );
  };

  const hasResults = flattenOptions(visibleItems).length > 0;
  const portalTarget = portalContainer ?? (typeof document !== "undefined" ? document.body : null);
  const removeAll = t("select.removeAllItems");

  return (
    <>
      <select
        id={id}
        name={name}
        className={`${className} select2-hidden-accessible`}
        aria-hidden="true"
        tabIndex={-1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
        title={title}
      >
        {placeholder !== undefined && !hasEmptyOption(options) && <option value="" />}
        <NativeOptions items={options} />
      </select>
      <span
        ref={containerRef}
        className={cx(
          "select2 select2-container select2-container--bootstrap",
          open && position && `select2-container--${position.direction}`,
          open && "select2-container--open",
          focused && "select2-container--focus",
          disabled && "select2-container--disabled",
        )}
        dir="ltr"
        style={{ width: "100%" }}
      >
        <span className="selection">
          <span
            ref={selectionRef}
            className={cx(
              "select2-selection select2-selection--single",
              showClear && "select2-selection--clearable",
            )}
            role="combobox"
            aria-haspopup="true"
            aria-expanded={open ? "true" : "false"}
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled ? "true" : "false"}
            aria-labelledby={renderedId}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalidAttr(ariaInvalid)}
            aria-controls={renderedId}
            aria-owns={open ? resultsId : undefined}
            aria-activedescendant={open && highlighted !== null ? optionId(highlighted) : undefined}
            title={title}
            onMouseDown={(event) => {
              if (event.button === 0) {
                toggle(value);
              }
            }}
            onKeyDown={(event) => {
              // select2 BaseSelection: boşluk sayfayı kaydırmasın.
              if (event.key === " ") {
                event.preventDefault();
              }
              handleKeyDown(event);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            {showClear && (
              <button
                type="button"
                className="select2-selection__clear"
                tabIndex={-1}
                title={removeAll}
                aria-label={removeAll}
                aria-describedby={renderedId}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  clear();
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
            <span
              className="select2-selection__rendered"
              id={renderedId}
              role="textbox"
              aria-readonly="true"
              title={
                display.kind === "placeholder"
                  ? display.text
                  : display.kind === "option"
                    ? display.option.label
                    : undefined
              }
            >
              {display.kind === "placeholder" ? (
                <span className="select2-selection__placeholder">{display.text}</span>
              ) : display.kind === "option" ? (
                display.option.label
              ) : null}
            </span>
            <span className="select2-selection__arrow" role="presentation">
              <b role="presentation" />
            </span>
          </span>
        </span>
        <span className="dropdown-wrapper" aria-hidden="true" />
      </span>
      {open &&
        portalTarget &&
        createPortal(
          <span
            ref={dropdownContainerRef}
            className="select2-container select2-container--bootstrap select2-container--open"
            style={{
              position: "absolute",
              top: position ? position.top : -999999,
              left: position ? position.left : 0,
            }}
          >
            <span
              ref={dropdownRef}
              className={cx(
                "select2-dropdown",
                position && `select2-dropdown--${position.direction}`,
              )}
              dir="ltr"
              style={position ? { width: position.width } : undefined}
            >
              <span
                className={cx(
                  "select2-search select2-search--dropdown",
                  !showSearch && "select2-search--hide",
                )}
              >
                <input
                  ref={searchRef}
                  className="select2-search__field"
                  type="search"
                  tabIndex={0}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="off"
                  role="searchbox"
                  aria-autocomplete="list"
                  aria-label={t("select.search")}
                  aria-controls={resultsId}
                  aria-activedescendant={highlighted !== null ? optionId(highlighted) : undefined}
                  value={term}
                  onChange={(event) => handleSearch(event.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </span>
              <span className="select2-results">
                <ul
                  ref={resultsRef}
                  className="select2-results__options"
                  role="listbox"
                  id={resultsId}
                  aria-expanded="true"
                  aria-hidden="false"
                >
                  {hasResults ? (
                    visibleItems.map((item, index) =>
                      isGroup(item) ? (
                        <li
                          key={`g${index}`}
                          className="select2-results__option select2-results__option--group"
                          role="group"
                          aria-label={item.label}
                        >
                          <strong className="select2-results__group">{item.label}</strong>
                          <ul
                            className="select2-results__options select2-results__options--nested"
                            role="none"
                          >
                            {item.options.map(renderOption)}
                          </ul>
                        </li>
                      ) : (
                        renderOption(item)
                      ),
                    )
                  ) : (
                    <li
                      role="alert"
                      aria-live="assertive"
                      className="select2-results__option select2-results__message"
                    >
                      {t("select.noResults")}
                    </li>
                  )}
                </ul>
              </span>
            </span>
          </span>,
          portalTarget,
        )}
    </>
  );
}

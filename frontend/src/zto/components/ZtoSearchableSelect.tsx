import {
  CSSProperties,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildRows,
  dropdownPlacement,
  nextIndex,
  triggerState,
  type DropdownPlacement,
  type HighlightPart,
  type SearchableItem,
} from "./searchableSelectLogic";

export type { SearchableGroup, SearchableItem, SearchableOption } from "./searchableSelectLogic";

export type ZtoSearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableItem[];
  /** Boş değerli ilk seçeneğin metni (ZTO `placeholder`, ör. "Tüm Bankalar"). */
  placeholder: string;
  /** Arama kutusunun yer tutucusu (ZTO `searchPlaceholder`, ör. "Banka ara..."). */
  searchPlaceholder: string;
  /** Eşleşme yokken (ZTO `noResultsText`, ör. "Banka bulunamadı"). */
  noResultsText: string;
  /** false: boş seçenek ("Tümü") listede yer almaz; varsayılan true (ZTO `<option value="">`). */
  includeEmptyOption?: boolean;
  disabled?: boolean;
  /** Tetikleyicinin id'si (etiketin `for`'u yerine `aria-labelledby` ile bağlanır). */
  id?: string;
  /** Görünür etiketin id'si (`label#…`). */
  ariaLabelledBy?: string;
  className?: string;
};

const TEXT_WRAP: CSSProperties = { flex: 1, minWidth: 0 };
const OPEN_FOCUS_DELAY_MS = 30;

function Parts({ parts }: { parts: HighlightPart[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <span key={index} className="ss-highlight">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/**
 * ZTO SearchableSelect karşılığı (12.2 §5.9; F3/zto): `div.ss-wrapper > div.ss-trigger
 * (span.ss-trigger-text + span.ss-trigger-icon) + div.ss-dropdown (div.ss-search-wrap >
 * input.ss-search-input + div.ss-list > div.ss-option…)`. Kendi stili yoktur; kullanan sayfanın scoped
 * CSS'indeki `.ss-*` kurallarıyla çizilir (bank/cash-transactions.css).
 *
 * MWG (`accessibility` §2/§5): ZTO tetikleyicisi `div[role=combobox][tabindex=0]` korunur (DOM birebir;
 * `button`'a çevrilmez), `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`; liste
 * `role="listbox"`, seçenek `role="option"` + `aria-selected`. Klavye: tetikleyicide Enter/Boşluk/↓
 * açar, Esc kapatır; arama kutusunda ↓ ilk seçeneğe, Esc kapatıp odağı tetikleyiciye döndürür;
 * seçenekte ↑/↓ sarar, Enter seçer, Esc kapatır; Tab listeden çıkar ve kapatır; seçimden sonra odak
 * tetikleyiciye döner. Dışarı tıklamak kapatır (ZTO belge dinleyicisi).
 */
export function ZtoSearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  noResultsText,
  includeEmptyOption = true,
  disabled = false,
  id,
  ariaLabelledBy,
  className,
}: ZtoSearchableSelectProps) {
  const generated = useId();
  const listId = `${id ?? generated}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<DropdownPlacement | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const emptyLabel = includeEmptyOption ? placeholder : null;
  const trigger = triggerState(options, value, emptyLabel, placeholder);
  const rows = useMemo(
    () => buildRows(options, open ? query : "", emptyLabel, noResultsText),
    [options, open, query, emptyLabel, noResultsText],
  );

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const openDropdown = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    setPlacement(rect ? dropdownPlacement(rect, window.innerHeight) : null);
    setQuery("");
    setOpen(true);
  };

  // ZTO `_open`: arama kutusu 30 ms sonra odaklanır, seçili seçenek görünür alana kaydırılır.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      searchRef.current?.focus();
      listRef.current
        ?.querySelector<HTMLElement>(".ss-option.ss-selected")
        ?.scrollIntoView?.({ block: "nearest" });
    }, OPEN_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Dışarı tıklama ve dışarı odak (Tab) kapatır.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("click", onPointer);
    return () => document.removeEventListener("click", onPointer);
  }, [open, close]);

  const pick = (next: string) => {
    close(true);
    if (next !== value) onChange(next);
  };

  const optionElements = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

  const moveFocus = (delta: 1 | -1) => {
    const items = optionElements();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const index = nextIndex(current, delta, items.length);
    if (index >= 0) items[index].focus();
  };

  const onTriggerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      if (open && event.key !== "ArrowDown") close(false);
      else if (!open) openDropdown();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close(false);
    }
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const onOptionKey = (event: KeyboardEvent<HTMLDivElement>, next: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(next);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const triggerClass = [
    "ss-trigger",
    trigger.placeholder ? "ss-placeholder" : "",
    open ? "ss-open" : "",
    disabled ? "ss-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={wrapperRef} className={className ? `ss-wrapper ${className}` : "ss-wrapper"}>
      <div
        ref={triggerRef}
        id={id}
        className={triggerClass}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={ariaLabelledBy}
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (open) close(false);
          else openDropdown();
        }}
        onKeyDown={onTriggerKey}
      >
        <span className="ss-trigger-text">{trigger.text}</span>
        <span className="ss-trigger-icon" aria-hidden="true">
          <i className="fas fa-chevron-down" />
        </span>
      </div>
      <div
        className={open ? "ss-dropdown ss-open" : "ss-dropdown"}
        style={placement ? { ...placement } : undefined}
        hidden={!open}
      >
        <div className="ss-search-wrap">
          <input
            ref={searchRef}
            type="text"
            className="ss-search-input"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKey}
          />
        </div>
        <div
          ref={listRef}
          className="ss-list"
          role="listbox"
          id={listId}
          aria-labelledby={ariaLabelledBy}
        >
          {rows.map((row, index) => {
            if (row.kind === "group") {
              return (
                <div key={`g-${index}`} className="ss-optgroup-label" role="presentation">
                  {row.label}
                </div>
              );
            }
            if (row.kind === "empty") {
              return (
                <div key="empty" className="ss-no-result" role="status">
                  {row.label}
                </div>
              );
            }
            const selected = row.value === value;
            const cls = [
              "ss-option",
              row.kind === "reset" ? "ss-option-reset" : "",
              selected ? "ss-selected" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={row.kind === "reset" ? "__reset__" : row.value}
                className={cls}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                data-value={row.value}
                onClick={(event) => {
                  event.stopPropagation();
                  pick(row.value);
                }}
                onKeyDown={(event) => onOptionKey(event, row.value)}
              >
                <span style={TEXT_WRAP}>
                  <Parts parts={row.parts} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

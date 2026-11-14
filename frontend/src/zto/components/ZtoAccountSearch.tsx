import {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAccountSearch } from "../../pages/finance/accountApi";
import type { Account, AccountType } from "../../pages/finance/types";
import {
  enterTarget,
  filterHits,
  groupIcon,
  isImeComposing,
  nextIndex,
  optionId,
  resolveIds,
  shouldSearch,
  variantDefaults,
  VARIANT_CLASSES,
  type AccountSearchIds,
  type AccountSearchVariant,
} from "./accountSearchLogic";

/** Arama sonucu: `GET /finance/accounts` satırı. */
export type AccountSearchHit = Account;

export type ZtoAccountSearchProps = {
  /** Seçili cari (giriş bu etiketi gösterir); id değişince metin yenilenir. */
  value?: { id: string; label: string } | null;
  onSelect: (account: AccountSearchHit) => void;
  /** Temizle düğmesi ya da metin silinince (ZTO filtre: gizli cari kimliği boşaltılır). */
  onClear?: () => void;
  /** Her yazışta (ZTO filtre: "yazmaya başlayınca önceki seçimi temizle"). */
  onInputChange?: (text: string) => void;
  placeholder: string;
  variant: AccountSearchVariant;
  ids?: AccountSearchIds;
  /** Varsayılan atcs/qca 1, listGroup 2. */
  minLength?: number;
  /** Varsayılan atcs/qca 220 ms, listGroup 300 ms. */
  delayMs?: number;
  /** Sonuç yokken (ZTO "Sonuç bulunamadı" / "Sonuç yok"). */
  emptyText: string;
  /** İstek hatasında; varsayılan "Hata oluştu". */
  errorText?: string;
  /** Satırın içi (ZTO satır sınıfı, rol ve tıklama bileşende). listGroup'ta yalnız metin. */
  renderItem?: (hit: AccountSearchHit) => ReactNode;
  /** Seçimden sonra girişte görünen metin; varsayılan cari adı. */
  labelOf?: (hit: AccountSearchHit) => string;
  types?: AccountType[];
  subGroup?: string;
  excludeId?: string;
  autoFocus?: boolean;
  /** Görünür etiket yoksa ekran okuyucu adı; varsayılan yer tutucu. */
  ariaLabel?: string;
  /** Görünür `<label>` varsa onun id'si (aria-label yerine). */
  ariaLabelledBy?: string;
  /** Sarmalayıcının satır içi stili (ZTO Transactions `#txCariSearchWrap` genişliği). */
  wrapStyle?: CSSProperties;
};

function cx(...parts: Array<string | false | null | undefined>): string | undefined {
  const joined = parts.filter(Boolean).join(" ");
  return joined === "" ? undefined : joined;
}

const LIST_GROUP_RESULTS_STYLE: CSSProperties = {
  position: "absolute",
  zIndex: 2000,
  width: "100%",
  maxHeight: 220,
  overflow: "auto",
  boxShadow: "0 6px 18px rgba(0,0,0,.15)",
};

/**
 * ZTO cari arama kutusu (üç görünüm, accountSearchLogic.ts). Davranış: gecikmeli arama
 * (`GET /finance/accounts?search=&size=20&active=true`), ↑/↓ ile gezinme, Enter seçili ya da ilk sonucu
 * seçer (IME birleştirmesinde değil), Escape ve dışarı tıklama kapatır. Erişilebilirlik (MWG): giriş
 * `role="combobox"` + `aria-expanded`/`aria-controls`/`aria-activedescendant`, sonuçlar `listbox`,
 * boş/hata metni `role="status"`. Sınıflar ve kimlikler ZTO'dan.
 */
export function ZtoAccountSearch({
  value,
  onSelect,
  onClear,
  onInputChange,
  placeholder,
  variant,
  ids,
  minLength,
  delayMs,
  emptyText,
  errorText,
  renderItem,
  labelOf,
  types,
  subGroup,
  excludeId,
  autoFocus,
  ariaLabel,
  ariaLabelledBy,
  wrapStyle,
}: ZtoAccountSearchProps) {
  const { t } = useTranslation();
  const classes = VARIANT_CLASSES[variant];
  const defaults = variantDefaults(variant);
  const min = minLength ?? defaults.minLength;
  const delay = delayMs ?? defaults.delayMs;
  const generated = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const resolved = resolveIds(ids, `zas${generated}`);

  const [text, setText] = useState(value?.label ?? "");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Dışarıdan seçim değişince giriş metni yenilenir.
  const valueId = value?.id ?? null;
  const valueLabel = value?.label ?? "";
  useEffect(() => {
    setText(valueLabel);
  }, [valueId, valueLabel]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = useAccountSearch(term, {
    types,
    subGroups: subGroup ? [subGroup] : undefined,
    enabled: shouldSearch(term, min),
  });
  const hits = filterHits(search.data ?? [], excludeId);
  const settled = search.isSuccess || search.isError;
  const shown = open && shouldSearch(term, min) && settled;

  // Dışarı tıklama kapatır (ZTO $(document).on('click', …)).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setText(next);
    setActive(-1);
    onInputChange?.(next);
    clearTimeout(timer.current);
    if (!shouldSearch(next, min)) {
      setOpen(false);
      setTerm("");
      if (next === "") onClear?.();
      return;
    }
    timer.current = setTimeout(() => {
      setTerm(next.trim());
      setOpen(true);
    }, delay);
  }

  function select(hit: AccountSearchHit) {
    clearTimeout(timer.current);
    setText(labelOf ? labelOf(hit) : hit.name);
    setOpen(false);
    setActive(-1);
    onSelect(hit);
  }

  function clear() {
    clearTimeout(timer.current);
    setText("");
    setTerm("");
    setOpen(false);
    setActive(-1);
    onClear?.();
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // MWG ime-safe-enter-submit: birleştirme Enter'ı seçim yapmaz; varsayılan (form gönderimi) engellenir.
      event.preventDefault();
      if (isImeComposing(event.nativeEvent)) return;
      const target = shown ? enterTarget(active, hits.length) : -1;
      if (target >= 0) select(hits[target]);
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        // Sonuçlar açıkken Escape yalnız listeyi kapatır (modal kapanmaz).
        event.stopPropagation();
        setOpen(false);
        setActive(-1);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!shown) {
        if (shouldSearch(term, min) && settled) setOpen(true);
        return;
      }
      event.preventDefault();
      setActive((current) => nextIndex(current, event.key, hits.length));
    }
  }

  function onFocus() {
    // ZTO: odaklanınca önceki sonuçlar yeniden gösterilir.
    if (shouldSearch(text, min) && term !== "" && hits.length > 0) setOpen(true);
  }

  const resultsId = resolved.results;
  const hasHits = shown && hits.length > 0;
  const activeId =
    hasHits && active >= 0 && active < hits.length ? optionId(resultsId, active) : undefined;

  const input = (
    <input
      ref={inputRef}
      type="text"
      id={resolved.input}
      className={classes.input}
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      autoFocus={autoFocus}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={shown}
      aria-controls={resultsId}
      aria-activedescendant={activeId}
      aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? placeholder)}
      aria-labelledby={ariaLabelledBy}
    />
  );

  const clearButton = classes.clear ? (
    <button
      type="button"
      id={resolved.clear}
      className={classes.clear}
      style={text.length > 0 ? undefined : { display: "none" }}
      onClick={clear}
      aria-label={t("common.a11y.clearSearch")}
    >
      <i className="fas fa-times" aria-hidden="true" />
    </button>
  ) : null;

  function defaultItem(hit: AccountSearchHit): ReactNode {
    if (variant === "listGroup") return `${hit.name} (${hit.code})`;
    const prefix = variant === "qca" ? "qca" : "atcs";
    const sub =
      variant === "qca" ? (
        <div className="qca-ri-sub">
          {hit.code} · {hit.subGroupName}
        </div>
      ) : (
        <div className="atcs-ri-sub">
          {hit.code} · <span className="atcs-ri-group">{hit.subGroupName}</span>
        </div>
      );
    return (
      <>
        <div className={`${prefix}-ri-icon`}>
          <i className={`fas ${groupIcon(variant, hit.subGroupName)}`} aria-hidden="true" />
        </div>
        <div className={variant === "qca" ? undefined : "atcs-ri-main"}>
          <div className={`${prefix}-ri-name`}>{hit.name}</div>
          {sub}
        </div>
      </>
    );
  }

  const items = hits.map((hit, index) => {
    const common = {
      id: optionId(resultsId, index),
      role: "option",
      "aria-selected": index === active,
      className: cx(classes.item, index === active && classes.itemActive),
      // mousedown: girişin odağı kaybolmadan seçilir.
      onMouseDown: (event: { preventDefault(): void }) => event.preventDefault(),
      onClick: (event: { preventDefault(): void }) => {
        event.preventDefault();
        select(hit);
      },
      onMouseEnter: () => setActive(index),
    } as const;
    const content = renderItem ? renderItem(hit) : defaultItem(hit);
    if (variant === "listGroup") {
      return (
        <a key={hit.id} {...common} href="#" style={{ fontSize: 12 }}>
          {content}
        </a>
      );
    }
    return (
      <div key={hit.id} {...common} style={variant === "atcs" ? { cursor: "pointer" } : undefined}>
        {content}
      </div>
    );
  });

  const status = shown && hits.length === 0 && (
    <div className={classes.empty} role="status">
      {search.isError ? (errorText ?? t("common.searchError")) : emptyText}
    </div>
  );

  const results = (
    <div
      id={resultsId}
      className={cx(classes.results, shown && classes.resultsOpen)}
      role={hasHits ? "listbox" : undefined}
      aria-label={hasHits ? (ariaLabel ?? placeholder) : undefined}
      style={
        variant === "listGroup"
          ? { ...LIST_GROUP_RESULTS_STYLE, display: shown ? "block" : "none" }
          : undefined
      }
    >
      {shown && (hits.length > 0 ? items : status)}
    </div>
  );

  if (variant === "listGroup") {
    return (
      <div ref={wrapRef} id={resolved.wrap} style={{ position: "relative", ...wrapStyle }}>
        {input}
        {results}
      </div>
    );
  }
  const icon = <i className={classes.icon} aria-hidden="true" />;
  return (
    <div ref={wrapRef} className={classes.wrap} id={resolved.wrap} style={wrapStyle}>
      {classes.inputBox ? (
        <div className={classes.inputBox}>
          {icon}
          {input}
          {clearButton}
        </div>
      ) : (
        <>
          {icon}
          {input}
          {clearButton}
        </>
      )}
      {results}
    </div>
  );
}

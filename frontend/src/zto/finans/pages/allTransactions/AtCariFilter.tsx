import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccountSearch } from "../../../../pages/finance/accountApi";
import type { Account } from "../../../../pages/finance/types";
import {
  AT_FILTER_SEARCH_IDS,
  enterTarget,
  groupIcon,
  isImeComposing,
  nextIndex,
  optionId,
  shouldSearch,
} from "../../../components/accountSearchLogic";

export type AtCariFilterProps = {
  /** Seçili cari; null iken giriş boştur (Sıfırla). */
  value: { id: string; label: string } | null;
  onSelect: (account: Account) => void;
  /** Temizle, ya da seçim varken yazmaya başlama (ZTO "önceki seçimi temizle"). */
  onClear: () => void;
};

/** ZTO bindFilterCariSearch gecikmesi (alltransactions.js:398). */
const DELAY_MS = 250;
const IDS = AT_FILTER_SEARCH_IDS as Required<typeof AT_FILTER_SEARCH_IDS>;

/**
 * Filtre kartındaki cari süzgeci (AllTransactions.cshtml:1290-1297, ajs bindFilterCariSearch /
 * filterCariSearch): `div.at-ic-pill.at-ic-cari#filterCariWrap` içinde çıplak giriş + temizle +
 * `div.atcs-results.at-cari-filter-results`. ZTO'nun bu kutusu başlıktaki `atcs-wrap` aramasından farklı
 * işaretlemededir; görünüm birebir kalsın diye ZtoAccountSearch yerine aynı mantık yardımcılarıyla
 * (accountSearchLogic.ts) burada çizilir. Erişilebilirlik (MWG): combobox + listbox, IME güvenli Enter.
 */
export function AtCariFilter({ value, onSelect, onClear }: AtCariFilterProps) {
  const { t } = useTranslation("ztoFinans");
  const { t: tr } = useTranslation();
  const [text, setText] = useState(value?.label ?? "");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const valueId = value?.id ?? null;
  const valueLabel = value?.label ?? "";
  useEffect(() => {
    setText(valueLabel);
    if (valueId === null) {
      setTerm("");
      setOpen(false);
    }
  }, [valueId, valueLabel]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = useAccountSearch(term, { enabled: shouldSearch(term, 1) });
  const hits = search.data ?? [];
  const settled = search.isSuccess || search.isError;
  const shown = open && shouldSearch(term, 1) && settled;

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
    if (value) onClear();
    clearTimeout(timer.current);
    if (!shouldSearch(next, 1)) {
      setOpen(false);
      setTerm("");
      return;
    }
    timer.current = setTimeout(() => {
      setTerm(next.trim());
      setOpen(true);
    }, DELAY_MS);
  }

  function select(hit: Account) {
    clearTimeout(timer.current);
    setText(hit.name);
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
    onClear();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (isImeComposing(event.nativeEvent)) return;
      const target = shown ? enterTarget(active, hits.length) : -1;
      if (target >= 0) select(hits[target]);
      return;
    }
    if (event.key === "Escape" && open) {
      setOpen(false);
      setActive(-1);
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && shown) {
      event.preventDefault();
      setActive((current) => nextIndex(current, event.key, hits.length));
    }
  }

  function onFocus() {
    if (shouldSearch(text, 1) && term !== "" && hits.length > 0) setOpen(true);
  }

  const hasHits = shown && hits.length > 0;
  const activeId = hasHits && active >= 0 ? optionId(IDS.results, active) : undefined;
  const placeholder = t("allTransactions.cariPlaceholder");

  return (
    <div
      ref={wrapRef}
      className="at-ic-pill at-ic-cari"
      id={IDS.wrap}
      title={t("allTransactions.cari")}
    >
      <i className="fas fa-user-tie at-ic-lead" aria-hidden="true" />
      <input
        type="text"
        id={IDS.input}
        className="at-bare-input"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={IDS.results}
        aria-activedescendant={activeId}
        aria-label={t("allTransactions.cari")}
      />
      <button
        type="button"
        id={IDS.clear}
        className="at-cari-clear-btn"
        style={text.length > 0 ? undefined : { display: "none" }}
        onClick={clear}
        aria-label={tr("common.a11y.clearSearch")}
      >
        <i className="fas fa-times" aria-hidden="true" />
      </button>
      <div
        id={IDS.results}
        className={
          shown ? "atcs-results at-cari-filter-results show" : "atcs-results at-cari-filter-results"
        }
        role={hasHits ? "listbox" : undefined}
        aria-label={hasHits ? t("allTransactions.cari") : undefined}
      >
        {shown &&
          (hasHits ? (
            hits.map((hit, index) => (
              <div
                key={hit.id}
                id={optionId(IDS.results, index)}
                role="option"
                aria-selected={index === active}
                className={index === active ? "atcs-item active" : "atcs-item"}
                data-id={hit.id}
                style={{ cursor: "pointer" }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(hit)}
                onMouseEnter={() => setActive(index)}
              >
                <div className="atcs-ri-icon">
                  <i className={`fas ${groupIcon("atcs", hit.subGroupName)}`} aria-hidden="true" />
                </div>
                <div className="atcs-ri-main">
                  <div className="atcs-ri-name">{hit.name}</div>
                  <div className="atcs-ri-sub">
                    {hit.code} · <span className="atcs-ri-group">{hit.subGroupName}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="atcs-empty" role="status">
              {search.isError
                ? search.error instanceof Error && search.error.message
                  ? `${t("allTransactions.error")}: ${search.error.message}`
                  : t("allTransactions.errorOccurred")
                : t("allTransactions.noResults")}
            </div>
          ))}
      </div>
    </div>
  );
}

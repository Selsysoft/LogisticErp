import { CSSProperties, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mapInChunks } from "../../../a11y";
import {
  CHUNK_THRESHOLD,
  MIN_SEARCH,
  SEARCH_DELAY_MS,
  filterCards,
  markParts,
  searchWords,
  type ChipFilters,
  type FilterType,
  type FundCard,
  type StatItem,
} from "./fundsLogic";

/*
 * Bankalar ve Kasalar listelerinin ortak parçaları (ZTO BankIntroduction/Index.cshtml:1065-1164,
 * :2214-2380; CashIntroduction/Index.cshtml aynı desen): arama kartı, dinamik çip kartları, sonuç
 * göstergeleri ve arama vurgusu.
 */

/** Canlı arama durumu: 300 ms gecikme, ≥ 2 karakter; "Ara" düğmesi beklemeden uygular. */
export function useFundSearch() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed.length > 0 && trimmed.length < MIN_SEARCH) return;
    const timer = setTimeout(() => setTerm(trimmed), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input]);
  const submitNow = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed.length > 0 && trimmed.length < MIN_SEARCH) return;
    setTerm(trimmed);
  }, [input]);
  const clear = useCallback(() => {
    setInput("");
    setTerm("");
  }, []);
  const words = useMemo(() => searchWords(term), [term]);
  return { input, setInput, term, words, submitNow, clear };
}

/**
 * Süzülmüş kartlar. > 500 kartta süzme 50 ms parçalarla yapılır (§5.0 #9; MWG break-up-long-tasks);
 * yeni süzme gelince önceki iptal edilir.
 */
export function useFilteredCards(
  cards: readonly FundCard[],
  filters: ChipFilters,
  words: readonly string[],
): FundCard[] {
  const large = cards.length > CHUNK_THRESHOLD;
  const sync = useMemo(
    () => (large ? null : filterCards(cards, filters, words)),
    [large, cards, filters, words],
  );
  const [chunked, setChunked] = useState<FundCard[]>([]);
  useEffect(() => {
    if (!large) return;
    const controller = new AbortController();
    mapInChunks(cards, (card) => (filterCards([card], filters, words).length > 0 ? card : null), {
      signal: controller.signal,
    })
      .then((result) => setChunked(result.filter((c): c is FundCard => c !== null)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [large, cards, filters, words]);
  return sync ?? chunked;
}

/** Arama vurgusu (`<mark>`; ZTO highlightInHtml). */
export function Marked({
  text,
  words,
}: {
  text: string | null | undefined;
  words: readonly string[];
}) {
  const value = text ?? "";
  if (words.length === 0) return <>{value}</>;
  return (
    <>
      {markParts(value, words).map((part, index) =>
        part.mark ? (
          <mark key={index}>{part.text}</mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

export type SearchCardProps = {
  inputId: string;
  placeholder: string;
  label: string;
  search: ReturnType<typeof useFundSearch>;
  clearId: string;
  buttonId: string;
  autoFocus?: boolean;
};

/**
 * Arama kartı (ZTO `search-compact-card`). MWG `accessibility` §3/§7: görünmez `label[for]`
 * (placeholder ad değildir), `type="search"`, `autocomplete="off"`; simge düğmelerinin adı var.
 */
export function SearchCard({
  inputId,
  placeholder,
  label,
  search,
  clearId,
  buttonId,
  autoFocus,
}: SearchCardProps) {
  const { t } = useTranslation("ztoFinans");
  const showClear = search.input.length > 0 || search.term.length >= MIN_SEARCH;
  return (
    <div className="card search-compact-card">
      <div className="card-body">
        <div className="input-group">
          <div className="input-group-prepend">
            <span className="input-group-text bg-transparent border-0">
              <i className="fas fa-search text-muted" aria-hidden="true" />
            </span>
          </div>
          <label className="sr-only" htmlFor={inputId}>
            {label}
          </label>
          <input
            type="search"
            id={inputId}
            className="form-control border-0"
            placeholder={placeholder}
            autoComplete="off"
            autoFocus={autoFocus}
            value={search.input}
            onChange={(event) => search.setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                search.submitNow();
              }
            }}
          />
          <div className="input-group-append">
            <button
              className="btn btn-outline-secondary border-0"
              type="button"
              id={clearId}
              style={showClear ? undefined : HIDDEN}
              aria-label={t("funds.list.clearSearch")}
              onClick={search.clear}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
            <button
              className="btn btn-primary"
              type="button"
              id={buttonId}
              aria-label={t("funds.list.search")}
              onClick={search.submitNow}
            >
              <i className="fas fa-search" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="search-compact-help">{t("funds.banks.search.help")}</div>
      </div>
    </div>
  );
}

const HIDDEN: CSSProperties = { display: "none" };

/** ZTO tıklanabilir div (`close-filter`): düğme rolü, odaklanabilir, Enter/Boşluk (MWG accessibility §5). */
export function actionProps(onAction: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onAction,
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onAction();
      }
    },
  };
}

/** ZTO paintFilterBars: çip çubuğu rengi başlık simgesinin saydam hali. */
function accentOf(iconClassName: string): string {
  if (iconClassName.includes("text-success")) return "rgba(16,185,129,0.16)";
  if (iconClassName.includes("text-primary")) return "rgba(59,130,246,0.16)";
  if (iconClassName.includes("text-warning")) return "rgba(245,158,11,0.18)";
  if (iconClassName.includes("text-danger")) return "rgba(239,68,68,0.16)";
  return "rgba(148,163,184,0.16)";
}

export type StatCardProps = {
  title: string;
  iconClassName: string;
  filterType: string;
  items: StatItem[];
  active: string | null | undefined;
  onToggle: (value: string) => void;
};

/**
 * Dinamik çip kartı (ZTO `stat-main-card`; BI:1094-1164, toggleDynamicFilter). Sayılar görünür
 * kartlardan; 0 → `stat-item-empty`; `--pct` / `--bar` çubuğu. Çip düğme gibi davranır
 * (`role="button"`, `aria-pressed`, Enter/Boşluk).
 */
export function StatCard({
  title,
  iconClassName,
  filterType,
  items,
  active,
  onToggle,
}: StatCardProps) {
  const bar = accentOf(iconClassName);
  return (
    <div className="stat-main-card">
      <div className="stat-main-header">
        <i className={iconClassName} aria-hidden="true" />
        <span>{title}</span>
      </div>
      <div className="stat-items-wrapper">
        {items.map((item) => {
          const isActive = active === item.value;
          const cls = ["stat-item", isActive ? "active" : "", item.empty ? "stat-item-empty" : ""]
            .filter(Boolean)
            .join(" ");
          const style = { "--pct": `${item.pct}%`, "--bar": bar } as CSSProperties;
          return (
            <div
              key={item.value}
              className={cls}
              style={style}
              data-filter-type={filterType}
              data-filter-value={item.value}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onClick={() => onToggle(item.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggle(item.value);
                }
              }}
            >
              <span className="stat-item-label">{item.label}</span>
              <span className="stat-item-value">{item.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "N / M kayıt gösteriliyor" (ZTO #dynamicFilterResultsIndicator). */
export function FilterIndicator({
  visible,
  total,
  filters,
  onClear,
}: {
  visible: number;
  total: number;
  filters: ChipFilters;
  onClear: () => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const active = Object.values(filters).some((v) => v !== null && v !== undefined);
  return (
    <div id="dynamicFilterResultsIndicator" className="dynamic-filter-indicator">
      {active && (
        <div className="filter-indicator">
          <div>
            <i className="fas fa-filter text-primary" aria-hidden="true" />{" "}
            <strong>{visible}</strong> {t("funds.list.showing", { total })}
          </div>
          <div className="close-filter" {...actionProps(onClear)}>
            <i className="fas fa-times" aria-hidden="true" /> {t("funds.list.clearFilters")}
          </div>
        </div>
      )}
    </div>
  );
}

/** '"x" için N sonuç bulundu' (ZTO #searchResultsIndicator); tek kibar canlı bölge. */
export function SearchIndicator({
  term,
  count,
  onClear,
}: {
  term: string;
  count: number;
  onClear: () => void;
}) {
  const { t } = useTranslation("ztoFinans");
  return (
    <div id="searchResultsIndicator" role="status">
      {term.length >= MIN_SEARCH && count > 0 && (
        <div className="filter-indicator">
          <div>
            <i className="fas fa-search text-primary" aria-hidden="true" />{" "}
            <strong>"{term}"</strong> {t("funds.list.resultsFound", { count })}
          </div>
          <div className="close-filter" {...actionProps(onClear)}>
            <i className="fas fa-times" aria-hidden="true" /> {t("funds.list.clearSearchLink")}
          </div>
        </div>
      )}
    </div>
  );
}

/** Arama sonucu yok (ZTO `.search-no-results`). */
export function SearchNoResults({ text, onClear }: { text: string; onClear: () => void }) {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="search-no-results">
      <i className="fas fa-search fa-3x mb-3" aria-hidden="true" />
      <h5 className="text-muted">{t("funds.list.noResultsTitle")}</h5>
      <p className="text-muted">{text}</p>
      <button type="button" className="btn btn-outline-secondary" onClick={onClear}>
        <i className="fas fa-times" aria-hidden="true" /> {t("funds.list.clearSearchLink")}
      </button>
    </div>
  );
}

/** Çip süzgeci durumu. */
export function useChipFilters() {
  const [filters, setFilters] = useState<ChipFilters>({});
  const toggle = useCallback((type: FilterType, value: string | null) => {
    setFilters((current) => ({ ...current, [type]: value }));
  }, []);
  const clear = useCallback(() => setFilters({}), []);
  return { filters, toggle, clear };
}

/** "Yenile" düğmesi durumu: is-refreshing → başarıda is-refreshed 700 ms (ZTO refreshAccountsFromController). */
export function useRefreshState(refetch: () => Promise<{ isError: boolean; error: unknown }>) {
  const [state, setState] = useState<"" | "is-refreshing" | "is-refreshed">("");
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = useCallback(async () => {
    setState("is-refreshing");
    setError(null);
    const result = await refetch();
    if (result.isError) {
      setState("");
      setError(result.error ?? new Error("refresh"));
      return;
    }
    setState("is-refreshed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(""), 700);
  }, [refetch]);
  return { state, error, run, dismiss: () => setError(null) };
}

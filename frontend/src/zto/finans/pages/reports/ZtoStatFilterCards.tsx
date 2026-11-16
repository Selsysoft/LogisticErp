import { KeyboardEvent, useEffect, useMemo } from "react";
import {
  cardItems,
  facetCounts,
  formatResult,
  isFiltered,
  matches,
  orderValues,
  rebuildActive,
  rowValues,
  toggleMulti,
  type StatActive,
  type StatRow,
} from "./statFilterLogic";

export type ZtoStatFilterCard = {
  /** Kayıt alanı (ZTO `data-<Key>`). */
  key: string;
  title: string;
  /** Font Awesome 5 sınıfları (ör. "fas fa-user-tie"). */
  icon: string;
  /** `theme-<ad>` (supplier, neutral, primary …). */
  theme: string;
  /** "value-desc": değerin kendisine göre azalan sıra (ZTO `data-order`). */
  order?: "value-desc";
};

export type ZtoStatFilterCardsProps = {
  id: string;
  ariaLabel: string;
  clearLabel: string;
  /** "{0} / {1} satır". */
  resultTemplate: string;
  /** Boş değer kovasının etiketi (ZTO `data-empty-label`; "Belirtilmedi"). */
  emptyLabel: string;
  cards: readonly ZtoStatFilterCard[];
  /** Süzülen kayıtların tamamı (sayılar arama kutusundan bağımsızdır). */
  rows: readonly StatRow[];
  active: StatActive;
  onChange: (next: StatActive) => void;
  /** Gösterilen / toplam (sayfanın kendi süzgeci dahil); verilmezse kart seçimine uyan kayıt sayısı. */
  count?: readonly [number, number];
};

/**
 * Kartlı hızlı filtre (ZTO Views/Shared/_StatFilterCards.cshtml + wwwroot/js/stat-filter.js, çoklu
 * kip; 12.8_TASARIM §5.5). DOM ve sınıflar ZTO kabuğuyla birebir; kart öğeleri ZTO gibi
 * `div[role=button]` (Enter/Space seçer), seçili değer `aria-pressed="true"`, sayısı 0 olan değer
 * `aria-disabled` ve sekme sırası dışında. Sonuç metni `aria-live="polite"` (ZTO). Yalnız FE-2
 * FinanceReport liste kipi kullanır (§7.3).
 */
export function ZtoStatFilterCards(props: ZtoStatFilterCardsProps) {
  const { cards, rows, active, onChange } = props;
  const keys = useMemo(() => cards.map((card) => card.key), [cards]);
  const values = useMemo(() => rows.map((row) => rowValues(row, keys)), [rows, keys]);
  const orders = useMemo(() => {
    const initial = facetCounts(values, keys, {});
    return Object.fromEntries(
      cards.map((card) => [card.key, orderValues(initial[card.key] ?? {}, card.order)]),
    ) as Record<string, string[]>;
  }, [values, keys, cards]);
  const counts = useMemo(() => facetCounts(values, keys, active), [values, keys, active]);

  // Veri değişince (yeniden kurulum) artık olmayan seçimler düşer (stat-filter.js `rebuild`).
  useEffect(() => {
    const next = rebuildActive(active, values, keys);
    if (JSON.stringify(next) !== JSON.stringify(active)) onChange(next);
    // Yalnız veri değişiminde; seçim değişimi tıklamada zaten budanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const filtered = isFiltered(active);
  const shown =
    props.count ?? ([values.filter((row) => matches(row, active)).length, values.length] as const);

  const toggle = (key: string, value: string) =>
    onChange(toggleMulti(active, key, value, values, keys));

  const onItemKey = (
    event: KeyboardEvent<HTMLDivElement>,
    key: string,
    value: string,
    empty: boolean,
  ) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    if (!empty) toggle(key, value);
  };

  return (
    <div
      className={`stat-filter${filtered ? " is-filtered" : ""}`}
      id={props.id}
      role="group"
      aria-label={props.ariaLabel}
      aria-busy="false"
      data-empty-label={props.emptyLabel}
      data-result-template={props.resultTemplate}
    >
      <div className="stat-cards-container">
        {cards.map((card) => {
          const items = cardItems(
            card.key,
            orders[card.key] ?? [],
            counts,
            active,
            props.emptyLabel,
          );
          return (
            <div
              key={card.key}
              className={`stat-main-card theme-${card.theme}`}
              data-card-key={card.key}
              hidden={items.length === 0}
            >
              <div className="stat-main-header">
                <span className="stat-main-icon" aria-hidden="true">
                  <i className={card.icon} />
                </span>
                <span className="stat-main-title">{card.title}</span>
              </div>
              <div
                className="stat-items-wrapper"
                data-filter-type={card.key}
                data-order={card.order}
                role="group"
                aria-label={card.title}
              >
                {items.map((item) => (
                  <div
                    key={item.value}
                    className={[
                      "stat-item",
                      item.blank ? "stat-item-blank" : "",
                      item.selected ? "active" : "",
                      item.empty ? "stat-item-empty" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    role="button"
                    tabIndex={item.empty ? -1 : 0}
                    aria-pressed={item.selected}
                    aria-disabled={item.empty}
                    data-filter-type={card.key}
                    data-filter-value={item.value}
                    title={item.label}
                    onClick={() => {
                      if (!item.empty) toggle(card.key, item.value);
                    }}
                    onKeyDown={(event) => onItemKey(event, card.key, item.value, item.empty)}
                  >
                    <span className="stat-item-label">{item.label}</span>
                    <span className="stat-item-value">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="stat-filter-footer">
        <span className="stat-result" aria-live="polite">
          <i className="fas fa-filter stat-result-icon" aria-hidden="true" />
          <span data-stat-result="">
            {filtered ? formatResult(props.resultTemplate, shown[0], shown[1]) : ""}
          </span>
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary stat-clear-btn"
          data-stat-clear=""
          onClick={() => onChange({})}
        >
          <i className="fas fa-times" aria-hidden="true" /> {props.clearLabel}
        </button>
      </div>
    </div>
  );
}

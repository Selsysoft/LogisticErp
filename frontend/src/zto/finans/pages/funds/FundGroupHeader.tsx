import { CSSProperties } from "react";
import { formatN2 } from "../../../format";
import type { CurrencyTotal } from "./fundsLogic";

export type FundGroupHeaderProps = {
  /** "account": Bankalar (`account-group-header`), "cash": Kasalar (`cash-group-header`). */
  variant: "account" | "cash";
  /** Font Awesome sınıfı (fa- önekli). */
  icon: string;
  color: string;
  name: string;
  countText: string;
  totals: readonly CurrencyTotal[];
  /** Toplam rengi (Bankalar: Kredi kırmızı, diğerleri grup rengi). */
  totalColor?: string;
};

const ICON_SIZE = { fontSize: 20 } as const;

/**
 * Grup başlığı: Bankalar tür grubu (ZTO _AccountCardsListPartial:17-33), Kasalar grubu
 * (_CashCardsListPartial:54-72) ve (≥ 2 şirket, konsolide) şirket grubu — Blackrose eki aynı DOM'u
 * kullanır. Başlık metni `role="heading"` (MWG `accessibility` §1: görsel başlık gerçek başlık olarak
 * okunsun; ZTO `div` DOM'u korunur).
 */
export function FundGroupHeader({
  variant,
  icon,
  color,
  name,
  countText,
  totals,
  totalColor,
}: FundGroupHeaderProps) {
  if (variant === "cash") {
    return (
      <div className="cash-group-header">
        <div className="cash-group-title" role="heading" aria-level={3}>
          <i className={`fas ${icon}`} style={{ color }} aria-hidden="true" />
          <span>{name}</span> <span className="cash-group-count">{countText}</span>
        </div>
        <div className="cash-group-total">
          <div className="group-total-list">
            {totals.map((total) => (
              <span key={total.currency} className="group-total-item">
                <span className="group-total-symbol">{total.symbol}</span> {formatN2(total.total)}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  const border: CSSProperties = { borderLeft: `4px solid ${color}` };
  return (
    <div className="account-group-header" style={border}>
      <div className="account-group-title" role="heading" aria-level={3}>
        <i className={`fas ${icon}`} style={{ color, ...ICON_SIZE }} aria-hidden="true" />
        <span>{name}</span> <span className="account-group-count">{countText}</span>
      </div>
      <div className="account-group-total">
        <div className="group-total-list">
          {totals.map((total) => (
            <span
              key={total.currency}
              className="group-total-item"
              style={{ color: totalColor ?? color }}
            >
              <span>{formatN2(total.total)}</span>{" "}
              <span className="group-total-symbol">{total.symbol}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

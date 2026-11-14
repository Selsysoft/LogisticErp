import { useTranslation } from "react-i18next";
import { SPARK_HEIGHT, SPARK_WIDTH, balanceSeries, sparkGeometry } from "./sparklineLogic";

export type FundSparklineProps = {
  fundId: string;
  /** Güncel bakiye (serinin son noktası). */
  current: number;
  /** Son 20 hareketin işaretli tutarı, eskiden yeniye; yüklenmediyse/hata varsa null. */
  deltas: readonly number[] | null;
};

/**
 * Kart sparkline'ı (ZTO `div.account-spark` + `buildSpark` SVG'si; 12.2 §5.5). MWG `accessibility`
 * §6 "Inline SVGs": bilgi taşıyan SVG `role="img"` + `aria-label` (yön ve hareket yok durumu); ZTO
 * `title` ipucu kapsayıcıda kalır.
 */
export function FundSparkline({ fundId, current, deltas }: FundSparklineProps) {
  const { t } = useTranslation("ztoFinans");
  const geometry = sparkGeometry(deltas ? balanceSeries(current, deltas) : null);
  const viewBox = `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`;
  if (geometry.flat) {
    return (
      <div className="account-spark" data-bank-id={fundId} title={t("funds.card.noMovement")}>
        <svg
          viewBox={viewBox}
          preserveAspectRatio="none"
          role="img"
          aria-label={t("funds.card.noMovement")}
        >
          <line
            x1={geometry.x1}
            y1={geometry.midY}
            x2={geometry.x2}
            y2={geometry.midY}
            stroke="#cbd5e1"
            strokeWidth="1.5"
            strokeDasharray="3,3"
          />
        </svg>
      </div>
    );
  }
  const gid = `spg${fundId}`;
  const fid = `spf${fundId}`;
  return (
    <div className="account-spark" data-bank-id={fundId} title={t("funds.card.sparkTitle")}>
      <svg
        viewBox={viewBox}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("funds.card.sparkLabel", {
          trend: t(geometry.up ? "funds.card.sparkUp" : "funds.card.sparkDown"),
        })}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={geometry.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={geometry.color} stopOpacity="0" />
          </linearGradient>
          <filter id={fid} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="1.6"
              floodColor={geometry.color}
              floodOpacity="0.30"
            />
          </filter>
        </defs>
        <path d={geometry.area} fill={`url(#${gid})`} stroke="none" />
        <path
          d={geometry.line}
          fill="none"
          stroke={geometry.color}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={`url(#${fid})`}
        />
      </svg>
    </div>
  );
}

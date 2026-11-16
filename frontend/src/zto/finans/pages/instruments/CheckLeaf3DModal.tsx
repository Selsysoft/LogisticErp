import { CSSProperties, MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InstrumentListItem } from "../../../../pages/finance/types";
import { ZtoModal, formatDate, formatMoneyValue } from "../../../components";
import { amountInWords, detailBadgeClass, micrSerial, stampOf } from "./checksLogic";
import { accountingStatus, statusLabelKey } from "./instrumentLogic";

const DETAIL_ROW: CSSProperties = { gap: 8, flexWrap: "nowrap", alignItems: "stretch" };
const DETAIL_COL: CSSProperties = { flex: "1 1 50%", minWidth: 0 };
const ENDORSE_BADGE: CSSProperties = { background: "#7c3aed", color: "#fff" };
const BACK_SIGN: CSSProperties = { marginTop: "auto" };
const BACK_NOTE: CSSProperties = { marginTop: 4 };
const BACK_MICR: CSSProperties = { opacity: 0.35 };
/** Fare eğimi en büyük açısı (CHK:4481 `MAXD`). */
const MAX_TILT = 14;

/** Hareket tercihi: eğim yalnız `prefers-reduced-motion: no-preference` iken bağlanır (MWG `motion`). */
function motionAllowed(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

type Props = {
  item: InstrumentListItem | null;
  onHide: () => void;
};

/**
 * M4 "Çek Detayları" — 3B çek yaprağı (ZTO Checks.cshtml:1317-1397, 4273-4495; 12.3 §5.4). Ön yüz
 * çek, arka yüz ciro alanı, altta iki sütunlu detay tabloları. Çevirme ve eğim yalnız hareket
 * tercihine izin veren kullanıcıda canlandırılır (CSS `checks.css` BR eki); azaltılmış harekette yüz
 * anında değişir. Görünmeyen yüz `aria-hidden`. Maskeli (personel carili) çekte ad alanları "-".
 */
export function CheckLeaf3DModal({ item, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const l = (key: string, values?: Record<string, unknown>) => t(`checks.leaf.${key}`, values);
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState<string | undefined>(undefined);
  const tiltEnabled = useRef(false);

  useEffect(() => {
    if (item) {
      setFlipped(false);
      setTilt(undefined);
      tiltEnabled.current = motionAllowed();
    }
  }, [item]);

  if (!item) return null;

  const masked = item.employeeMasked;
  const own = item.direction === "ISSUED";
  const name = (value: string | null | undefined) => (masked ? "-" : value || "");
  const amountText = formatMoneyValue(item.money);
  const stamp = stampOf(item);
  const stampNode = stamp ? (
    <div className="c3d-stamp" style={{ color: stamp.color }}>
      {t(stamp.key)}
    </div>
  ) : null;
  const serial = [item.checkBookSerial, item.leafNo ? String(item.leafNo) : null]
    .filter(Boolean)
    .join(" / ");
  const drawer = own ? item.companyName : name(item.drawerName ?? item.accountName);
  const payee = name(item.accountName) || "..................";
  const words =
    item.money.currency === "TRY" || !item.money.currency
      ? amountInWords(item.money.amount)
      : `#${amountText}#`;
  const endorsed = item.status === "ENDORSED" && !!item.endorsedAccountName && !masked;
  const statusText = t(statusLabelKey(item.kind, item.direction, item.status));
  const accounting = accountingStatus(item);

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!tiltEnabled.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - rect.left) / rect.width - 0.5;
    const dy = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt(
      `rotateY(${(dx * MAX_TILT * 2).toFixed(2)}deg) rotateX(${(-dy * MAX_TILT * 2).toFixed(2)}deg)`,
    );
  };

  const row = (label: string, value: ReactNode) =>
    value ? (
      <tr>
        <th scope="row">{label}</th>
        <td>{value}</td>
      </tr>
    ) : null;

  return (
    <ZtoModal
      show
      onHide={onHide}
      size="lg"
      className="erp-modal"
      rootId="checkLeafModal"
      title={
        <>
          <i className="fas fa-money-check-alt" aria-hidden="true" /> {l("title")}
          <span id="c3dTitleNo" className="badge badge-light ml-2">
            {l("titleNo", { no: item.number || "-" })}
          </span>
        </>
      }
      footer={
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          {l("close")}
        </button>
      }
    >
      <>
        <div
          className="c3d-stage"
          id="c3dStage"
          onMouseMove={onMove}
          onMouseLeave={() => setTilt(undefined)}
        >
          <div className="c3d-tilt" id="c3dTilt" style={tilt ? { transform: tilt } : undefined}>
            <div
              className={`c3d-card${flipped ? " is-flipped" : ""}`}
              id="c3dCard"
              onClick={() => setFlipped((f) => !f)}
            >
              <div className="c3d-face c3d-front" id="c3dFront" aria-hidden={flipped}>
                <div className="c3d-pad">
                  {stampNode}
                  <div className="c3d-row1">
                    <div>
                      <div className="c3d-bank-name">{item.bankName || l("bankFallback")}</div>
                      <div className="c3d-bank-branch">
                        {item.bankBranch ?? ""}
                        {serial ? `${item.bankBranch ? "  •  " : ""}${l("book", { serial })}` : ""}
                      </div>
                    </div>
                    <div className="c3d-amt-box">{amountText}</div>
                  </div>
                  <div className="c3d-body">
                    {l("bodyBefore")} <strong>{payee}</strong> {l("bodyMiddle")}
                    <br />
                    <span className="c3d-words">{words}</span> {l("bodyAfter")}
                  </div>
                  <div className="c3d-meta">
                    <div className="c3d-meta-left">
                      {l("issue")}{" "}
                      <strong>{item.issueDate ? formatDate(item.issueDate) : "-"}</strong>
                      <br />
                      {l("due")} <strong>{formatDate(item.dueDate)}</strong>
                      {"  •  "}
                      {l("no")} <strong>{item.number}</strong>
                    </div>
                    <div className="c3d-sign">
                      {l("drawer")}
                      <br />
                      <strong>{drawer || "-"}</strong>
                      <div className="c3d-sign-line">{l("sign")}</div>
                    </div>
                  </div>
                  <div className="c3d-micr">
                    ⑆{item.number || "0000000"}⑆ {micrSerial(item.checkBookSerial)} ⑈
                  </div>
                </div>
              </div>
              <div className="c3d-face c3d-back" id="c3dBack" aria-hidden={!flipped}>
                <div className="c3d-pad">
                  {stampNode}
                  <div className="c3d-back-title">
                    <i className="fas fa-exchange-alt" aria-hidden="true" /> {l("backTitle")}
                  </div>
                  {endorsed ? (
                    <div className="mt-1">
                      <span className="badge" style={ENDORSE_BADGE}>
                        {l("endorsedBadge")}
                      </span>{" "}
                      <strong>{item.endorsedAccountName}</strong> {l("endorsedText")}
                    </div>
                  ) : (
                    <div className="c3d-endorse-note mt-1">{l("noEndorse")}</div>
                  )}
                  {item.custodyFundName && (
                    <div className="c3d-endorse-note mt-2">
                      <i className="fas fa-cash-register" aria-hidden="true" /> {l("inCash")}{" "}
                      <strong>{item.custodyFundName}</strong>
                    </div>
                  )}
                  <div style={BACK_SIGN}>
                    <div className="c3d-endorse-line" />
                    <div className="c3d-endorse-line" />
                    <div className="c3d-endorse-note" style={BACK_NOTE}>
                      {l("signer")}
                    </div>
                  </div>
                  <div className="c3d-micr" style={BACK_MICR}>
                    ⑆{item.number || "0000000"}⑆
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="text-center mt-1 mb-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            aria-pressed={flipped}
            onClick={() => setFlipped((f) => !f)}
          >
            <i className="fas fa-sync-alt" aria-hidden="true" /> {l("flip")}
          </button>
          <span className="sr-only" role="status">
            {l(flipped ? "back" : "front")}
          </span>
        </div>
        <div id="c3dDetails">
          <div className="row no-gutters" style={DETAIL_ROW}>
            <div style={DETAIL_COL}>
              <div className="c3d-sec">
                <div className="c3d-sec-title">
                  <i className="fas fa-money-check-alt" aria-hidden="true" /> {l("secCheck")}
                </div>
                <table className="c3d-table">
                  <tbody>
                    {row(l("number"), <strong>{item.number}</strong>)}
                    {row(l("bank"), item.bankName)}
                    {row(l("branch"), item.bankBranch)}
                    {row(l("book2"), serial)}
                    {row(l("amount"), <strong>{amountText}</strong>)}
                    {row(l("type"), l(own ? "own" : "customer"))}
                    {row(
                      l("ownership"),
                      l(item.status === "ENDORSED" ? "endorsed" : own ? "own" : "customer"),
                    )}
                    {item.custodyFundName &&
                      row(
                        l("cash"),
                        <>
                          <i className="fas fa-cash-register text-muted" aria-hidden="true" />{" "}
                          {item.custodyFundName}
                        </>,
                      )}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={DETAIL_COL}>
              <div className="c3d-sec">
                <div className="c3d-sec-title">
                  <i className="fas fa-user-friends" aria-hidden="true" /> {l("secParties")}
                </div>
                <table className="c3d-table">
                  <tbody>
                    {row(l("drawer"), drawer)}
                    {row(l("payee"), name(item.accountName))}
                    {endorsed && row(l("holder"), item.endorsedAccountName)}
                    {row(l("issueDate"), item.issueDate ? formatDate(item.issueDate) : "")}
                    {row(l("dueDate"), formatDate(item.dueDate))}
                    {item.settledDate &&
                      row(l(own ? "paidDate" : "collectedDate"), formatDate(item.settledDate))}
                    {row(
                      l("status"),
                      <>
                        <span className={`badge ${detailBadgeClass(item.status)}`}>
                          {statusText}
                        </span>
                        {item.status === "ENDORSED" && (
                          <>
                            {" "}
                            <span className="badge" style={ENDORSE_BADGE}>
                              {l("endorsedShort")}
                            </span>
                          </>
                        )}
                      </>,
                    )}
                    {row(l("accounting"), t(accounting.labelKey))}
                    {item.movementCount > 0 &&
                      row(
                        l("movement"),
                        `${l("movementText", { count: item.movementCount })}${
                          item.lastMovementDate
                            ? ` ${l("lastMovement", { date: formatDate(item.lastMovementDate) })}`
                            : ""
                        }`,
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {!masked && item.description && (
            <div className="c3d-sec mt-2">
              <div className="c3d-sec-title">
                <i className="fas fa-align-left" aria-hidden="true" /> {l("descTitle")}
              </div>
              <div className="c3d-desc">{item.description.replace(/ \| /g, "\n")}</div>
            </div>
          )}
        </div>
      </>
    </ZtoModal>
  );
}

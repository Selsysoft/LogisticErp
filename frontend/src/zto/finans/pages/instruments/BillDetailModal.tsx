import { useTranslation } from "react-i18next";
import { useAccount } from "../../../../pages/finance/accountApi";
import type { InstrumentListItem } from "../../../../pages/finance/types";
import { ZtoModal, formatDate, formatN2 } from "../../../components";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { billParties, billStatusBadgeClass, type BillParty } from "./billsLogic";
import { noteTypeLabelKey, remainingDays, statusLabelKey } from "./instrumentLogic";

type Props = {
  /** Gösterilen senet (liste satırı); null → kapalı. */
  item: InstrumentListItem | null;
  onHide: () => void;
};

/**
 * "Senet Detayları" (ZTO Bills.cshtml #billDetailModal :467-487, viewBillDetail :3440-3510). Veri
 * liste satırından gelir; telefon cari kartından okunur (`useAccount`). Personel carili (maskeli)
 * satırda modal açılmaz (menüde "Detay Görüntüle" yok).
 */
export function BillDetailModal({ item, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const account = useAccount(
    item && !item.employeeMasked ? (item.accountId ?? undefined) : undefined,
  );
  const d = (key: string, options?: Record<string, unknown>) => t(`bills.detail.${key}`, options);
  const phone = account.data?.phone ?? null;
  const parties = item ? billParties(item) : null;
  const phoneOf = (party: BillParty) =>
    item && party.name !== null && party.name === item.accountName ? phone : null;
  const days = item ? remainingDays(item.dueDate, todayIso()) : null;

  return (
    <ZtoModal
      show={item !== null}
      onHide={onHide}
      size="lg"
      rootId="billDetailModal"
      className="erp-modal"
      title={
        <>
          <i className="fas fa-file-invoice-dollar" aria-hidden="true" /> {d("title")}
        </>
      }
      footer={
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          {d("close")}
        </button>
      }
    >
      {item && parties && (
        <div id="billDetailContent">
          <div className="row">
            <div className="col-md-6">
              <h6>
                <i className="fas fa-info-circle text-primary" aria-hidden="true" /> {d("info")}
              </h6>
              <table className="table table-sm table-borderless">
                <tbody>
                  <tr>
                    <th scope="row" style={{ width: "40%" }}>
                      {d("number")}
                    </th>
                    <td>
                      <strong>{item.number}</strong>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{d("noteType")}</th>
                    <td>{item.noteType ? t(noteTypeLabelKey(item.noteType) ?? "") : "-"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{d("amount")}</th>
                    <td className="font-weight-bold">
                      {formatN2(item.money.amount)} {item.money.currency}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{d("currency")}</th>
                    <td>{item.money.currency}</td>
                  </tr>
                  <tr>
                    <th scope="row">{d("status")}</th>
                    <td>
                      <span className={`badge ${billStatusBadgeClass(item.status)}`}>
                        {t(statusLabelKey("NOTE", item.direction, item.status))}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{d("collateral")}</th>
                    <td>
                      {item.collateral ? (
                        <span className="badge badge-warning">{t("bills.table.yes")}</span>
                      ) : (
                        t("bills.table.no")
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="col-md-6">
              <h6>
                <i className="fas fa-calendar-alt text-primary" aria-hidden="true" /> {d("dates")}
              </h6>
              <table className="table table-sm table-borderless">
                <tbody>
                  <tr>
                    <th scope="row" style={{ width: "40%" }}>
                      {d("issueDate")}
                    </th>
                    <td>{item.issueDate ? formatDate(item.issueDate) : "-"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{d("dueDate")}</th>
                    <td className="font-weight-bold">{formatDate(item.dueDate)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{d("remaining")}</th>
                    <td>{days === null ? "-" : d("remainingValue", { count: days })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <hr />
          <div className="row">
            <PartyBlock
              icon="fa-user"
              title={d("drawer")}
              party={parties.drawer}
              phone={phoneOf(parties.drawer)}
            />
            <PartyBlock
              icon="fa-user-tie"
              title={d("drawee")}
              party={parties.drawee}
              phone={phoneOf(parties.drawee)}
            />
            <PartyBlock
              icon="fa-user-check"
              title={d("payee")}
              party={parties.payee}
              phone={phoneOf(parties.payee)}
            />
          </div>
          {item.description && (
            <>
              <hr />
              <div className="alert alert-secondary">
                <strong>{d("description")}</strong>
                <br />
                {item.description}
              </div>
            </>
          )}
        </div>
      )}
    </ZtoModal>
  );
}

function PartyBlock({
  icon,
  title,
  party,
  phone,
}: {
  icon: string;
  title: string;
  party: BillParty;
  phone: string | null;
}) {
  const { t } = useTranslation("ztoFinans");
  const d = (key: string) => t(`bills.detail.${key}`);
  return (
    <div className="col-md-4">
      <h6>
        <i className={`fas ${icon} text-primary`} aria-hidden="true" /> {title}
      </h6>
      <table className="table table-sm table-borderless">
        <tbody>
          <tr>
            <th scope="row">{d("code")}</th>
            <td>{party.code ?? ""}</td>
          </tr>
          <tr>
            <th scope="row">{d("name")}</th>
            <td>
              <strong>{party.name ?? ""}</strong>
            </td>
          </tr>
          <tr>
            <th scope="row">{d("phone")}</th>
            <td>{phone || "-"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

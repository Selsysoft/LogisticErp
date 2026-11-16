import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettlement } from "../../../../pages/finance/settlementApi";
import type { SettlementDetail, SettlementType } from "../../../../pages/finance/types";
import type { InstrumentDetailFields } from "../settlementModals/settlementFormLogic";
import { ZtoModal, formatDate, formatDateTime, formatN2 } from "../../../components";
import { MethodBadge, useSettlementErrorText } from "./settlementCells";
import { amountText, rateText, sourceCell } from "./settlementListLogic";

type Props = {
  settlementId: string | null;
  type: SettlementType;
  onHide: () => void;
};

const TH_40 = { width: "40%" } as const;

/**
 * "Ödeme Detayı" / "Tahsilat Detayı" (ZTO pjs:3730-3946, cjs:6298-6596; 12.2a_TASARIM §5.11). Kaynak
 * `GET /settlements/{id}`. ZTO düzeni (iki `table.table-sm.table-bordered`, çek/senet, açıklama, sistem
 * bilgisi) korunur; Blackrose ekleri: İptal tarihi/gerekçesi, düzeltme zinciri ("Güncel kaydı aç"),
 * cari banka hesabı (maskeli IBAN), fatura eşleştirmeleri, ekstre eşleşmesi uyarısı.
 */
export function SettlementDetailModal({ settlementId, type, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const errorText = useSettlementErrorText();
  const [currentId, setCurrentId] = useState<string | null>(settlementId);
  useEffect(() => setCurrentId(settlementId), [settlementId]);
  const detail = useSettlement(currentId, { enabled: currentId !== null });
  const ns = type === "PAYMENT" ? "payments" : "collections";
  const d = (key: string) => t(`payments.list.detail.${key}`);

  return (
    <ZtoModal
      show={settlementId !== null}
      onHide={onHide}
      size="xl"
      rootId={type === "PAYMENT" ? "paymentDetailModal" : "collectionDetailModal"}
      headerClassName="bg-primary text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-info-circle" aria-hidden="true" /> {t(`${ns}.detail.title`)}
        </>
      }
      footer={
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          <i className="fas fa-times" aria-hidden="true" /> {d("close")}
        </button>
      }
    >
      {detail.isPending && currentId !== null ? (
        <div className="text-center text-muted py-3" role="status">
          <i className="fas fa-spinner fa-spin mr-2" aria-hidden="true" />
          {d("loading")}
        </div>
      ) : detail.isError ? (
        <div className="alert alert-danger" role="alert">
          {errorText(detail.error, t(`${ns}.detail.notFound`), type)}
        </div>
      ) : detail.data ? (
        <DetailBody data={detail.data} type={type} onOpen={setCurrentId} />
      ) : null}
    </ZtoModal>
  );
}

function DetailBody({
  data,
  type,
  onOpen,
}: {
  data: SettlementDetail;
  type: SettlementType;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const d = (key: string) => t(`payments.list.detail.${key}`);
  const ns = type === "PAYMENT" ? "payments" : "collections";
  const item = data.item;
  const source = sourceCell(item);
  // 12.3 (§3.8): detay yanıtının çeki `InstrumentListItem` üst kümesidir; ek alanlar isteğe bağlı okunur.
  const instrument = data.instrument as InstrumentDetailFields | null;
  const isNote = (instrument?.kind ?? item.instrumentKind) === "NOTE";
  const masked = tc("common.a11y.maskedEmployee");
  return (
    <>
      <div className="row">
        <div className="col-md-6">
          <h6 className="text-muted">
            <i className="fas fa-file-invoice" aria-hidden="true" /> {d("basic")}
          </h6>
          <table className="table table-sm table-bordered">
            <tbody>
              <tr>
                <th style={TH_40}>{d("date")}</th>
                <td>
                  <strong>{formatDate(item.settlementDate) || "-"}</strong>
                </td>
              </tr>
              <tr>
                <th>{d("account")}</th>
                <td>
                  {item.employeeMasked ? (
                    masked
                  ) : (
                    <>
                      <strong>{item.accountCode ?? ""}</strong> - {item.accountName ?? ""}
                      <br />
                      <small className="text-muted">{item.accountGroupName ?? ""}</small>
                    </>
                  )}
                </td>
              </tr>
              <tr>
                <th>{d("documentNo")}</th>
                <td>{item.documentNo || "-"}</td>
              </tr>
              <tr>
                <th>{d("amount")}</th>
                <td>
                  <span className="badge badge-success" style={{ fontSize: 14 }}>
                    {amountText(item.money)}
                  </span>
                  {item.money.currency !== "TRY" && (
                    <>
                      <br />
                      <small className="text-muted">
                        {t("payments.list.detail.rate", {
                          rate: rateText(item.exchangeRate),
                          tl: formatN2(item.tlAmount),
                        })}
                      </small>
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="col-md-6">
          <h6 className="text-muted">
            <i className="fas fa-credit-card" aria-hidden="true" /> {t(`${ns}.detail.info`)}
          </h6>
          <table className="table table-sm table-bordered">
            <tbody>
              <tr>
                <th style={TH_40}>{d("method")}</th>
                <td>
                  <MethodBadge row={item} />
                </td>
              </tr>
              <tr>
                <th>{d("status")}</th>
                <td>
                  {item.status === "POSTED" ? (
                    <span className="badge badge-success">{d("posted")}</span>
                  ) : (
                    <span className="badge badge-danger">{d("reversed")}</span>
                  )}
                  {item.correctedById && (
                    <>
                      {" "}
                      <span className="badge badge-info">{d("corrected")}</span>{" "}
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 align-baseline"
                        onClick={() => onOpen(item.correctedById as string)}
                      >
                        {d("openCurrent")}
                      </button>
                    </>
                  )}
                </td>
              </tr>
              {item.status === "REVERSED" && (
                <>
                  <tr>
                    <th>{d("reversedOn")}</th>
                    <td>{formatDate(item.reversedOn) || "-"}</td>
                  </tr>
                  <tr>
                    <th>{d("reverseReason")}</th>
                    <td style={{ whiteSpace: "pre-wrap" }}>{item.reverseReason || "-"}</td>
                  </tr>
                </>
              )}
              <tr>
                <th>{d("source")}</th>
                <td>
                  {source === null ? (
                    "-"
                  ) : source.kind === "CASH" ? (
                    <span className="badge badge-success">{source.text}</span>
                  ) : (
                    <>
                      <span className="badge badge-primary">
                        {item.fundBankName?.trim() || item.fundName || ""}
                      </span>
                      {item.fundBankName && item.fundBankBranchName
                        ? ` - ${item.fundBankBranchName}`
                        : ""}
                      {data.fundIbanMasked && (
                        <>
                          <br />
                          <small className="text-muted">
                            <i className="fas fa-credit-card" aria-hidden="true" />{" "}
                            {data.fundIbanMasked}
                          </small>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
              {item.branchName && (
                <tr>
                  <th>{d("workPlace")}</th>
                  <td>
                    <span className="badge badge-info">{item.branchName}</span>
                  </td>
                </tr>
              )}
              {(item.counterpartyBankName || item.counterpartyIbanMasked) && (
                <tr>
                  <th>{d("counterparty")}</th>
                  <td>
                    {item.counterpartyBankName ?? ""}
                    {item.counterpartyIbanMasked && (
                      <>
                        <br />
                        <small className="text-muted">{item.counterpartyIbanMasked}</small>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {instrument && (
        <>
          <hr className="my-3" />
          <div className="row">
            <div className="col-md-6 mt-3">
              <h6 className="text-muted">
                <i
                  className={`fas ${isNote ? "fa-file-invoice-dollar" : "fa-money-check"}`}
                  aria-hidden="true"
                />{" "}
                {d(isNote ? "noteInfo" : "checkInfo")}
              </h6>
              <table className="table table-sm table-bordered">
                <tbody>
                  <tr>
                    <th>{d(isNote ? "noteNo" : "checkNo")}</th>
                    <td>{instrument.number}</td>
                  </tr>
                  <tr>
                    <th>{d("bank")}</th>
                    <td>{instrument.bankName || "-"}</td>
                  </tr>
                  <tr>
                    <th>{d("bankBranch")}</th>
                    <td>{instrument.bankBranch || "-"}</td>
                  </tr>
                  {instrument.checkBookSerial && (
                    <tr>
                      <th>{d("checkBook")}</th>
                      <td>
                        {t("payments.list.detail.checkBookValue", {
                          serial: instrument.checkBookSerial,
                          leaf: instrument.leafNo ?? "-",
                        })}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <th>{d(isNote ? "noteIssue" : "issueDate")}</th>
                    <td>{formatDate(instrument.issueDate ?? null) || "-"}</td>
                  </tr>
                  <tr>
                    <th>{d(isNote ? "noteDue" : "dueDate")}</th>
                    <td>{formatDate(instrument.dueDate) || "-"}</td>
                  </tr>
                  <tr>
                    <th>{d("instrumentStatus")}</th>
                    <td>
                      {tc(`finance.instrumentStatus.${instrument.status}`, {
                        defaultValue: instrument.status,
                      })}
                    </td>
                  </tr>
                  {instrument.description && (
                    <tr>
                      <th>{d("instrumentDescription")}</th>
                      <td style={{ whiteSpace: "pre-wrap" }}>{instrument.description}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {data.allocations.length > 0 && (
        <>
          <hr className="my-3" />
          <div className="row">
            <div className="col-12">
              <h6 className="text-muted">
                <i className="fas fa-cart-arrow-down" aria-hidden="true" /> {d("allocations")}
              </h6>
              <div className="table-responsive">
                <table className="table table-sm table-bordered" style={{ fontSize: 12 }}>
                  <thead className="thead-light">
                    <tr>
                      <th>{d("invoiceNo")}</th>
                      <th>{d("invoiceType")}</th>
                      <th className="text-right">{d("allocationAmount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.allocations.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.outOfScope ? (
                            <small className="text-muted">{d("outOfScope")}</small>
                          ) : (
                            (a.targetNumber ?? "-")
                          )}
                          {a.targetCancelled && (
                            <span className="badge badge-light ml-1">{d("targetCancelled")}</span>
                          )}
                        </td>
                        <td>{a.targetTypeName ?? "-"}</td>
                        <td className="text-right">{amountText(a.money)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {item.description && (
        <>
          <hr className="my-3" />
          <div className="row">
            <div className="col-12">
              <h6 className="text-muted">
                <i className="fas fa-align-left" aria-hidden="true" /> {d("description")}
              </h6>
              <div className="alert alert-light border" style={{ whiteSpace: "pre-wrap" }}>
                {item.description}
              </div>
            </div>
          </div>
        </>
      )}

      <hr className="my-3" />
      <div className="row">
        <div className="col-12">
          <small className="text-muted">
            <i className="fas fa-user" aria-hidden="true" /> <strong>{d("createdBy")}</strong>{" "}
            {item.createdBy || "-"} | <i className="fas fa-clock" aria-hidden="true" />{" "}
            <strong>{d("createdAt")}</strong> {formatDateTime(item.createdAt) || "-"}
          </small>
          {data.bankStatementMatched && (
            <div>
              <small className="text-warning">{d("bankStatementMatched")}</small>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  useDeleteFund,
  useFundCanDelete,
  useSetFundActive,
} from "../../../../pages/finance/fundApi";
import type { Fund } from "../../../../pages/finance/types";
import { ZtoModal } from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import { deleteBlockedReason } from "./fundsLogic";

export type FundDeleteModalProps = {
  fund: Pick<Fund, "id" | "name" | "kind" | "active"> | null;
  onHide: () => void;
  /** Silme başarılı. */
  onDeleted: () => void;
  /** Pasifleştirme başarılı (Blackrose eki). */
  onDeactivated: () => void;
  /** İşlem hatası (sayfa uyarısı). */
  onError: (message: string) => void;
};

/**
 * BI-1 / CI-2 silme modalı (ZTO BankIntroduction/Index.cshtml:1208-1239 + confirmDelete :2484-2520;
 * CashIntroduction/Index.cshtml aynı, metinler "Kasa Silme", "kasası silinebilir.", "Bu kasa
 * silinemez!"). Açılışta `can-delete` sorulur; engelliyken ZTO cümlesi + Blackrose eki "Pasifleştir".
 * MWG `accessibility` §12 / `dialog`: ilk odak güvenli "İptal" düğmesinde; sonuç gövdede
 * `role="status"`; kapanınca odak açan öğeye döner (react-bootstrap restoreFocus).
 */
export function FundDeleteModal({
  fund,
  onHide,
  onDeleted,
  onDeactivated,
  onError,
}: FundDeleteModalProps) {
  const { t } = useTranslation("ztoFinans");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const show = fund !== null;
  const cash = fund?.kind === "CASH";
  const check = useFundCanDelete(fund?.id, { enabled: show });
  const remove = useDeleteFund({
    onSuccess: onDeleted,
    onError: (error) =>
      onError(t("funds.deleteModal.failed", { message: errorMessage(error, "") })),
  });
  const deactivate = useSetFundActive({
    onSuccess: onDeactivated,
    onError: (error) =>
      onError(t("funds.deleteModal.failed", { message: errorMessage(error, "") })),
  });
  const d = (key: string) => t(`funds.deleteModal.${key}`);
  const allowed = check.data?.allowed === true;
  const blocked = check.data !== undefined && !allowed;
  const reason = check.data
    ? deleteBlockedReason(check.data.reasons, {
        intro: d(cash ? "introCash" : "introBank"),
        outro: d("outro"),
        companyDefault: d("companyDefault"),
        item: (kind, count) => {
          const key =
            kind === "FUND_TRANSACTION" ? `FUND_TRANSACTION_${cash ? "CASH" : "BANK"}` : kind;
          return t(`funds.deleteModal.reasons.${key}`, {
            count,
            kind,
            defaultValue: t("funds.deleteModal.reasons.other", { count, kind }),
          });
        },
      })
    : "";
  const busy = remove.isPending || deactivate.isPending;

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      id="deleteModal"
      headerClassName="bg-danger text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-trash-alt" aria-hidden="true" />{" "}
          {d(cash ? "titleCash" : "titleBank")}
        </>
      }
      onEntered={() => cancelRef.current?.focus()}
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary"
            data-dismiss="modal"
            onClick={onHide}
          >
            {d("cancel")}
          </button>
          {blocked && fund?.active && (
            <button
              type="button"
              className="btn btn-warning"
              disabled={busy}
              onClick={() => fund && deactivate.mutate({ id: fund.id, active: false })}
            >
              <i className="fas fa-ban" aria-hidden="true" /> {d("deactivate")}
            </button>
          )}
          {allowed && (
            <button
              type="button"
              id="deleteConfirmBtn"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => fund && remove.mutate(fund.id)}
            >
              <i className="fas fa-trash-alt" aria-hidden="true" /> {d("confirm")}
            </button>
          )}
        </>
      }
    >
      <div role="status">
        {check.isPending && (
          <div id="deleteCheckLoading" className="text-center py-3">
            <i className="fas fa-spinner fa-spin fa-2x" aria-hidden="true" />
            <p className="mt-2">{d("checking")}</p>
          </div>
        )}
        {!check.isPending && (
          <div id="deleteCheckResult">
            {allowed && (
              <div id="deleteAllowed">
                <p>
                  <i className="fas fa-check-circle text-success" aria-hidden="true" />{" "}
                  <span id={cash ? "deleteCashName" : "deleteAccountName"}>{fund?.name}</span>{" "}
                  {d(cash ? "allowedCash" : "allowedBank")}
                </p>
                <p className="text-muted">{d("irreversible")}</p>
              </div>
            )}
            {(blocked || check.isError) && (
              <div id="deleteNotAllowed">
                <p>
                  <i className="fas fa-exclamation-triangle text-danger" aria-hidden="true" />{" "}
                  {d(cash ? "blockedCash" : "blockedBank")}
                </p>
                <p className="text-muted" id="deleteNotAllowedReason">
                  {check.isError ? d("checkFailed") : reason}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </ZtoModal>
  );
}

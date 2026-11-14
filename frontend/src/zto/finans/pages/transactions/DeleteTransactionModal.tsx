import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useFinanceMutation, voidTransaction } from "../../../../pages/finance/accountApi";
import type { AccountTransactionRow } from "../../../../pages/finance/types";
import { ZtoModal, useZtoSnackbar } from "../../../components";
import { apiErrorOf, sourceRouteOf } from "./transactionsLogic";

export type DeleteTransactionModalProps = {
  row: AccountTransactionRow | null;
  /** Satırın tür etiketi ("Borç", "Alış Faturası" …). */
  typeLabel: string;
  onHide: () => void;
};

/**
 * Silme Onayı (ZTO Transactions.cshtml:3417-3455 deleteTransactionConfirmModal). Blackrose'ta silme ters
 * kayıttır: "Evet, Sil" → `POST /accounts/transactions/{id}/void` (tarih yok → sunucu bugünü kullanır).
 * 409 TRANSACTION_SOURCE_MANAGED → ileti modal içinde + varsa "Kaynağa Git". İlk odak "İptal" (MWG dialog).
 */
export function DeleteTransactionModal({ row, typeLabel, onHide }: DeleteTransactionModalProps) {
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const navigate = useNavigate();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<{ message: string; route: string | null } | null>(null);
  const show = row !== null;

  useEffect(() => {
    if (show) setError(null);
  }, [show]);

  const mutation = useFinanceMutation((id: string) => voidTransaction(id), {
    onSuccess: () => {
      snackbar.show(t("transactions.remove.done", { type: typeLabel }), "success");
      onHide();
    },
    onError: (e) => {
      const api = apiErrorOf(e);
      const route = sourceRouteOf(api?.details ?? []);
      setError({ message: api?.message || t("transactions.document.networkError"), route });
    },
  });

  return (
    <ZtoModal
      show={show}
      onHide={mutation.isPending ? () => undefined : onHide}
      rootId="deleteTransactionConfirmModal"
      centered
      headerClassName="bg-danger text-white"
      closeButtonClassName="text-white"
      closeDisabled={mutation.isPending}
      onEntered={() => cancelRef.current?.focus()}
      title={
        <>
          <i className="fas fa-exclamation-triangle mr-2" aria-hidden="true" />
          {t("transactions.remove.title")}
        </>
      }
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            ref={cancelRef}
            onClick={onHide}
            disabled={mutation.isPending}
          >
            <i className="fas fa-times mr-1" aria-hidden="true" />
            {t("transactions.remove.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            id="confirmDeleteTransactionBtn"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
            onClick={() => row && mutation.mutate(row.id)}
          >
            <i
              className={
                mutation.isPending ? "fas fa-spinner fa-spin mr-1" : "fas fa-trash-alt mr-1"
              }
              aria-hidden="true"
            />
            {mutation.isPending ? t("transactions.remove.busy") : t("transactions.remove.confirm")}
          </button>
        </>
      }
    >
      <div className="text-center py-3">
        <i
          className="fas fa-trash-alt text-danger mb-3"
          style={{ fontSize: "3rem" }}
          aria-hidden="true"
        />
        <h5 className="mb-3">{t("transactions.remove.question")}</h5>
        <p className="text-muted mb-2">
          <Trans
            t={t}
            i18nKey="transactions.remove.body"
            values={{ type: typeLabel }}
            components={{ b: <strong id="deleteTransactionType" /> }}
          />
        </p>
        <div className="alert alert-warning mt-3">
          <i className="fas fa-info-circle mr-2" aria-hidden="true" />
          {t("transactions.remove.warning")}
        </div>
        {error && (
          <div className="alert alert-danger mt-2 mb-0" role="alert">
            {error.message}
            {error.route && (
              <>
                {" "}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger ml-2"
                  onClick={() => {
                    onHide();
                    navigate(error.route!);
                  }}
                >
                  {t("transactions.remove.goSource")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </ZtoModal>
  );
}

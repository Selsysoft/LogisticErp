import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setLimits, useFinanceMutation } from "../../../../pages/finance/accountApi";
import type { Account } from "../../../../pages/finance/types";
import { ZtoModal, currencySymbol, useZtoSnackbar } from "../../../components";
import { effectiveLimits, apiErrorOf } from "./transactionsLogic";

export type EditLimitsModalProps = {
  show: boolean;
  onHide: () => void;
  account: Account;
  /** Aktif şirket (≥2 aktif şirkette seçiliyse şirket limiti düzenlenir); null konsolide. */
  companyId: string | null;
  companyName: string | null;
  currency: string;
};

/**
 * Kredi & Risk Limiti Düzenle (ZTO Transactions.cshtml:3456-3492 editLimitsModal; etiketler 04 §7 #5
 * düzeltmesiyle "Kredi Limiti"/"Risk Limiti"). Kaydet → `PUT /accounts/{id}/limits`.
 */
export function EditLimitsModal({
  show,
  onHide,
  account,
  companyId,
  companyName,
  currency,
}: EditLimitsModalProps) {
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const [credit, setCredit] = useState("");
  const [risk, setRisk] = useState("");
  const [error, setError] = useState<string | null>(null);
  const symbol = currencySymbol(currency);

  useEffect(() => {
    if (!show) return;
    const limits = effectiveLimits(account, companyId);
    setCredit(String(limits.credit));
    setRisk(String(limits.risk));
    setError(null);
  }, [show, account, companyId]);

  const mutation = useFinanceMutation(
    () =>
      setLimits(account.id, {
        companyId: companyId ?? null,
        creditLimit: credit.trim() === "" ? null : Number(credit),
        riskLimit: risk.trim() === "" ? null : Number(risk),
      }),
    {
      onSuccess: () => {
        snackbar.show(t("transactions.limits.saved"), "success");
        onHide();
      },
      onError: (e) => {
        const api = apiErrorOf(e);
        setError(
          api
            ? t("transactions.limits.error", { message: api.message })
            : t("transactions.limits.serverError"),
        );
      },
    },
  );

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      rootId="editLimitsModal"
      centered
      titleAs="h6"
      headerClassName="bg-primary text-white py-2"
      closeButtonClassName="text-white"
      footerClassName="py-2"
      title={
        <>
          <i className="fas fa-shield-alt mr-1" aria-hidden="true" />{" "}
          {t("transactions.limits.title")}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onHide}>
            <i className="fas fa-times mr-1" aria-hidden="true" />
            {t("transactions.limits.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
            onClick={() => mutation.mutate(undefined)}
          >
            <i className="fas fa-save mr-1" aria-hidden="true" /> {t("transactions.limits.save")}
          </button>
        </>
      }
    >
      {companyId && companyName && (
        <p className="small text-muted mb-2">
          {t("transactions.limits.companyInfo", { company: companyName })}
        </p>
      )}
      {error && (
        <div className="alert alert-danger py-1 px-2 small" role="alert">
          {error}
        </div>
      )}
      <div className="mb-3">
        <label className="form-label small text-muted mb-1" htmlFor="editCreditLimitInput">
          <i className="fas fa-credit-card text-success mr-1" aria-hidden="true" />{" "}
          {t("transactions.limits.credit")} ({symbol})
        </label>
        <input
          type="number"
          id="editCreditLimitInput"
          className="form-control form-control-sm"
          min="0"
          step="0.01"
          placeholder="0"
          inputMode="decimal"
          autoFocus
          value={credit}
          onChange={(e) => setCredit(e.target.value)}
        />
      </div>
      <div className="mb-1">
        <label className="form-label small text-muted mb-1" htmlFor="editRiskLimitInput">
          <i className="fas fa-exclamation-triangle text-danger mr-1" aria-hidden="true" />{" "}
          {t("transactions.limits.risk")} ({symbol})
        </label>
        <input
          type="number"
          id="editRiskLimitInput"
          className="form-control form-control-sm"
          min="0"
          step="0.01"
          placeholder="0"
          inputMode="decimal"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
        />
      </div>
    </ZtoModal>
  );
}

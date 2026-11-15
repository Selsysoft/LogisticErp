import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiGet } from "../../../../api/client";
import { useActiveCompanyId } from "../../../../auth/companyStore";
import {
  balancesQuery,
  useAccountList,
  useIdempotencyKey,
} from "../../../../pages/finance/accountApi";
import { useCompanyName } from "../../../../pages/finance/common";
import { useFund, useSettlementCheck } from "../../../../pages/finance/fundApi";
import {
  useCorrectSettlement,
  useCreateSettlement,
  useSettlement,
} from "../../../../pages/finance/settlementApi";
import {
  allocationWarningText,
  isConfirmationRequired,
  parseConfirmationDetails,
  type Translate,
} from "../../../../pages/finance/settlementWarnings";
import type {
  Account,
  AccountBalanceBreakdown,
  Settlement,
  SettlementBody,
  SettlementType,
} from "../../../../pages/finance/types";
import { formatMoney, useZtoConfirm } from "../../../components";
import type { PaymentModalProps } from "./index";
import { useBranchCompany, useModalText, type Notice } from "./parts";
import { OFFER_DELAY_MS, shouldOffer } from "./postPlanningLogic";
import {
  apiErrorInfo,
  apiErrorReason,
  correctionBody,
  correctionOriginalOf,
  dropStaleRate,
  emptyForm,
  fieldElementId,
  formFromDetail,
  lockReasonErrorCode,
  modalIds,
  presetForm,
  previewBody,
  settlementBody,
  todayIso,
  validateCollection,
  validatePayment,
  type CorrectionOriginal,
  type SettlementFormValues,
  type ValidationError,
} from "./settlementFormLogic";

/*
 * Ödeme ve tahsilat modallarının ortak durumu (12.2a_TASARIM §5.7, §5.8): form değerleri, ekleme ön
 * değerleri, düzenleme önyüklemesi (kilitli kayıtta modal açılmaz), 12.2 uyarı önizlemesi, kayıt (ekle
 * `POST /payments|collections`, düzenle `POST /settlements/{id}/correct`), 409 CONFIRMATION_REQUIRED
 * "Uyarı" onayı (aynı Idempotency-Key ile `confirmWarnings: true`), modal içi hata ve kapanış sonrası
 * bildirim, ödeme ekleme sonrası plan modalı tetiği (§5.10).
 */

/** Kayıt isteği kullanıcı onayı reddettiği için durdu (hata değil). */
class Cancelled extends Error {}

export type ServerError = { title: string; message: string };

export type PlanOffer = {
  settlement: Settlement;
  account: Pick<Account, "id" | "code" | "name" | "type">;
};

export function useSettlementModal(type: SettlementType, props: PaymentModalProps) {
  const {
    show,
    onHide,
    mode,
    settlementId,
    presetAccountId,
    presetBranchId,
    presetFundAccountId,
    presetMethod,
    presetCurrency,
    onSaved,
  } = props;
  const edit = mode === "edit";
  const payment = type === "PAYMENT";
  const { tm, tr, errorMessage } = useModalText();
  const companyName = useCompanyName();
  const activeCompanyId = useActiveCompanyId();
  const ids = useMemo(() => modalIds(type, mode), [type, mode]);

  const [form, setForm] = useState<SettlementFormValues>(() => emptyForm(todayIso()));
  /** Düzeltilen kaydın tarih/para birimi/kur bağlamı (goc-defter:F1); eklemede null. */
  const [original, setOriginal] = useState<CorrectionOriginal | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [allocationExceeded, setAllocationExceeded] = useState(false);
  const [ready, setReady] = useState(false);
  const [offer, setOffer] = useState<PlanOffer | null>(null);
  const idempotencyKey = useIdempotencyKey(show);
  const { confirm, confirmModal } = useZtoConfirm();

  // Ön değer fonu (Banka/Kasa Hareketleri, derin bağlantı `bankId`/`cashId`).
  const presetFund = useFund(
    show && !edit && presetFundAccountId ? presetFundAccountId : undefined,
  );
  const detail = useSettlement(show && edit ? settlementId : null);
  const accounts = useAccountList({ active: true }, { enabled: show });

  // Açılış: ekleme kipinde ön değerler (fon verildiyse fon gelince), düzenlemede kayıt gelince.
  const opened = useRef(false);
  useEffect(() => {
    if (!show) {
      opened.current = false;
      setReady(false);
      return;
    }
    if (opened.current) return;
    if (edit) {
      if (detail.isError) {
        // 404 SETTLEMENT_NOT_FOUND (personel carisi dahil) ya da ağ hatası: ZTO iletisi.
        opened.current = true;
        setNotice({
          kind: "warning",
          message: tm(payment ? "payment.loadFailed" : "collection.loadFailed"),
        });
        onHide();
        return;
      }
      if (!detail.data) return;
      opened.current = true;
      const item = detail.data.item;
      if (!item.correctable) {
        // Kilitli kayıt (taşınmış, iptal, çek, plan, virman, bozum, araç gideri, carisiz): açılmaz.
        const code = lockReasonErrorCode(
          item.lockReason ?? (item.accountId ? null : "NO_ACCOUNT"),
          item.correctedById,
        );
        setNotice({
          kind: "warning",
          message: errorMessage(code, tm("shared.lockFallback"), { type }),
        });
        onHide();
        return;
      }
      setForm(formFromDetail(detail.data, todayIso()));
      setOriginal(correctionOriginalOf(item));
    } else {
      if (presetFundAccountId && presetFund.isPending) return;
      opened.current = true;
      setOriginal(null);
      setForm(
        presetForm(
          {
            accountId: presetAccountId,
            branchId: presetBranchId,
            fundAccountId: presetFundAccountId,
            method: presetMethod,
            currency: presetCurrency,
          },
          presetFund.data ?? null,
          todayIso(),
        ),
      );
    }
    setSubmitted(false);
    setServerError(null);
    setAllocationExceeded(false);
    setReady(true);
  }, [
    show,
    edit,
    payment,
    type,
    detail.data,
    detail.isError,
    detail.error,
    presetFund.data,
    presetFund.isPending,
    presetAccountId,
    presetBranchId,
    presetFundAccountId,
    presetMethod,
    presetCurrency,
    onHide,
    tm,
    errorMessage,
  ]);

  // Şirket (Rev 1 F5): düzenlemede kaydın şirketi; ön değer fonu/iş yeri varsa onun şirketi.
  const presetBranchCompany = useBranchCompany(presetBranchId);
  const branchCompany = useBranchCompany(form.branchId);
  const companyId: string | null | undefined = edit
    ? (detail.data?.item.companyId ?? undefined)
    : (presetFund.data?.companyId ?? presetBranchCompany ?? undefined);
  /** Panel ve ciro listesinin şirketi: seçilen iş yerinin şirketi, yoksa yukarıdaki. */
  const workingCompany = branchCompany ?? companyId ?? activeCompanyId ?? null;

  const selectedAccount = useMemo(
    () => (accounts.data ?? []).find((account) => account.id === form.accountId) ?? null,
    [accounts.data, form.accountId],
  );

  const errors: ValidationError[] = useMemo(
    () =>
      payment
        ? validatePayment(form, { allocationExceeded })
        : validateCollection(form, { allocationExceeded, edit, editId: settlementId ?? null }),
    [payment, form, allocationExceeded, edit, settlementId],
  );
  const shownErrors = submitted ? errors : [];

  const createMutation = useCreateSettlement(type);
  const correctMutation = useCorrectSettlement();
  const pending = createMutation.isPending || correctMutation.isPending;
  const saved = createMutation.isSuccess || correctMutation.isSuccess;
  const { reset: resetCreate } = createMutation;
  const { reset: resetCorrect } = correctMutation;
  useEffect(() => {
    if (!show) {
      resetCreate();
      resetCorrect();
    }
  }, [show, resetCreate, resetCorrect]);

  // Önizleme kayıt sürerken ve kayıttan sonra kapalıdır: kayıt `["finance"]`'ı geçersiz kılar; açık
  // kalan düzeltme önizlemesi artık iptal edilmiş kaydı sorup 422 alırdı (son kapı e2e bulgusu).
  // `enabled` ayrıca verilir; gövde gecikmeli (debounce) olduğu için yalnız gövdeyi boşaltmak yetmez.
  const previewOn = show && ready && !pending && !saved;
  const preview = useSettlementCheck(type, previewOn ? previewBody(type, form) : null, {
    enabled: previewOn,
    correctsSettlementId: edit ? settlementId : undefined,
  });

  const translate: Translate = useCallback((key, values) => tr(key, values), [tr]);
  const money = useCallback(
    (amount: number, currency: string) => formatMoney(amount, currency),
    [],
  );

  const post = useCallback(
    (body: SettlementBody) =>
      edit
        ? correctMutation.mutateAsync({
            id: settlementId as string,
            body: { reason: form.reason.trim() || undefined, replacement: body },
            idempotencyKey,
          })
        : createMutation.mutateAsync({ body, idempotencyKey }),
    [edit, correctMutation, createMutation, settlementId, form.reason, idempotencyKey],
  );

  /** Ödeme ekleme sonrası: ödeyen şirkette ödeme para biriminde kalan borç varsa plan modalı. */
  const offerPlanning = useCallback(
    async (saved: Settlement) => {
      if (!payment || edit || !saved.accountId || !selectedAccount) return;
      try {
        const breakdown = await apiGet<AccountBalanceBreakdown>(
          balancesQuery(saved.accountId, { groupBy: "COMPANY", companyId: saved.companyId }),
        );
        if (
          shouldOffer({
            type,
            mode,
            accountType: selectedAccount.type,
            rows: breakdown.rows,
            companyId: saved.companyId,
            currency: saved.money.currency,
          })
        ) {
          const account = {
            id: selectedAccount.id,
            code: selectedAccount.code,
            name: selectedAccount.name,
            type: selectedAccount.type,
          };
          setTimeout(() => setOffer({ settlement: saved, account }), OFFER_DELAY_MS);
        }
      } catch {
        // Plan önerisi isteğe bağlıdır; bakiye okunamazsa modal açılmaz.
      }
    },
    [payment, edit, selectedAccount, type, mode],
  );

  const focusFirstError = useCallback(
    (list: readonly ValidationError[]) => {
      for (const error of list) {
        const id = fieldElementId(ids, error.field, form);
        const element = id ? document.getElementById(id) : null;
        if (element) {
          element.focus();
          return;
        }
      }
    },
    [ids, form],
  );

  const save = useCallback(async () => {
    if (pending) return;
    setSubmitted(true);
    setServerError(null);
    if (errors.length > 0) {
      focusFirstError(errors);
      return;
    }
    const body =
      edit && original ? correctionBody(type, form, original) : settlementBody(type, form);
    let saved: Settlement;
    try {
      try {
        saved = await post(body);
      } catch (error) {
        if (!isConfirmationRequired(error)) throw error;
        const warning = parseConfirmationDetails(error);
        const ok = await confirm({
          variant: "warning",
          initialFocus: "cancel",
          cancelText: tm("shared.giveUp"),
          confirmText: tm("shared.ok"),
          message: (
            <>
              <span className="d-block text-danger mb-2" role="note">
                {warning
                  ? allocationWarningText(warning, companyName, money, translate)
                  : errorMessage("CONFIRMATION_REQUIRED", apiErrorInfo(error).message)}
              </span>
              {tr("finance.warning.confirmQuestion")}
            </>
          ),
        });
        if (!ok) throw new Cancelled();
        saved = await post({ ...body, confirmWarnings: true });
      }
    } catch (error) {
      if (error instanceof Cancelled) return;
      const { code, message } = apiErrorInfo(error);
      setServerError({
        title: tm(payment ? "payment.errorTitle" : "collection.errorTitle"),
        message: errorMessage(code, message, { type, reason: apiErrorReason(error) }),
      });
      return;
    }
    onHide();
    setNotice({
      kind: "success",
      message: tm(`${payment ? "payment" : "collection"}.${edit ? "updated" : "saved"}`),
    });
    onSaved?.(saved);
    void offerPlanning(saved);
  }, [
    pending,
    errors,
    focusFirstError,
    type,
    form,
    original,
    post,
    confirm,
    tm,
    companyName,
    money,
    translate,
    errorMessage,
    tr,
    payment,
    edit,
    onHide,
    onSaved,
    offerPlanning,
  ]);

  /**
   * Tahsilat düzenlemesinde tarih/para birimi/fon değişikliği sonrası: önyüklenen eski kur, kayıt
   * tarihinden ya da para biriminden ayrılınca temizlenir (goc-defter:F1). Diğer durumlarda aynen.
   */
  const reconcileRate = useCallback(
    (next: SettlementFormValues) =>
      edit && !payment && original ? dropStaleRate(next, original) : next,
    [edit, payment, original],
  );

  const formRef = useRef<HTMLFormElement>(null);
  /** ZTO `btn-save` (type=button) → formun gönderimi; gönderim olayı kaydı çalıştırır. */
  const requestSave = useCallback(() => {
    const element = formRef.current;
    if (element && typeof element.requestSubmit === "function") element.requestSubmit();
    else void save();
  }, [save]);
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void save();
    },
    [save],
  );

  return {
    ids,
    edit,
    form,
    setForm,
    ready,
    errors: shownErrors,
    serverError,
    notice,
    clearNotice: () => setNotice(null),
    preview: preview.data,
    pending,
    companyId,
    workingCompany,
    selectedAccount,
    original,
    reconcileRate,
    detail: detail.data,
    presetFund: presetFund.data ?? null,
    setAllocationExceeded,
    formRef,
    onSubmit,
    requestSave,
    confirmModal,
    offer,
    clearOffer: () => setOffer(null),
  };
}

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ZtoModal } from "./ZtoModal";

export type ZtoConfirmVariant = "danger" | "primary" | "warning";

export type ZtoConfirmModalProps = {
  show: boolean;
  /** Varsayılan: danger "Silme Onayı", warning "Uyarı", primary "Onay". */
  title?: ReactNode;
  /** Gövdedeki soru; varsayılan "Bu kaydı silmek istediğinize emin misiniz?". */
  message?: ReactNode;
  /** Sorunun altındaki gri küçük not; danger'da varsayılan "Bu işlem geri alınamaz.", null gizler. */
  note?: ReactNode;
  /** Varsayılan: danger "Sil", diğerleri "Onayla". */
  confirmText?: ReactNode;
  /** Varsayılan "İptal". */
  cancelText?: ReactNode;
  /** Onay beklerken düğme metni; varsayılan danger "Siliniyor...", diğerleri "İşleniyor...". */
  busyText?: ReactNode;
  variant?: ZtoConfirmVariant;
  centered?: boolean;
  /**
   * Promise dönerse beklenir: düğmeler kilitlenir, onay düğmesinde spinner döner, modal kapanamaz.
   * Kapatmak çağıranın işidir (show=false). Hata durumunda kilit açılır ve onError çağrılır.
   */
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
  onError?: (error: unknown) => void;
  id?: string;
  animation?: boolean;
  /**
   * Açılışta odaklanan düğme (MWG `dialog`: yıkıcı onayda güvenli eylem). Varsayılan: danger'da
   * "cancel", diğerlerinde react-bootstrap davranışı (modalın kendisi). Kapanınca odak açan öğeye döner.
   */
  initialFocus?: "cancel" | "confirm";
};

const HEADER_CLASS: Record<ZtoConfirmVariant, string> = {
  danger: "bg-danger text-white",
  warning: "bg-warning text-dark",
  primary: "bg-primary text-white",
};

const TITLE_ICON: Record<ZtoConfirmVariant, string> = {
  danger: "fas fa-exclamation-triangle",
  warning: "fas fa-exclamation-triangle",
  primary: "fas fa-question-circle",
};

const CONFIRM_ICON: Record<ZtoConfirmVariant, string> = {
  danger: "fas fa-trash",
  warning: "fas fa-check",
  primary: "fas fa-check",
};

/**
 * ZTO silme onay modalı (Views/AccountCredits/Index.cshtml #deleteModal,
 * Views/ProductionExpenses/ExpenseGroupDetails.cshtml #deleteConfirmationModal): renkli başlık +
 * uyarı ikonu, gövdede soru ve gri not, altta btn-secondary "İptal" ve btn-danger "Sil".
 */
export function ZtoConfirmModal({
  show,
  title,
  message,
  note,
  confirmText,
  cancelText,
  busyText,
  variant = "danger",
  centered,
  onConfirm,
  onCancel,
  onError,
  id,
  animation,
  initialFocus,
}: ZtoConfirmModalProps) {
  const { t } = useTranslation("ztoFinans");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const focusTarget = initialFocus ?? (variant === "danger" ? "cancel" : undefined);

  // react-bootstrap açılışta modalı odaklar ve açan öğeyi geri dönüş için kaydeder (alt bileşenin
  // etkisi önce çalışır); ardından odak güvenli düğmeye taşınır.
  useEffect(() => {
    if (!show || !focusTarget) return;
    (focusTarget === "cancel" ? cancelRef : confirmRef).current?.focus();
  }, [show, focusTarget]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Modal yeniden açıldığında önceki beklemeden kalan kilit taşınmaz.
  useEffect(() => {
    if (!show) {
      setBusy(false);
    }
  }, [show]);

  const danger = variant === "danger";
  const resolvedTitle =
    title ??
    (danger
      ? t("modal.deleteTitle")
      : variant === "warning"
        ? t("modal.warningTitle")
        : t("modal.confirm"));
  const resolvedNote = note === undefined ? (danger ? t("modal.irreversibleNote") : null) : note;
  const resolvedConfirm = confirmText ?? (danger ? t("common.delete") : t("modal.approve"));
  const resolvedBusy = busyText ?? (danger ? t("modal.deleting") : t("modal.processing"));

  const handleConfirm = async () => {
    if (busy) {
      return;
    }
    let result: void | Promise<unknown>;
    try {
      result = onConfirm();
    } catch (error) {
      onError?.(error);
      return;
    }
    if (!result || typeof (result as Promise<unknown>).then !== "function") {
      return;
    }
    setBusy(true);
    try {
      await result;
    } catch (error) {
      onError?.(error);
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const handleCancel = () => {
    if (!busy) {
      onCancel();
    }
  };

  return (
    <ZtoModal
      show={show}
      onHide={handleCancel}
      id={id}
      animation={animation}
      centered={centered}
      backdrop={busy ? "static" : true}
      keyboard={!busy}
      headerClassName={HEADER_CLASS[variant]}
      closeButtonClassName={variant === "warning" ? undefined : "text-white"}
      closeDisabled={busy}
      title={
        <>
          <i className={TITLE_ICON[variant]} /> {resolvedTitle}
        </>
      }
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={busy}
          >
            <i className="fas fa-times" /> {cancelText ?? t("modal.cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn btn-${variant}`}
            onClick={handleConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? (
              <>
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                />{" "}
                {resolvedBusy}
              </>
            ) : (
              <>
                <i className={CONFIRM_ICON[variant]} /> {resolvedConfirm}
              </>
            )}
          </button>
        </>
      }
    >
      <p>{message ?? t("modal.deleteQuestion")}</p>
      {resolvedNote !== null && resolvedNote !== false && (
        <p className="text-muted">
          <small>{resolvedNote}</small>
        </p>
      )}
    </ZtoModal>
  );
}

export type ZtoConfirmOptions = Omit<
  ZtoConfirmModalProps,
  "show" | "onConfirm" | "onCancel" | "onError"
>;

type PendingConfirm = {
  options: ZtoConfirmOptions;
  resolve: (confirmed: boolean) => void;
};

/**
 * Tarayıcının confirm()'i yerine: `if (await confirm({ message })) { … }`. Dönen confirmModal
 * öğesi bileşenin JSX'ine (ZTO kökü içinde) konmalıdır. Yeni çağrı bekleyeni false ile kapatır;
 * bileşen kaldırılınca bekleyen çağrı false döner.
 */
export function useZtoConfirm(): {
  confirm: (options?: ZtoConfirmOptions) => Promise<boolean>;
  confirmModal: ReactNode;
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [show, setShow] = useState(false);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setShow(false);
    current?.resolve(confirmed);
  }, []);

  const confirm = useCallback((options: ZtoConfirmOptions = {}) => {
    pendingRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
      setShow(true);
    });
  }, []);

  useEffect(
    () => () => {
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    },
    [],
  );

  const confirmModal = pending ? (
    <ZtoConfirmModal
      {...pending.options}
      show={show}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmModal };
}

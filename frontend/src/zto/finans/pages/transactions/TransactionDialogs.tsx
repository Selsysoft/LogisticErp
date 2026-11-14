import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ZtoModal } from "../../../components";

export type AlertKind = "error" | "warning" | "success" | "info";

const ALERT_ICON: Record<AlertKind, string> = {
  error: "fas fa-times-circle text-danger",
  warning: "fas fa-exclamation-triangle text-warning",
  success: "fas fa-check-circle text-success",
  info: "fas fa-info-circle text-primary",
};

type AlertState = { message: string; kind: AlertKind } | null;
type ConfirmState = {
  message: string;
  title?: string;
  confirmText?: string;
  confirmClass?: string;
  resolve: (ok: boolean) => void;
} | null;

/**
 * ZTO `cdNotify` / `cdConfirm` (Transactions.cshtml:4179-4214 cdAlertModal, cdConfirmModal) — js
 * alert()/confirm() yerine modal görünümlü uyarı ve onay (§5.0 #2). Cari Taşıma'nın alert()'leri de bunu
 * kullanır. Onayda ilk odak "Vazgeç" (MWG `dialog`, güvenli eylem).
 */
export function useCdDialogs(): {
  notify: (message: string, kind?: AlertKind) => void;
  confirm: (
    message: string,
    options?: { title?: string; confirmText?: string; confirmClass?: string },
  ) => Promise<boolean>;
  dialogs: ReactNode;
} {
  const { t } = useTranslation("ztoFinans");
  const [alert, setAlert] = useState<AlertState>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const notify = useCallback(
    (message: string, kind: AlertKind = "info") => setAlert({ message, kind }),
    [],
  );
  const confirm = useCallback(
    (
      message: string,
      options: { title?: string; confirmText?: string; confirmClass?: string } = {},
    ) => new Promise<boolean>((resolve) => setConfirmState({ message, ...options, resolve })),
    [],
  );
  const settle = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  const dialogs = (
    <>
      <ZtoModal
        show={confirmState !== null}
        onHide={() => settle(false)}
        rootId="cdConfirmModal"
        className="cd-stack-modal"
        centered
        titleAs="h6"
        headerClassName="py-2 cd-confirm-header"
        footerClassName="py-2"
        onEntered={() => cancelRef.current?.focus()}
        title={
          <span style={{ fontSize: 14, color: "#3730a3" }}>
            <i className="fas fa-question-circle mr-1" aria-hidden="true" />
            {confirmState?.title ?? t("transactions.rollover.confirmTitle")}
          </span>
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              ref={cancelRef}
              onClick={() => settle(false)}
            >
              {t("transactions.rollover.giveUp")}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${confirmState?.confirmClass ?? "btn-primary"}`}
              onClick={() => settle(true)}
            >
              {confirmState?.confirmText ?? t("transactions.rollover.yes")}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13, whiteSpace: "pre-line", margin: 0, color: "#374151" }}>
          {confirmState?.message}
        </p>
      </ZtoModal>
      <ZtoModal
        show={alert !== null}
        onHide={() => setAlert(null)}
        rootId="cdAlertModal"
        className="cd-stack-modal"
        centered
        titleAs="h6"
        headerClassName="py-2"
        footerClassName="py-2"
        onEntered={() => okRef.current?.focus()}
        title={
          <span style={{ fontSize: 14 }}>
            <i className={`${ALERT_ICON[alert?.kind ?? "info"]} mr-1`} aria-hidden="true" />
            {t(`transactions.rollover.alert.${alert?.kind ?? "info"}`)}
          </span>
        }
        footer={
          <button
            type="button"
            className="btn btn-sm btn-primary"
            ref={okRef}
            onClick={() => setAlert(null)}
          >
            {t("transactions.rollover.ok")}
          </button>
        }
      >
        <p
          role="alert"
          style={{ fontSize: 13, whiteSpace: "pre-line", margin: 0, color: "#374151" }}
        >
          {alert?.message}
        </p>
      </ZtoModal>
    </>
  );
  return { notify, confirm, dialogs };
}

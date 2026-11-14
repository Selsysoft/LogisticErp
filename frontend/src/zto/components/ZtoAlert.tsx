import { ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export type ZtoAlertProps = {
  variant: "success" | "danger";
  message: ReactNode;
  onClose: () => void;
  /** Başarı bildiriminde varsayılan 4000 ms (ZTO Uyumsoft `uy-msg` davranışı); hata kendiliğinden kapanmaz. */
  autoHideMs?: number;
};

const SUCCESS_HIDE_MS = 4000;

/**
 * Bootstrap 4 kapatılabilir uyarı: div.alert.alert-{variant}.alert-dismissible > button.close (×).
 * ZTO tanım ekranları kayıt sonrası TempData mesajı üretiyor ama view'lar göstermiyordu (ZTO
 * hatası); Blackrose bunu görünür bildirime çevirir (12.1a §6.8).
 */
export function ZtoAlert({ variant, message, onClose, autoHideMs }: ZtoAlertProps) {
  const { t } = useTranslation("ztoFinans");
  const close = useRef(onClose);
  close.current = onClose;
  const delay = autoHideMs ?? (variant === "success" ? SUCCESS_HIDE_MS : undefined);

  useEffect(() => {
    if (delay === undefined) return;
    const timer = setTimeout(() => close.current(), delay);
    return () => clearTimeout(timer);
  }, [delay, message]);

  return (
    <div
      className={`alert alert-${variant} alert-dismissible`}
      role={variant === "danger" ? "alert" : "status"}
    >
      {message}
      <button
        type="button"
        className="close"
        data-dismiss="alert"
        aria-label={t("definitions.close")}
        onClick={onClose}
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
}

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ANNOUNCE_DELAY_MS, announcementText, createAnnouncementTracker } from "./fieldA11y";

export type FormErrorAnnouncer = {
  /** Sayfaya bir kez konacak görünmez canlı bölge (Bootstrap 4 `.sr-only`). */
  region: ReactNode;
  /**
   * Alan bırakıldığında (onBlur) çağrılır: yeni çıkan hata 500 ms sonra "{etiket}: {hata}" olarak
   * okunur; hata yoksa ya da aynı hata zaten okunduysa bir şey yapmaz.
   */
  announceFieldError: (
    field: string,
    label: string | null | undefined,
    error: string | null | undefined,
  ) => void;
  /** Bölgeyi boşaltır (form sıfırlanınca, modal kapanınca). */
  clear: () => void;
};

/**
 * MWG `accessible-error-announcement`: sayfa başına tek `aria-live="polite"` bölge. Her hata metnini
 * ayrı canlı bölge yapmak güvenilir okunmaz; gönderim hatasında RHF ilk geçersiz alana odaklanır ve
 * odak hatayı (aria-describedby) okutur, bu yüzden gönderim hataları buradan duyurulmaz.
 */
export function useFormErrorAnnouncer(): FormErrorAnnouncer {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const tracker = useMemo(() => createAnnouncementTracker(), []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const announceFieldError = useCallback(
    (field: string, label: string | null | undefined, error: string | null | undefined) => {
      if (!tracker.next(field, error)) {
        return;
      }
      clearTimeout(timer.current);
      setText("");
      const message = announcementText(label, error as string);
      timer.current = setTimeout(() => setText(message), ANNOUNCE_DELAY_MS);
    },
    [tracker],
  );

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    tracker.reset();
    setText("");
  }, [tracker]);

  const region = (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );

  return { region, announceFieldError, clear };
}

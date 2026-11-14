import {
  createContext,
  FocusEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useZtoPortalContainer } from "../ZtoPortalContext";
import {
  addSnackbar,
  createSnackbarTimeline,
  liveLevel,
  removeSnackbar,
  setPhase,
  snackbarClass,
  snackbarStyle,
  type SnackbarItem,
  type SnackbarKind,
} from "./snackbarLogic";

export type ZtoSnackbarApi = {
  /** ZTO `showSnackbar('snackbar-' + kind, message)`; ileti düz metindir (HTML yorumlanmaz). */
  show: (message: string, kind?: SnackbarKind) => void;
};

const NOOP_API: ZtoSnackbarApi = { show: () => undefined };

const SnackbarContext = createContext<ZtoSnackbarApi | null>(null);

/** Sağlayıcı yoksa (ör. kök dışı test) ileti gösterilmez. */
export function useZtoSnackbar(): ZtoSnackbarApi {
  return useContext(SnackbarContext) ?? NOOP_API;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * ZTO snackbar sağlayıcısı (ZtoFinansLayout bağlar). Kökün içinde, sayfa açılırken var olan tek kap:
 * `role="region" aria-label="Bildirimler"` + iki görünmez canlı bölge (polite / hata için assertive;
 * `ariaNotify` Baseline "Newly available" olduğundan kılavuzun canlı bölge geri dönüşü). Görünen
 * ileti ZTO DOM'u; kapatma düğmesi yalnız klavye odağında görünür (`sr-only sr-only-focusable`).
 */
export function ZtoSnackbarProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const container = useZtoPortalContainer();
  const [items, setItems] = useState<SnackbarItem[]>([]);
  const [live, setLive] = useState<{ polite: string; assertive: string }>({
    polite: "",
    assertive: "",
  });
  const nextId = useRef(1);
  const liveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(liveTimer.current), []);

  const show = useCallback((message: string, kind: SnackbarKind = "info") => {
    const id = nextId.current++;
    setItems((list) => addSnackbar(list, { id, message, kind }));
    // Aynı metin art arda gelse de okunsun: önce boşalt, sonra yaz.
    const level = liveLevel(kind);
    clearTimeout(liveTimer.current);
    setLive({ polite: "", assertive: "" });
    liveTimer.current = setTimeout(
      () => setLive({ polite: "", assertive: "", [level]: message }),
      50,
    );
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  const update = useCallback((id: number, phase: SnackbarItem["phase"] | null) => {
    setItems((list) => (phase === null ? removeSnackbar(list, id) : setPhase(list, id, phase)));
  }, []);

  const region = (
    <div role="region" aria-label={t("common.a11y.notifications")}>
      {items.map((item) => (
        <ZtoSnackbarMessage key={item.id} item={item} onPhase={update} />
      ))}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {live.polite}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {live.assertive}
      </div>
    </div>
  );

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      {container && createPortal(region, container)}
    </SnackbarContext.Provider>
  );
}

function ZtoSnackbarMessage({
  item,
  onPhase,
}: {
  item: SnackbarItem;
  onPhase: (id: number, phase: SnackbarItem["phase"] | null) => void;
}) {
  const { t } = useTranslation();
  const timeline = useRef<ReturnType<typeof createSnackbarTimeline>>();
  const previousFocus = useRef<HTMLElement | null>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const { id } = item;

  useEffect(() => {
    const line = createSnackbarTimeline({
      onShow: () => onPhase(id, "shown"),
      onHide: () => onPhase(id, "leaving"),
      onRemove: () => onPhase(id, null),
    });
    timeline.current = line;
    return () => line.dispose();
  }, [id, onPhase]);

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (
      event.relatedTarget instanceof HTMLElement &&
      !event.currentTarget.contains(event.relatedTarget)
    ) {
      previousFocus.current = event.relatedTarget;
    }
    timeline.current?.pause();
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      timeline.current?.resume();
    }
  };

  const dismiss = () => {
    timeline.current?.dismiss();
    // MWG: elle kapatılan iletiden odak önceki yerine döner.
    const back = previousFocus.current;
    if (back && back.isConnected) back.focus();
  };

  return (
    <div
      className={snackbarClass(item.kind)}
      style={snackbarStyle(item.phase, reduced)}
      onMouseEnter={() => timeline.current?.pause()}
      onMouseLeave={() => timeline.current?.resume()}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <i className="fas fa-info-circle" aria-hidden="true" /> {item.message}
      <button
        type="button"
        className="sr-only sr-only-focusable"
        aria-label={t("common.a11y.close")}
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}

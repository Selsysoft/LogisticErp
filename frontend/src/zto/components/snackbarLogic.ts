/*
 * ZtoSnackbar mantığı (12.1 §5.5): ZTO `showSnackbar(className, message)` (transactions.js:2217-2229)
 * — `div.snackbar.{className}` + `fa-info-circle` + metin; 500 ms kayarak açılır (bottom -50px → 0),
 * 3 sn kalır, 500 ms kayarak kapanır ve silinir. Kuyruk yok: her ileti hemen görünür, öncekiler
 * kendi zamanlayıcılarıyla kapanır (ZTO'da da üst üste biner). MWG `persistent-toast-notifications`
 * eklemeleri görünmez katmanda: canlı bölge, fare/odakta zamanlayıcı durur.
 */

export type SnackbarKind = "success" | "error" | "warning" | "info" | "gray";

/** jQuery animate süresi (ms). */
export const SNACKBAR_SLIDE_MS = 500;
/** jQuery delay(3000). */
export const SNACKBAR_VISIBLE_MS = 3000;
/** Kapalı konum (layout.css `.snackbar { bottom: -50px }`). */
export const SNACKBAR_HIDDEN_BOTTOM = "-50px";

/** ZTO sınıfı: "snackbar snackbar-success" (layout.css:232-259). */
export function snackbarClass(kind: SnackbarKind): string {
  return `snackbar snackbar-${kind}`;
}

/** Hata hemen (assertive), diğerleri sırası gelince (polite) okunur. */
export function liveLevel(kind: SnackbarKind): "polite" | "assertive" {
  return kind === "error" ? "assertive" : "polite";
}

export type SnackbarPhase = "entering" | "shown" | "leaving";

export type SnackbarItem = {
  id: number;
  message: string;
  kind: SnackbarKind;
  phase: SnackbarPhase;
};

/** Yeni ileti listenin sonuna, hemen (kuyruk yok; açık modal beklenmez). */
export function addSnackbar(
  list: readonly SnackbarItem[],
  item: Omit<SnackbarItem, "phase">,
): SnackbarItem[] {
  return [...list, { ...item, phase: "entering" }];
}

export function setPhase(
  list: readonly SnackbarItem[],
  id: number,
  phase: SnackbarPhase,
): SnackbarItem[] {
  return list.map((item) => (item.id === id ? { ...item, phase } : item));
}

export function removeSnackbar(list: readonly SnackbarItem[], id: number): SnackbarItem[] {
  return list.filter((item) => item.id !== id);
}

/**
 * Satır içi stil: ZTO `.css({ width: '100%', 'text-align': 'center' })` + kayma. Hareket azaltma
 * tercihinde konum sabit (bottom 0), yalnız saydamlık değişir.
 */
export function snackbarStyle(
  phase: SnackbarPhase,
  reducedMotion: boolean,
): Record<string, string | number> {
  const base = { width: "100%", textAlign: "center" };
  if (reducedMotion) {
    return {
      ...base,
      bottom: 0,
      opacity: phase === "shown" ? 1 : 0,
      transition: `opacity ${SNACKBAR_SLIDE_MS}ms linear`,
    };
  }
  return {
    ...base,
    bottom: phase === "shown" ? 0 : SNACKBAR_HIDDEN_BOTTOM,
    // jQuery "swing" ≈ ease-in-out.
    transition: `bottom ${SNACKBAR_SLIDE_MS}ms ease-in-out`,
  };
}

export type SnackbarTimeline = {
  /** Fare üzerinde ya da odak içindeyken kapanma beklemesi durur. */
  pause(): void;
  resume(): void;
  /** Elle kapatma (klavye ile kapat düğmesi): hemen kayarak kapanır. */
  dismiss(): void;
  dispose(): void;
};

/**
 * Bir iletinin zaman çizelgesi: hemen `onShow` (bir sonraki görev; geçiş başlasın diye), açılış +
 * 3 sn sonra `onHide`, kapanış kayması bitince `onRemove`. Duraklatma kalan süreyi saklar.
 */
export function createSnackbarTimeline(
  callbacks: { onShow(): void; onHide(): void; onRemove(): void },
  options: { slideMs?: number; visibleMs?: number; now?: () => number } = {},
): SnackbarTimeline {
  const slide = options.slideMs ?? SNACKBAR_SLIDE_MS;
  const visible = options.visibleMs ?? SNACKBAR_VISIBLE_MS;
  const now = options.now ?? (() => Date.now());
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let removeTimer: ReturnType<typeof setTimeout> | undefined;
  let remaining = slide + visible;
  let startedAt = now();
  let paused = false;
  let hidden = false;

  const hide = () => {
    if (hidden) return;
    hidden = true;
    clearTimeout(hideTimer);
    callbacks.onHide();
    removeTimer = setTimeout(callbacks.onRemove, slide);
  };

  const scheduleHide = () => {
    startedAt = now();
    hideTimer = setTimeout(hide, remaining);
  };

  const showTimer = setTimeout(callbacks.onShow, 0);
  scheduleHide();

  return {
    pause() {
      if (paused || hidden) return;
      paused = true;
      clearTimeout(hideTimer);
      remaining = Math.max(0, remaining - (now() - startedAt));
    },
    resume() {
      if (!paused || hidden) return;
      paused = false;
      // Kullanıcı ayrıldıktan sonra en az bir görünür süre kalır.
      remaining = Math.max(remaining, slide);
      scheduleHide();
    },
    dismiss: hide,
    dispose() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    },
  };
}

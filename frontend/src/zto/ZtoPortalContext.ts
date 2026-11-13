import { createContext, useContext } from "react";

/**
 * .zto-finans kök öğesi. Modal, tooltip/popover ve açılır listeler buraya portal'lanır; böylece
 * kapsamlı CSS onlara da uygulanır (document.body'ye giden öğe ZTO stilini alamaz).
 */
export const ZtoPortalContext = createContext<HTMLElement | null>(null);

/**
 * Açılır liste/tooltip/popover kapsayıcısı. ZtoModal gövdesinde .modal öğesidir (ZTO'daki select2
 * dropdownParent: $('.modal') karşılığı): liste modalın içinde çizilir, odak tuzağına takılmaz ve
 * modalın yığın bağlamında kalır. Modal dışında null'dır; kök kapsayıcı kullanılır.
 */
export const ZtoOverlayContainerContext = createContext<HTMLElement | null>(null);

/** Kök dışında (ZtoFinansRoot yoksa) null döner. Modallar her zaman köke portal'lanır. */
export function useZtoPortalContainer(): HTMLElement | null {
  return useContext(ZtoPortalContext);
}

/** Overlay (select2, tooltip, popover) kapsayıcısı: modal içindeyse .modal, değilse kök. */
export function useZtoOverlayContainer(): HTMLElement | null {
  const overlay = useContext(ZtoOverlayContainerContext);
  const root = useContext(ZtoPortalContext);
  return overlay ?? root;
}

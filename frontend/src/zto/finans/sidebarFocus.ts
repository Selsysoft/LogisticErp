/**
 * Yan menüden açılan modalların (Hızlı Cari İşlemi, Hızlı Bakiye Özeti) kapanışında odak güvencesi.
 *
 * Modal, açıldığı andaki odaklı öğeye (menü öğesi) odağı geri verir. Ancak modal açıkken menü kapanır
 * (imleç menüden ayrılır ya da modal içindeki tıklama "dışarı tıklama" sayılır) ve kapalı paneldeki öğe
 * odak alamaz; odak `body`'ye düşer. Bu durumda odak menünün aç/kapa okuna verilir (görünür, klavyeyle
 * menüyü yeniden açar). Kütüphanenin odak geri yüklemesinden sonra çalışması için `onExited`'dan
 * gecikmeli çağrılır.
 */
export const SIDEBAR_TOGGLE_SELECTOR = "#ztSidebar .zt-sidebar-arrow";

/** Odak kaybolduysa (body ya da yok) yan menü okuna verir; verildiyse true. */
export function focusSidebarToggleIfLost(doc: Document = document): boolean {
  const active = doc.activeElement;
  if (active && active !== doc.body) return false;
  const toggle = doc.querySelector<HTMLElement>(SIDEBAR_TOGGLE_SELECTOR);
  if (!toggle) return false;
  toggle.focus();
  return doc.activeElement === toggle;
}

/** `onExited` için: kütüphane odağı geri verdikten sonra denetler. */
export function restoreSidebarFocusLater(delayMs = 50): void {
  window.setTimeout(() => focusSidebarToggleIfLost(), delayMs);
}

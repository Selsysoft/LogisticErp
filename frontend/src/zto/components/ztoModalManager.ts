import BootstrapModalManager from "react-bootstrap/BootstrapModalManager";

// zto-overrides.css ile aynı taban değerler (backdrop 1390, modal 1400).
export const MODAL_BASE_Z_INDEX = 1400;
export const BACKDROP_BASE_Z_INDEX = 1390;
export const MODAL_STACK_STEP = 10;

/**
 * Üst üste açılan modalın katman değerleri. 0. seviye CSS'e bırakılır (null); her üst seviye bir
 * adım yukarıda, backdrop'u alttaki modalın üstünde ve kendi modalının altında kalır.
 */
export function stackedZIndex(level: number): { modal: number; backdrop: number } | null {
  if (level <= 0) {
    return null;
  }
  const modal = MODAL_BASE_Z_INDEX + level * MODAL_STACK_STEP;
  return { modal, backdrop: modal - MODAL_STACK_STEP / 2 };
}

// Kaydırma çubuğu genişliği kadar sağ boşluk alan sabit öğeler: Bootstrap'ınkiler + MUI AppBar.
const FIXED_CONTENT = ".fixed-top, .fixed-bottom, .is-fixed, .sticky-top, .mui-fixed";
const STORE_KEY = "ztoModalPaddingRight";

type ContainerState = Parameters<BootstrapModalManager["setContainerStyle"]>[0];
type ModalInstance = Parameters<BootstrapModalManager["add"]>[0];

function isBodyOverflowing(doc: Document): boolean {
  const view = doc.defaultView;
  if (!view) {
    return false;
  }
  const rect = doc.body.getBoundingClientRect();
  return Math.round(rect.left + rect.right) < view.innerWidth;
}

function computedPaddingRight(element: HTMLElement): number {
  const view = element.ownerDocument.defaultView;
  const value = view ? view.getComputedStyle(element).paddingRight : element.style.paddingRight;
  return parseFloat(value) || 0;
}

/**
 * ZTO modallarının yöneticisi. react-bootstrap kapsayıcıya (.zto-finans kökü) "modal-open" sınıfını ve
 * kardeşlere aria-hidden'ı kendisi ekler; bu sınıf iki işi değiştirir:
 * - Kaydırma kilidi kök yerine belgenin body'sine uygulanır (Bootstrap'taki body.modal-open gibi);
 *   kökü overflow:hidden yapmak sayfayı kilitlemez, yalnız içeriği kırpardı.
 * - Üst üste açılan modallara artan z-index verilir; backdrop'lar kökte kalır.
 */
export class ZtoModalManager extends BootstrapModalManager {
  add(modal: ModalInstance, container: HTMLElement, className?: string): number {
    const index = super.add(modal, container, className);
    const state = this.data[this.containerIndexFromModal(modal)];
    const levels = stackedZIndex(state ? state.modals.indexOf(modal) : 0);
    if (levels) {
      (modal.dialog as HTMLElement | null)?.style.setProperty("z-index", String(levels.modal));
      (modal.backdrop as HTMLElement | null)?.style.setProperty("z-index", String(levels.backdrop));
    }
    return index;
  }

  setContainerStyle(containerState: ContainerState, container: HTMLElement): void {
    const doc = container.ownerDocument;
    const body = doc.body;
    const overflowing = isBodyOverflowing(doc);
    // react-bootstrap modalın sağ boşluğunu bu bayrağa göre ayarlar (Bootstrap _adjustDialog).
    containerState.overflowing = overflowing;
    containerState.bodyStyle = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    if (overflowing) {
      const size = this.scrollbarSize;
      body.style.paddingRight = `${computedPaddingRight(body) + size}px`;
      doc.querySelectorAll<HTMLElement>(FIXED_CONTENT).forEach((element) => {
        element.dataset[STORE_KEY] = element.style.paddingRight;
        element.style.paddingRight = `${computedPaddingRight(element) + size}px`;
      });
    }
    body.style.overflow = "hidden";
  }

  removeContainerStyle(containerState: ContainerState, container: HTMLElement): void {
    const doc = container.ownerDocument;
    const saved = containerState.bodyStyle as
      { overflow: string; paddingRight: string } | undefined;
    if (saved) {
      doc.body.style.overflow = saved.overflow;
      doc.body.style.paddingRight = saved.paddingRight;
    }
    doc.querySelectorAll<HTMLElement>(FIXED_CONTENT).forEach((element) => {
      const value = element.dataset[STORE_KEY];
      if (value !== undefined) {
        element.style.paddingRight = value;
        delete element.dataset[STORE_KEY];
      }
    });
  }
}

/** Tüm ZTO modallarının ortak yöneticisi: üst üste açılma sırası ve kilit tek yerde tutulur. */
export const ztoModalManager = new ZtoModalManager();

/*
 * Açılır menü (Bootstrap 4 `.dropdown-menu`) yardımcıları — ZTO `data-toggle="dropdown"` karşılığı.
 * MWG `menu`: tetikleyici sıradan düğme (`aria-haspopup="menu"`, `aria-expanded`), menüde ↑/↓/Home/End,
 * Escape kapatıp odağı tetikleyiciye döndürür, Tab menüden çıkar. CSS anchor positioning Baseline
 * değil: menü `position: fixed` ile betikten konumlanır, taşarsa yukarı açılır ve görünüme sıkıştırılır.
 */

export type RectLike = { top: number; bottom: number; left: number; right: number };
export type SizeLike = { width: number; height: number };

export type MenuPlacement = { top: number; left: number; above: boolean };

/** Bootstrap `.dropdown-menu` üst boşluğu (margin .125rem). */
const GAP = 2;
const EDGE = 4;

/**
 * Menüyü tetikleyicinin altına (sığmazsa üstüne) yerleştirir; `align="right"` sağ kenarları hizalar
 * (`dropdown-menu-right`). Görünüm dışına taşmayacak biçimde sıkıştırır.
 */
export function menuPlacement(
  trigger: RectLike,
  menu: SizeLike,
  viewport: SizeLike,
  align: "left" | "right" = "left",
): MenuPlacement {
  const below = trigger.bottom + GAP;
  const fitsBelow = below + menu.height <= viewport.height - EDGE;
  const fitsAbove = trigger.top - GAP - menu.height >= EDGE;
  const above = !fitsBelow && fitsAbove;
  const rawTop = above ? trigger.top - GAP - menu.height : below;
  const top = Math.max(EDGE, Math.min(rawTop, viewport.height - EDGE - menu.height));
  const rawLeft = align === "right" ? trigger.right - menu.width : trigger.left;
  const left = Math.max(EDGE, Math.min(rawLeft, viewport.width - EDGE - menu.width));
  return { top: above || fitsBelow ? rawTop : top, left, above };
}

/** ↑/↓/Home/End ile sonraki öğe (kaydırma döngüsel); tanınmayan tuşta null. */
export function nextMenuIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp":
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

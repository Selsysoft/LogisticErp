import { createContext, useContext, useLayoutEffect } from "react";

/** Kök sınıfı kaydeder; dönen fonksiyon kaydı geri alır. ZtoFinansLayout sağlar. */
export const ZtoRootClassContext = createContext<((className: string) => () => void) | null>(null);

/**
 * Sayfa açıkken `.zto-finans` köküne sınıf ekler (ör. "definition-list-page"); sayfa kapanınca
 * çıkarır. Bağlam yoksa (testte kök dışı) hiçbir şey yapmaz.
 */
export function useZtoRootClass(className: string) {
  const register = useContext(ZtoRootClassContext);
  useLayoutEffect(() => register?.(className), [register, className]);
}

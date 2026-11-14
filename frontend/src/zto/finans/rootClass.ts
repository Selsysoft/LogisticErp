/**
 * ZTO kök sınıfı kaydı (12.1a §6.6). ZTO tanım ekranlarının CSS'i body sınıfına bağlıdır
 * (`body.definition-list-page x`, introduction-details.js:424 ve :478 ekler); kapsamlı derlemede bu
 * `.zto-finans.definition-list-page x` olur. Sayfalar sınıfı ZtoFinansLayout bağlamıyla köke yazar.
 * Aynı sınıfı iki kaynak isteyebilir; liste sayaçlıdır (her kayıt bir kez çıkarılır).
 */

export function addRootClass(list: readonly string[], className: string): string[] {
  return [...list, className];
}

/** Sınıfın bir örneğini çıkarır; yoksa listeyi aynen döndürür. */
export function removeRootClass(list: readonly string[], className: string): string[] {
  const index = list.indexOf(className);
  return index < 0 ? [...list] : [...list.slice(0, index), ...list.slice(index + 1)];
}

/** Köke yazılacak sınıf dizgesi (tekrarsız, kayıt sırasıyla); boşsa undefined. */
export function rootClassName(list: readonly string[]): string | undefined {
  const unique = [...new Set(list.filter((c) => c.trim() !== ""))];
  return unique.length > 0 ? unique.join(" ") : undefined;
}

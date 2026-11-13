/**
 * Arama anahtarı: select2 4.1 stripDiacritics + toUpperCase (src/js/select2/defaults.js, diacritics.js).
 * ZtoSelect, ZtoDataTable ve ZtoBranchMultiSelect aynı katlamayı kullanır; böylece seçim kutusunda
 * bulunan kayıt tabloda da bulunur ("isparta" ↔ "ISPARTA", "kirmizi" ↔ "KIRMIZI").
 */

// NFD ile ayrışmayan harfler (select2 diacritics.js tablosundaki karşılıkları).
const NON_DECOMPOSING: Record<string, string> = {
  ı: "i",
  ł: "l",
  Ł: "L",
  ø: "o",
  Ø: "O",
  đ: "d",
  Đ: "D",
  ħ: "h",
  Ħ: "H",
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
};

/**
 * select2 stripDiacritics + toUpperCase: aksan ve büyük/küçük harf duyarsız karşılaştırma anahtarı.
 * ç→C, ğ→G, ı/i/İ/I→I, ö→O, ş→S, ü→U. Yerel ayarsız toUpperCase kullanılır (select2 gibi); böylece
 * "ı" ile "i" de eşleşir.
 */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ıłŁøØđĐħĦßæÆœŒ]/g, (ch) => NON_DECOMPOSING[ch])
    .toUpperCase();
}

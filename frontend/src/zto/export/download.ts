// Tarayıcıda dosya indirme yardımcıları (blob: bağlantısı; CSP'ye takılmaz, sunucuya gitmez).

/** Windows'ta geçersiz karakterleri "_" yapar, boşlukları sadeleştirir; boşsa fallback. */
export function sanitizeFileName(name: string, fallback = "rapor"): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 150)
    .trim();
  return cleaned || fallback;
}

/** Uzantı yoksa ekler (büyük/küçük harf duyarsız). ext noktayla verilir: ".xlsx". */
export function ensureExtension(name: string, ext: string): string {
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext;
}

/** Dosya adını temizleyip uzantıyı tamamlar. */
export function buildFileName(name: string | undefined, ext: string, fallback = "rapor"): string {
  return ensureExtension(sanitizeFileName(name ?? "", fallback), ext);
}

/** Blob'u verilen adla indirir. Nesne URL'si bir süre sonra serbest bırakılır. */
export function downloadBlob(blob: Blob, fileName: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  doc.body.appendChild(a);
  a.click();
  a.remove();
  // Hemen serbest bırakmak bazı tarayıcılarda indirmeyi keser.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

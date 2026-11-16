/*
 * Çek Belgeleri (ZTO Views/Checks/CheckDocuments.cshtml; 12.3_TASARIM §5.8) saf mantığı: 20 MB
 * sınırı (ZTO MAX_FILE_SIZE_MB; sunucu application.yml ile aynı), dosya simgesi
 * (GetFileExtensionIcon), "Dosya seç..." etiketi ve ilerleme yüzdesi.
 */

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

type Sized = { name: string; size: number };

/** Dosya 20 MB sınırını aşıyor mu. */
export function oversize(file: Pick<Sized, "size">): boolean {
  return file.size > MAX_FILE_SIZE;
}

/** Geçerli ve sınırı aşan dosyalar (ZTO handleFiles filtresi). */
export function splitFiles<T extends Sized>(files: Iterable<T>): { valid: T[]; oversized: T[] } {
  const valid: T[] = [];
  const oversized: T[] = [];
  for (const file of files) (oversize(file) ? oversized : valid).push(file);
  return { valid, oversized };
}

/** Uzantı simgesi (CheckDocuments.cshtml GetFileExtensionIcon). */
export function fileIcon(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot === -1 ? "" : fileName.slice(dot).toLowerCase();
  switch (extension) {
    case ".doc":
    case ".docx":
      return "fas fa-file-word";
    case ".xls":
    case ".xlsx":
      return "fas fa-file-excel";
    case ".ppt":
    case ".pptx":
      return "fas fa-file-powerpoint";
    case ".pdf":
      return "far fa-file-pdf";
    case ".zip":
    case ".rar":
      return "fas fa-book";
    case ".txt":
      return "fas fa-align-left";
    case ".jpg":
    case ".png":
    case ".gif":
      return "far fa-image";
    default:
      return "fas fa-file";
  }
}

/** `custom-file-label` metni (updateLabel): boş → null (varsayılan "Dosya seç..."), tek → ad, çok → adet. */
export function pickedLabel(
  files: ReadonlyArray<Pick<Sized, "name">>,
): { kind: "none" } | { kind: "one"; name: string } | { kind: "many"; count: number } {
  if (files.length === 0) return { kind: "none" };
  if (files.length === 1) return { kind: "one", name: files[0].name };
  return { kind: "many", count: files.length };
}

/** Çoklu yüklemede tamamlanan dosya oranı (0–100, tam sayı). */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/** Bağlam menüsünde ok tuşlarıyla gezinme: sıradaki öğe dizini (kaydırmalı). */
export function nextMenuIndex(current: number, key: string, count: number): number {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "ArrowDown") return (current + 1) % count;
  return current;
}

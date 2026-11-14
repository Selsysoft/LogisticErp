/**
 * ZTO wwwroot/js/introduction-details.js `enhanceDefinitionForm` (:463-532) sınıf ekleme kuralının
 * TypeScript yeniden yazımı — YALNIZ TEST YARDIMCISI. ZTO betiği tanım formlarını çalışma anında
 * süsler (DOM taşımaz, yalnız sınıf ekler); Blackrose sayfaları aynı sınıfları bildirimsel yazar.
 * Testler bu fonksiyonu render edilmiş forma uygular ve dönen her sınıfın öğede ZATEN bulunduğunu
 * doğrular: ZTO betiği çalışsaydı hiçbir şey eklemeyecekti = birebir (12.1a §6.8 Şablon D).
 */

const FIELD_CONTROLS = 'input:not([type="hidden"]), select, textarea';
const WIDE_CONTROLS = 'textarea, input[type="file"], .custom-file, .input-group';
const NON_BUTTON_CONTROLS = 'input:not([type="hidden"]):not([type="submit"]), select, textarea';

/** Her öğe–sınıf çifti en çok bir kez eklenir (kökler ve ebeveynler ayrı ayrı tekilleştirilir). */
function add(result: Map<Element, string[]>, element: Element, className: string) {
  result.set(element, [...(result.get(element) ?? []), className]);
}

/**
 * Forma ZTO'nun ekleyeceği sınıflar (öğe → sınıflar). Başlık: formdan önce gelen son, metinli
 * h1–h4 (nav, .modal ve header dışında) `definition-form-title` alır.
 */
export function computeDefinitionFormClasses(form: Element): Map<Element, string[]> {
  const result = new Map<Element, string[]>();
  add(result, form, "definition-form");
  if (form.closest(".card, .custom-card")) add(result, form, "definition-form--nested");

  let heading: Element | null = null;
  for (const candidate of Array.from(form.ownerDocument.querySelectorAll("h1, h2, h3, h4"))) {
    if (candidate.closest("#layoutSidenav_nav, nav, .modal, header")) continue;
    if (!(candidate.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (candidate.textContent!.trim()) heading = candidate;
  }
  if (heading) add(result, heading, "definition-form-title");

  const fieldRoots: Element[] = [];
  for (const label of Array.from(form.querySelectorAll("label"))) {
    if (
      label.classList.contains("form-check-label") ||
      label.classList.contains("custom-file-label")
    ) {
      continue;
    }
    let root = label.closest("div, fieldset");
    if (!root || root === form || !form.contains(root)) continue;
    if (root.matches("fieldset")) root = root.closest("div") ?? root;
    if (fieldRoots.includes(root)) continue;
    if (!root.querySelector(FIELD_CONTROLS)) continue;
    add(result, root, "definition-form-field");
    if (root.querySelector(WIDE_CONTROLS)) add(result, root, "definition-form-field--wide");
    fieldRoots.push(root);
  }

  const counts = new Map<Element, number>();
  for (const root of fieldRoots) {
    // Kök formun içinde ve formdan farklıdır; ebeveyni her zaman vardır.
    const parent = root.parentElement!;
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  for (const [parent, count] of counts) {
    if (count >= 2) add(result, parent, "definition-form-grid");
  }

  const submit = form.querySelector('button[type="submit"], input[type="submit"]');
  const actionRow = submit?.closest("div");
  if (actionRow && form.contains(actionRow) && !actionRow.querySelector(NON_BUTTON_CONTROLS)) {
    add(result, actionRow, "definition-form-actions");
  }
  return result;
}

/** Eksik sınıflar: ZTO betiğinin ekleyeceği ama öğede bulunmayanlar ("etiket: sınıf" listesi). */
export function missingDefinitionFormClasses(form: Element): string[] {
  const missing: string[] = [];
  for (const [element, classes] of computeDefinitionFormClasses(form)) {
    for (const className of classes) {
      if (!element.classList.contains(className)) {
        const label = element.tagName.toLowerCase() + (element.id ? `#${element.id}` : "");
        missing.push(`${label}.${Array.from(element.classList).join(".")}: ${className}`);
      }
    }
  }
  return missing;
}

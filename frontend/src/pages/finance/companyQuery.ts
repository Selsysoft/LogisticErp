import { companyParam } from "../../auth/companyStore";

/**
 * Aktif şirket süzgecini bir API yoluna ekler (12.1a §5.4, §6.13): şirket seçiliyse `companyId=…`,
 * konsolidede (null) yol değişmez. Sorgu anahtarına da aynı kimlik konur; seçim değişince ayrıca
 * geçersizleme gerekmez.
 */
export function withCompany(path: string, companyId: string | null): string {
  const param = companyParam(companyId);
  if (!param) {
    return path;
  }
  return `${path}${path.includes("?") ? "&" : "?"}${param}`;
}

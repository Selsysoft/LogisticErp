import { create } from "zustand";
import type { MeCompany } from "../pages/organization/types";
import type { Me } from "./authStore";

/**
 * Aktif şirket (12.1a §6.3). Çok şirketli kiracıda kullanıcı bir şirket ya da konsolide (null) görünüm
 * seçer; seçim kiracı + kullanıcı başına localStorage'da saklanır. Tek şirketli kiracıda hep null:
 * ekranlar şirket süzgeci göndermez. Saf mantık bu dosyadadır; authStore bootstrap/login/reloadMe
 * sonunda hydrate, logout/oturum bitiminde clear çağırır.
 */

/** Konsolide görünüm: şirket süzgeci yok. */
export const CONSOLIDATED = null;

export function storageKey(tenant: string, userId: string): string {
  return `blackrose.activeCompany.${tenant}.${userId}`;
}

export function activeCompanies(companies: MeCompany[] | undefined): MeCompany[] {
  return (companies ?? []).filter((company) => company.active);
}

export function isMultiCompany(companies: MeCompany[] | undefined): boolean {
  return activeCompanies(companies).length >= 2;
}

/** Çoklu değilse null; saklanan değer aktif şirketlerden biri değilse null (konsolide). */
export function resolveActive(
  stored: string | null,
  companies: MeCompany[] | undefined,
): string | null {
  if (!stored || !isMultiCompany(companies)) {
    return CONSOLIDATED;
  }
  return activeCompanies(companies).some((company) => company.id === stored)
    ? stored
    : CONSOLIDATED;
}

/**
 * Formların önerdiği şirket: aktif seçim; konsolide iken varsayılan şirket; varsayılan şirket
 * kullanıcıya görünmüyorsa (LIMITED, `me.companies` yalnız görünenler) görünen tek aktif şirket.
 */
export function formDefaultCompanyId(
  active: string | null,
  companies?: MeCompany[],
): string | undefined {
  if (active) {
    return active;
  }
  const visibleDefault = companies?.find((company) => company.defaultCompany)?.id;
  if (visibleDefault) {
    return visibleDefault;
  }
  const only = activeCompanies(companies);
  return only.length === 1 ? only[0].id : undefined;
}

/**
 * Şirket alanı çizilmeyen (≥2 aktif şirket görmeyen) kullanıcıda gövdeye konacak şirket. Görünen tek
 * aktif şirket kiracının varsayılan şirketi değilse onun id'si: örn. yalnız B şirketinin iş yerine
 * sınırlı LIMITED kullanıcı. Aksi hâlde undefined; sunucu varsayılan şirkete düşer ve gerçek tek
 * şirketli kiracıda gövdeye `companyId` konmaz (§6.13). Sunucu `companyId: null`'ı varsayılan şirkete
 * çözdüğü için onu görmeyen kullanıcıda 403 COMPANY_OUT_OF_SCOPE alınırdı.
 */
export function implicitCompanyId(companies?: MeCompany[]): string | undefined {
  if (isMultiCompany(companies)) {
    return undefined;
  }
  const only = activeCompanies(companies);
  return only.length === 1 && !only[0].defaultCompany ? only[0].id : undefined;
}

/** Sorgu dizgesi parçası: `companyId=…` ya da konsolidede "". */
export function companyParam(id: string | null): string {
  return id ? `companyId=${encodeURIComponent(id)}` : "";
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, id: string | null) {
  try {
    if (id) {
      localStorage.setItem(key, id);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Saklanamazsa seçim yalnız bu sekmede geçerli kalır.
  }
}

type CompanyState = {
  activeCompanyId: string | null;
  hydrate: (me: Me | null) => void;
  setActive: (id: string | null) => void;
  clear: () => void;
};

/** hydrate'in belirlediği saklama anahtarı (oturumdaki kullanıcı); yoksa seçim saklanmaz. */
let currentKey: string | null = null;

export const useCompanyStore = create<CompanyState>((set) => ({
  activeCompanyId: CONSOLIDATED,

  hydrate(me) {
    if (!me) {
      currentKey = null;
      set({ activeCompanyId: CONSOLIDATED });
      return;
    }
    currentKey = storageKey(me.tenant, me.id);
    set({ activeCompanyId: resolveActive(readStored(currentKey), me.companies) });
  },

  setActive(id) {
    if (currentKey) {
      writeStored(currentKey, id);
    }
    set({ activeCompanyId: id });
  },

  clear() {
    // Kullanıcının tercihi saklı kalır (anahtar kullanıcıya özgü); yalnız bellek temizlenir.
    currentKey = null;
    set({ activeCompanyId: CONSOLIDATED });
  },
}));

export function useActiveCompanyId(): string | null {
  return useCompanyStore((state) => state.activeCompanyId);
}

import { useEffect, useMemo, useState } from "react";
import { leafLookupReady, useCheckLeafLookup } from "../../../../pages/finance/instrumentApi";
import type { CheckLeaf } from "../../../../pages/finance/types";
import type { CheckLeafGuardResult } from "./index";
import { useModalText } from "./parts";

/*
 * Elle girilen çek numarasının koçan yaprağı denetimi (ZTO `_CheckLeafGuard.cshtml` :57-85; 12.3
 * §5.10). Numara bir koçanda yaprak olarak kayıtlıysa uyarı verir ve kaydı durdurur (sunucuda 409
 * CHECK_NUMBER_IN_CHECK_BOOK / CHECK_LEAF_USED). ZTO'dan farklar: arama seçilen banka hesabına
 * süzülür (sunucu kuralı §3.3 #4 ile aynı), yalnız "Kendi Çekimiz" manuel kipinde çalışır; düzenlemede
 * kaydın kendi yaprağı ve yapraksız eski numarası serbesttir (Rev 1 F1).
 */

/** Yazmayı bitirince arama (ZTO 350 ms; tasarım 400 ms). */
export const LEAF_GUARD_DEBOUNCE_MS = 400;

type Tm = (key: string, values?: Record<string, string | number>) => string;

/** Düzenleme bağlamı: eski çekin yaprağı, numarası ve banka hesabı. */
export type LeafGuardEditing = {
  currentLeafId: string | null;
  currentNumber: string | null;
  currentFundAccountId: string | null;
};

/** Baştaki sıfırlar önemsiz ("471484" = "0471484"; ZTO CheckLeafLookup). */
function normalized(number: string): string {
  return number.trim().replace(/^0+/, "");
}

/**
 * Saf karar: `leaves` arama sonucu (`undefined` = henüz yok). İletiler CLG birebir; sunucu metni
 * (banka, seri) düz metin olarak birleştirilir, HTML olarak basılmaz.
 */
export function checkLeafGuardResult(
  input: {
    number: string;
    fundAccountId: string | null | undefined;
    leaves: readonly CheckLeaf[] | undefined;
    editing?: LeafGuardEditing | null;
  },
  tm: Tm,
): CheckLeafGuardResult {
  const text = input.number.trim();
  if (!leafLookupReady(text) || normalized(text) === "") return { state: "idle", message: null };
  const editing = input.editing ?? null;
  // Düzenleme: eski çek yapraksız ve numara + banka aynı → sunucu §3.3 #4 istisnası.
  if (
    editing &&
    !editing.currentLeafId &&
    editing.currentNumber !== null &&
    normalized(editing.currentNumber) === normalized(text) &&
    (editing.currentFundAccountId ?? "") === (input.fundAccountId ?? "")
  ) {
    return { state: "free", message: null };
  }
  if (input.leaves === undefined) return { state: "idle", message: null };
  const matches = input.leaves.filter((leaf) => normalized(leaf.number) === normalized(text));
  const others = matches.filter((leaf) => leaf.id !== editing?.currentLeafId);
  if (matches.length > 0 && others.length === 0) return { state: "free", message: null };
  if (others.length === 0) {
    return { state: "free", message: tm("check.leafGuardOk") };
  }
  const used = others.some((leaf) => leaf.status === "USED");
  const parts = others.map((leaf) => {
    const bank = leaf.fundBankName || tm("check.leafGuardUnknownBank");
    const status = tm(`check.leafGuardStatus.${leaf.status}`);
    const serial = leaf.checkBookSerial
      ? ` · ${tm("check.leafGuardBook")}: ${leaf.checkBookSerial}`
      : "";
    return `${bank} (${status} ${tm("check.leafGuardLeaf")}${serial})`;
  });
  return {
    state: used ? "leafUsed" : "leafManualForbidden",
    message: `${tm("check.leafGuardLead")} ${parts.join(", ")} ${tm(
      used ? "check.leafGuardUsedTail" : "check.leafGuardManualTail",
    )}`,
  };
}

/** Değer `delay` ms değişmeden kalınca döner (yazarken her tuşta istek atılmaz). */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * `useCheckLeafGuard(number, fundAccountId, editing?)`: yalnız `enabled` (manuel kip) iken arar;
 * yanıt yazılan numarayla eşleşmiyorsa (eskimiş) sonuç `idle` kalır.
 */
export function useCheckLeafGuard(
  number: string,
  fundAccountId: string | null | undefined,
  editing: LeafGuardEditing | null = null,
  options: { enabled?: boolean; companyId?: string | null } = {},
): CheckLeafGuardResult {
  const { tm } = useModalText();
  const enabled = options.enabled ?? true;
  const text = number.trim();
  const debounced = useDebounced(text, LEAF_GUARD_DEBOUNCE_MS);
  const lookup = useCheckLeafLookup(debounced, fundAccountId, {
    enabled: enabled && !!fundAccountId && debounced === text,
    companyId: options.companyId,
  });
  const leaves = debounced === text && !lookup.isFetching ? lookup.data : undefined;
  return useMemo<CheckLeafGuardResult>(
    () =>
      enabled && fundAccountId
        ? checkLeafGuardResult({ number: text, fundAccountId, leaves, editing }, tm)
        : { state: "idle", message: null },
    [enabled, fundAccountId, text, leaves, editing, tm],
  );
}

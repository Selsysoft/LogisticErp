import type { Fund, FundTransferType } from "../../../../pages/finance/types";

/*
 * Transfer Merkezi hedef budama kuralları (12.2_TASARIM §5.11; ZTO wwwroot/js/zt/bankstatement/index.js
 * `applyTargetBankConstraints` :592-704, `applyExchangeTargetBankConstraints` :706-795,
 * `applyBankCashCurrencyConstraints` :1260-1311). Sunucudaki §3.3.1 adım 5 kuralının aynasıdır; sunucu
 * yine denetler. Metinler `ztoFinans:transferCenter.*` anahtarlarıdır (bileşen çevirir).
 */

/** Üç transfer tipi kartı (ZTO `selectTransferType`: "Virman" / "Döviz Bozum" / "BankCash"). */
export type TransferMode = "VIRMAN" | "FX" | "BANKCASH";
/** `#virmanTransferType`: "" (Seçiniz) / Virman / EFT / Havale. */
export type VirmanSubType = "" | "VIREMENT" | "EFT" | "WIRE";
/** `#bankCashDirection`: "" (Seçiniz) / Bankadan Kasaya / Kasadan Bankaya / Kasadan Kasaya. */
export type BankCashDirection = "" | "BANK_TO_CASH" | "CASH_TO_BANK" | "CASH_TO_CASH";

/** Pasif hedef seçeneğinin nedeni (ZTO `data-disable-reason`). */
export type TargetReason =
  | "needSource"
  | "needTargetWorkPlace"
  | "sameAccount"
  | "currencyMismatch"
  | "notSameBankForVirman"
  | "sameBankSameWorkPlace"
  | "fxSameCurrency"
  | "companyMismatch";

/** `#targetBankWarning` özet ipuçları (bsjs:688-693 ve :765-769 sırasıyla). */
export type TargetHint =
  | "needSource"
  | "needTargetWorkPlace"
  | "currencyMismatch"
  | "sameBankSameWorkPlace"
  | "notSameBankForVirman"
  | "sameAccount"
  | "fxSameCurrency"
  | "fxSameBankAndCurrency"
  | "companyMismatch";

export type TargetOption = { fund: Fund; reason: TargetReason | null };

export type TargetEvaluation = {
  options: TargetOption[];
  /** Hedef seçici etkin mi (ZTO `canEnableTarget`). */
  enabled: boolean;
  hints: TargetHint[];
  /** "info": ipuçları (text-info); "warning": "Seçilebilir hedef banka yok." (text-warning). */
  tone: "info" | "warning" | null;
};

/** Gerçek banka anahtarı: büyük/küçük harf ve boşluk duyarsız (sunucu `SAME_BANK` kuralı). */
export function bankKey(fund: Pick<Fund, "bankName" | "name">): string {
  return (fund.bankName ?? fund.name).trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

/** Vadesiz ve aktif fonlardan belirli tür ve iş yerinde olanlar (ZTO `GetBanksByWorkPlace`). */
export function fundsIn(funds: readonly Fund[], kind: Fund["kind"], branchId: string): Fund[] {
  if (!branchId) return [];
  return funds.filter(
    (fund) =>
      fund.kind === kind &&
      fund.branchId === branchId &&
      fund.active &&
      fund.accountType === "DEMAND",
  );
}

/** Hedef iş yeri ayrı seçilir mi: EFT/Havale ve Döviz (Virman'da hedef iş yeri kaynağa kilitli). */
export function requiresTargetBranch(mode: TransferMode, subType: VirmanSubType): boolean {
  return mode === "FX" || (mode === "VIRMAN" && (subType === "EFT" || subType === "WIRE"));
}

/** Virman'da hedef iş yeri kaynak iş yeridir (bsjs `applyVirmanSubTypeRules`). */
export function effectiveTargetBranch(
  mode: TransferMode,
  subType: VirmanSubType,
  sourceBranchId: string,
  targetBranchId: string,
): string {
  return mode === "VIRMAN" && subType === "VIREMENT" ? sourceBranchId : targetBranchId;
}

const VIRMAN_HINTS: TargetHint[] = [
  "needSource",
  "needTargetWorkPlace",
  "currencyMismatch",
  "sameBankSameWorkPlace",
  "notSameBankForVirman",
  "sameAccount",
];
const FX_HINTS: TargetHint[] = [
  "needSource",
  "needTargetWorkPlace",
  "fxSameCurrency",
  "fxSameBankAndCurrency",
  "sameAccount",
  "companyMismatch",
];

function virmanReason(
  subType: VirmanSubType,
  source: Fund | null,
  option: Fund,
  sourceBranchId: string,
  targetBranchId: string,
): TargetReason | null {
  if (!source) return "needSource";
  if ((subType === "EFT" || subType === "WIRE") && !targetBranchId) return "needTargetWorkPlace";
  if (option.id === source.id) return "sameAccount";
  if (option.currency !== source.currency) return "currencyMismatch";
  const sameBank = bankKey(option) === bankKey(source);
  if (subType === "VIREMENT") {
    if (!sameBank) return "notSameBankForVirman";
    // Virman aynı iş yerinde kalır; şirket farkı oluşamaz ama kural sunucuyla aynı kalsın.
    return option.companyId === source.companyId ? null : "companyMismatch";
  }
  if (subType === "EFT" || subType === "WIRE") {
    const sameWorkPlace = !!sourceBranchId && sourceBranchId === targetBranchId;
    if (sameWorkPlace && sameBank) return "sameBankSameWorkPlace";
  }
  return null;
}

function fxReason(source: Fund | null, option: Fund, targetBranchId: string): TargetReason | null {
  if (!source) return "needSource";
  if (!targetBranchId) return "needTargetWorkPlace";
  if (option.id === source.id) return "sameAccount";
  if (option.currency === source.currency) return "fxSameCurrency";
  // Şirketler arası döviz bozumu yok (OK-12.2-12); iş yeri kısıtı yok (bsjs:739-741).
  if (option.companyId !== source.companyId) return "companyMismatch";
  return null;
}

/**
 * Virman/EFT/Havale ve Döviz kipinde hedef banka seçenekleri, pasif nedenleri ve özet ipucu.
 * `funds`: tüm vadesiz aktif fonlar (konsolide liste); hedef havuzu etkin hedef iş yerinin bankalarıdır.
 */
export function evaluateBankTargets(input: {
  mode: "VIRMAN" | "FX";
  subType: VirmanSubType;
  source: Fund | null;
  sourceBranchId: string;
  targetBranchId: string;
  funds: readonly Fund[];
}): TargetEvaluation {
  const { mode, subType, source, sourceBranchId, funds } = input;
  const targetBranchId = effectiveTargetBranch(mode, subType, sourceBranchId, input.targetBranchId);
  if (mode === "VIRMAN" && !subType) {
    return { options: [], enabled: false, hints: [], tone: null };
  }
  if (requiresTargetBranch(mode, subType) && !targetBranchId) {
    // Havuz boş: ZTO seçicide "Önce hedef iş yeri seçin" yazar; FX'te ipucu da gösterilir (§5.11).
    const hints: TargetHint[] = source
      ? ["needTargetWorkPlace"]
      : ["needSource", "needTargetWorkPlace"];
    return { options: [], enabled: false, hints, tone: "info" };
  }
  const pool = fundsIn(funds, "BANK", targetBranchId);
  const counts = new Map<TargetHint, number>();
  const bump = (hint: TargetHint) => counts.set(hint, (counts.get(hint) ?? 0) + 1);
  let enabledCount = 0;
  const options = pool.map((fund) => {
    const reason =
      mode === "FX"
        ? fxReason(source, fund, targetBranchId)
        : virmanReason(subType, source, fund, sourceBranchId, targetBranchId);
    if (reason) {
      bump(reason);
      if (reason === "fxSameCurrency" && source && bankKey(fund) === bankKey(source)) {
        bump("fxSameBankAndCurrency");
      }
    } else {
      enabledCount++;
    }
    return { fund, reason };
  });
  const enabled = !!source && !!targetBranchId;
  const order = mode === "FX" ? FX_HINTS : VIRMAN_HINTS;
  const hints = order.filter((hint) => (counts.get(hint) ?? 0) > 0);
  const tone = hints.length > 0 ? "info" : enabled && enabledCount === 0 ? "warning" : null;
  return { options, enabled, hints, tone };
}

export type BankCashEvaluation = {
  options: TargetOption[];
  /** "Sadece aynı para birimine sahip hedef hesaplar seçilebilir." (CashToCash ayrı metin). */
  hint: "bankCashSameCurrency" | "cashToCashSameCurrency" | null;
};

/** Banka & Kasa kipinde kaynak hesap türü. */
export function bankCashSourceKind(direction: BankCashDirection): Fund["kind"] {
  return direction === "BANK_TO_CASH" ? "BANK" : "CASH";
}

/** Banka & Kasa kipinde hedef hesap türü. */
export function bankCashTargetKind(direction: BankCashDirection): Fund["kind"] {
  return direction === "CASH_TO_BANK" ? "BANK" : "CASH";
}

/** Banka & Kasa hedef seçenekleri: farklı para birimi ve (Kasadan Kasaya'da) aynı kasa pasif. */
export function evaluateBankCashTargets(input: {
  direction: BankCashDirection;
  source: Fund | null;
  targetBranchId: string;
  funds: readonly Fund[];
}): BankCashEvaluation {
  const { direction, source, targetBranchId, funds } = input;
  if (!direction) return { options: [], hint: null };
  const pool = fundsIn(funds, bankCashTargetKind(direction), targetBranchId);
  const options = pool.map((fund) => {
    let reason: TargetReason | null = null;
    if (source && fund.currency !== source.currency) reason = "currencyMismatch";
    else if (direction === "CASH_TO_CASH" && source && fund.id === source.id)
      reason = "sameAccount";
    return { fund, reason };
  });
  const hint = !source
    ? null
    : direction === "CASH_TO_CASH"
      ? "cashToCashSameCurrency"
      : "bankCashSameCurrency";
  return { options, hint };
}

/** Kart + alt tür/yön → sunucu transfer türü; seçilmemişse null. */
export function transferTypeOf(
  mode: TransferMode,
  subType: VirmanSubType,
  direction: BankCashDirection,
): FundTransferType | null {
  if (mode === "FX") return "FX_EXCHANGE";
  if (mode === "BANKCASH") return direction || null;
  return subType || null;
}

/** Şirketler arası virmana uygun türler (VIRMAN ve Döviz yasak — OK-12.2-12, OK-12.2-13). */
export function allowsIntercompany(type: FundTransferType | null): boolean {
  return (
    type === "EFT" ||
    type === "WIRE" ||
    type === "BANK_TO_CASH" ||
    type === "CASH_TO_BANK" ||
    type === "CASH_TO_CASH"
  );
}

/** Kaynak ve hedef farklı şirketteyse ve tür izin veriyorsa şirketler arası kip. */
export function isIntercompany(
  type: FundTransferType | null,
  source: Pick<Fund, "companyId"> | null,
  target: Pick<Fund, "companyId"> | null,
): boolean {
  return !!source && !!target && source.companyId !== target.companyId && allowsIntercompany(type);
}

/**
 * Hedef iş yeri seçicisinin şirket süzgeci: Döviz'de yalnız kaynak şirket (şirketler arası döviz yok);
 * EFT/Havale ve Banka & Kasa'da tüm şirketler (null). Kaynak iş yeri seçilmemişse null.
 */
export function targetBranchCompany(
  mode: TransferMode,
  sourceCompanyId: string | null,
): string | null {
  return mode === "FX" ? sourceCompanyId : null;
}

/** `#transferTypeInfoAlert` metni (bsjs:560-590). */
export function infoAlertKey(
  mode: TransferMode | null,
  subType: VirmanSubType,
  direction: BankCashDirection,
): string {
  if (mode === "VIRMAN") {
    if (subType === "VIREMENT") return "info.virman";
    if (subType === "EFT") return "info.eft";
    if (subType === "WIRE") return "info.havale";
    return "info.virmanPick";
  }
  if (mode === "FX") return "info.fx";
  if (mode === "BANKCASH") {
    if (direction === "BANK_TO_CASH") return "info.bankToCash";
    if (direction === "CASH_TO_BANK") return "info.cashToBank";
    if (direction === "CASH_TO_CASH") return "info.cashToCash";
    return "info.bankCashPick";
  }
  return "info.default";
}

/** "Kaynak Tutar" etiketi (bsjs `updateSourceAmountLabel` :546-558). */
export function sourceAmountLabelKey(mode: TransferMode, subType: VirmanSubType): string {
  if (mode === "BANKCASH") return "form.transferAmount";
  if (mode === "VIRMAN") {
    if (subType === "VIREMENT") return "form.virmanAmount";
    if (subType === "EFT") return "form.eftAmount";
    if (subType === "WIRE") return "form.havaleAmount";
  }
  return "form.sourceAmount";
}

/**
 * Kaynak banka seçicisi etkin mi (bsjs:66-79, :1384-1478): Virman'da iş yeri + alt tür, Döviz'de
 * iş yeri, Banka & Kasa'da yön + iş yeri.
 */
export function sourceEnabled(
  mode: TransferMode,
  subType: VirmanSubType,
  direction: BankCashDirection,
  sourceBranchId: string,
): boolean {
  if (!sourceBranchId) return false;
  if (mode === "VIRMAN") return !!subType;
  if (mode === "BANKCASH") return !!direction;
  return true;
}

/** "Önce transfer tipini seçiniz." ipucu: Virman kartı, iş yeri seçili, alt tür boş (bsjs:70-72). */
export function showsSourceTypeHint(
  mode: TransferMode,
  subType: VirmanSubType,
  sourceBranchId: string,
): boolean {
  return mode === "VIRMAN" && !subType && !!sourceBranchId;
}

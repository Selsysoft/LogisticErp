/*
 * Finansal Bilanço (ZTO FinancialBalanceSheet/Index) saf mantığı (12.8_TASARIM §5.6). İşaret
 * Blackrose: `net = receivable − collection − (debt − payment)`; > 0 cari bize borçlu. ZTO'nun ters
 * işaret hatası (FBSC:258) düzeltildi; etiketler ve renkler ZTO'daki anlamlarıyla doğru tarafa:
 * "(+) Borçlu Bakiye" = bize borçlu (kırmızı), "(−) Alacaklı Bakiye" = biz borçluyuz (yeşil).
 * Tutarlar ZTO gibi tam sayı (`N0`); toplama yok (sunucu hesaplar), yalnız gösterim ve süzme.
 */
import type {
  BalanceSheet,
  BalanceSheetAccount,
  BalanceSheetCompany,
  BalanceSheetCurrency,
  BalanceSheetIntercompany,
  BalanceSheetWorkplace,
  ReportRate,
} from "../../../../pages/finance/types";
import { addDec, cmpDec, subDec, type DecimalInput } from "../../../decimal";
import { currencySymbol, formatN2, formatNumber } from "../../../format";

export type NetKind = "debtor" | "creditor" | "balanced";

/** Net yönü: > 0 bize borçlu ("Borçlu Bakiye"), < 0 biz borçluyuz ("Alacaklı Bakiye"). */
export function netKind(net: DecimalInput): NetKind {
  const sign = cmpDec(net, 0);
  return sign > 0 ? "debtor" : sign < 0 ? "creditor" : "balanced";
}

/** ZTO satır içi renkleri (FBS:595-596): rozet/özet çerçeve ve zemin. */
export const NET_COLORS: Record<NetKind, { color: string; bg: string }> = {
  debtor: { color: "#dc2626", bg: "#fef2f2" },
  creditor: { color: "#059669", bg: "#f0fdf4" },
  balanced: { color: "#64748b", bg: "#f1f5f9" },
};

/** Yön oku (FBS:661-662, :715-716): bize borçlu yukarı, biz borçluyuz aşağı, dengede yok. */
export function netArrow(net: DecimalInput): "fa-arrow-up" | "fa-arrow-down" | null {
  const kind = netKind(net);
  return kind === "debtor" ? "fa-arrow-up" : kind === "creditor" ? "fa-arrow-down" : null;
}

/** Cari bakiye sınıfı (FBS:706): `borcli` / `alacakli` / `denge` (gruptan bağımsız tek işaret kuralı). */
export function balanceClass(amount: DecimalInput): "borcli" | "alacakli" | "denge" {
  const kind = netKind(amount);
  return kind === "debtor" ? "borcli" : kind === "creditor" ? "alacakli" : "denge";
}

export type IntercompanyDirection = "receivable" | "payable" | "balanced";

/**
 * Grup şirketi bakiyesi (OK-12.8-11): > 0 alacaklıyız (`fa-long-arrow-alt-left text-danger`, ZTO
 * `NetBalance > 0` görünümü), < 0 borçluyuz (`-right text-success`), 0 dengede (`fa-equals`).
 */
export function intercompanyView(amount: DecimalInput): {
  direction: IntercompanyDirection;
  icon: string;
  color: string;
} {
  const kind = netKind(amount);
  if (kind === "debtor") {
    return {
      direction: "receivable",
      icon: "fas fa-long-arrow-alt-left text-danger",
      color: "#dc2626",
    };
  }
  if (kind === "creditor") {
    return {
      direction: "payable",
      icon: "fas fa-long-arrow-alt-right text-success",
      color: "#059669",
    };
  }
  return { direction: "balanced", icon: "fas fa-equals text-muted", color: "#64748b" };
}

/** ZTO `fmt0`: tam sayı tr-TR ("1.234"). */
export function n0(value: DecimalInput): string {
  return formatNumber(addDec(value, 0), 0);
}

/** |x| (gösterim için; ZTO `Math.Abs`). */
export function absText(value: DecimalInput): string {
  return cmpDec(value ?? 0, 0) < 0 ? subDec(0, value) : addDec(value, 0);
}

/** Genel net pozitif mi (FBS:525 `grandNet >= 0` "Pozitif"). */
export function isNonNegative(value: DecimalInput): boolean {
  return cmpDec(value, 0) >= 0;
}

export type CompanyGroup = {
  companyId: string;
  companyName: string;
  /** Şirket düzeyi brüt özet (Rev 1 F2); şirket `companies[]`'te yoksa null. */
  summary: BalanceSheetCompany | null;
  workplaces: BalanceSheetWorkplace[];
};

/**
 * İş yeri kartları ≥ 2 şirkette şirkete göre gruplanır (Blackrose eki): grup sırası `companies[]`
 * sırası, ardından yalnız kartlarda görülen şirketler; kart sırası sunucu sırası. Tek şirkette tek grup.
 */
export function groupWorkplaces(
  sheet: Pick<BalanceSheet, "companies" | "workplaces">,
): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();
  for (const company of sheet.companies) {
    groups.set(company.companyId, {
      companyId: company.companyId,
      companyName: company.companyName,
      summary: company,
      workplaces: [],
    });
  }
  for (const workplace of sheet.workplaces) {
    let group = groups.get(workplace.companyId);
    if (!group) {
      group = {
        companyId: workplace.companyId,
        companyName: workplace.companyName,
        summary: null,
        workplaces: [],
      };
      groups.set(workplace.companyId, group);
    }
    group.workplaces.push(workplace);
  }
  return [...groups.values()].filter((group) => group.workplaces.length > 0);
}

/** Tahsil / Ödenecek tutarı: çek + senet (FBS:644-653; senet Blackrose eki). */
export function receivedTotal(block: BalanceSheetCurrency): string {
  return addDec(block.receivedChecks, block.receivedNotes);
}

export function issuedTotal(block: BalanceSheetCurrency): string {
  return addDec(block.issuedChecks, block.issuedNotes);
}

/** Çek/senet adet metni parçaları: "{n} çek" + (senet varsa) " · {m} senet". */
export function countParts(
  checkCount: number,
  noteCount: number,
): { checks: number; notes: number | null } {
  return { checks: checkCount, notes: noteCount > 0 ? noteCount : null };
}

/** Bilgi satırı gösterilsin mi (değer ≠ 0; KMH ve açık kaynaklı kur farkı, Rev 1 F1/F6). */
export function hasValue(value: DecimalInput): boolean {
  return cmpDec(value ?? 0, 0) !== 0;
}

/** İş yeri cari listesi araması (FBS `fbsFilterCariList`): ad ya da kod, tr küçük harf. */
export function filterAccounts(
  accounts: readonly BalanceSheetAccount[],
  query: string,
): BalanceSheetAccount[] {
  const q = query.trim().toLocaleLowerCase("tr");
  if (!q) return accounts.slice();
  return accounts.filter(
    (account) =>
      !account.masked &&
      ((account.accountName ?? "").toLocaleLowerCase("tr").includes(q) ||
        (account.accountCode ?? "").toLocaleLowerCase("tr").includes(q)),
  );
}

/** İş yerinin şirketine ait grup şirketi bakiyeleri (para birimi başına satır). */
export function intercompanyRows(
  rows: readonly BalanceSheetIntercompany[],
  companyId: string,
): Array<{ key: string; row: BalanceSheetIntercompany; currency: string; amount: string }> {
  return rows
    .filter((row) => row.companyId === companyId)
    .flatMap((row) =>
      row.balances.map((balance) => ({
        key: `${row.accountId}|${balance.currency}`,
        row,
        currency: balance.currency,
        amount: balance.amount,
      })),
    );
}

/**
 * TCMB kur bilgisi (FBS:842-852): iş yerinde bloğu olan TL dışı para birimleri, "1 $ = 32,50 ₺"
 * parçaları " · " ile; kuru olmayan atlanır.
 */
export function rateInfo(
  rates: readonly ReportRate[],
  currencies: readonly Pick<BalanceSheetCurrency, "currency">[],
): string {
  const wanted = new Set(
    currencies.map((block) => block.currency).filter((code) => code !== "TRY"),
  );
  return rates
    .filter((rate) => wanted.has(rate.currency))
    .map((rate) => `1 ${currencySymbol(rate.currency)} = ${formatN2(rate.rate)} ₺`)
    .join(" · ");
}

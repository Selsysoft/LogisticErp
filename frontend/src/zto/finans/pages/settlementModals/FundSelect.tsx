import { useEffect, useMemo, useRef } from "react";
import { useFundList } from "../../../../pages/finance/fundApi";
import { ZtoSearchableSelect } from "../../../components";
import type { FundSelectProps } from "./index";
import { useModalText } from "./parts";
import { fundLabel } from "./settlementFormLogic";

/**
 * Banka/kasa seçici (ZTO `#CashID`, `#BankID`, `#CheckBankID`, `#BillBankID`; 12.2a §5.9,
 * OK-12.2a-13): `GET /finance/funds?branchId&kind&active=true` (+ `currency` yalnız ciro kilidinde).
 * İş yeri boşken tek seçenek "Önce iş yeri seçiniz" ve devre dışı. Pasif fon listelenmez. Seçili değer
 * listede bulununca fon nesnesi bir kez bildirilir (para birimi kilidi); bulunmazsa seçim temizlenir.
 */
export function FundSelect({
  id,
  kind,
  branchId,
  currency,
  companyId,
  value,
  onChange,
  disabled,
  ariaLabelledBy,
}: FundSelectProps) {
  const { tm } = useModalText();
  const funds = useFundList(
    {
      branchIds: branchId ? [branchId] : undefined,
      kind,
      active: true,
      currency: currency || undefined,
      companyId: companyId === undefined ? undefined : companyId,
    },
    { enabled: !!branchId },
  );
  const list = useMemo(
    () => (branchId ? (funds.data ?? []).filter((fund) => fund.active && fund.kind === kind) : []),
    [funds.data, branchId, kind],
  );
  const options = useMemo(
    () => list.map((fund) => ({ value: fund.id, label: fundLabel(fund) })),
    [list],
  );

  // Seçili değerin fonunu (ön seçim, düzenleme) bir kez bildir; listede yoksa temizle.
  const reported = useRef<string>("");
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    if (!value) {
      reported.current = "";
      return;
    }
    if (!branchId || funds.isFetching || !funds.data || reported.current === value) return;
    reported.current = value;
    const fund = list.find((item) => item.id === value) ?? null;
    latest.current(fund ? value : "", fund);
  }, [value, list, branchId, funds.isFetching, funds.data]);

  const placeholder = !branchId
    ? tm("fund.selectBranchFirst")
    : funds.isPending
      ? tm("shared.loading")
      : tm(kind === "CASH" ? "fund.cashLabel" : "fund.bankLabel");

  return (
    <ZtoSearchableSelect
      id={id}
      ariaLabelledBy={ariaLabelledBy}
      value={branchId ? value : ""}
      onChange={(next) => {
        reported.current = next;
        onChange(next, list.find((fund) => fund.id === next) ?? null);
      }}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={kind === "CASH" ? tm("fund.searchCash") : tm("fund.searchBank")}
      noResultsText={kind === "CASH" ? tm("fund.noCash") : tm("fund.noBank")}
      disabled={disabled || !branchId}
      className="zt-payment-select2"
    />
  );
}

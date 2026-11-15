import { useBankAccounts } from "../../../../pages/finance/accountApi";
import type { CounterpartyBankSelectProps } from "./index";
import { useModalText } from "./parts";
import { bankAccountLabel, slashDate, todayIso } from "./settlementFormLogic";

/**
 * Carinin banka hesabı (ZTO `#CustomerBankAccountID`, 12.2a §5.9, OK-12.2a-14): `GET
 * /finance/accounts/{id}/bank-accounts` (maskeli). Seçilince açıklama cümlesi "[{banka} - {şube}] -
 * {gg/AA/yyyy} - {maskeli IBAN} iban bilgisine sahip hesaba yatırılmıştır." üretilir (hesap sahibi adı
 * yok — S-8); personel carisinde cümle üretilmez (Rev 1 SEC-01). Etiket ve yardım modaldadır.
 */
export function CounterpartyBankSelect({
  id = "CustomerBankAccountID",
  accountId,
  accountType,
  date,
  value,
  onChange,
  onDescription,
  disabled,
}: CounterpartyBankSelectProps) {
  const { tm } = useModalText();
  const accounts = useBankAccounts(accountId ?? undefined);
  const list = (accounts.data ?? []).filter((account) => account.active);
  const employee = accountType === "EMPLOYEE";

  const select = (next: string) => {
    onChange(next);
    if (!onDescription) return;
    const account = list.find((item) => item.id === next);
    if (!account || employee) {
      onDescription(null);
      return;
    }
    onDescription(
      tm("counterparty.sentence", {
        bank: account.bankName,
        branch: account.branchName ?? "",
        date: slashDate(date || todayIso()),
        iban: account.ibanMasked ?? "",
      }),
    );
  };

  let firstOption: string;
  if (!accountId) firstOption = tm("counterparty.selectAccountFirst");
  else if (accounts.isPending) firstOption = tm("shared.loading");
  else if (accounts.isError) firstOption = tm("counterparty.loadFailed");
  else if (list.length === 0) firstOption = tm("counterparty.empty");
  else firstOption = tm("counterparty.placeholder");

  return (
    <select
      id={id}
      name="CustomerBankAccountID"
      className="form-control no-select2"
      value={list.some((item) => item.id === value) ? value : ""}
      onChange={(event) => select(event.target.value)}
      disabled={disabled || !accountId}
    >
      <option value="">{firstOption}</option>
      {list.map((account) => (
        <option key={account.id} value={account.id}>
          {bankAccountLabel(account)}
        </option>
      ))}
    </select>
  );
}

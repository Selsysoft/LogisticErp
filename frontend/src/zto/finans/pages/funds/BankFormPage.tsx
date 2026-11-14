import { FundFormPage } from "./FundForm";

/** Banka Yeni/Düzenle (ZTO BankIntroduction/Add, Edit; 12.2 §5.6). */
export function BankFormPage({ mode = "add" }: { mode?: "add" | "edit" }) {
  return <FundFormPage kind="BANK" mode={mode} />;
}

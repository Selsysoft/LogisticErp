import { FundFormPage } from "./FundForm";

/** Kasa Yeni/Düzenle (ZTO CashIntroduction/Add, Edit; 12.2 §5.8). */
export function CashFormPage({ mode = "add" }: { mode?: "add" | "edit" }) {
  return <FundFormPage kind="CASH" mode={mode} />;
}

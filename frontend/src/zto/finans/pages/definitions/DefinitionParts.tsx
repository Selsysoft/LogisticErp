import { ReactNode } from "react";

/** ZTO disableSubmitButton (WorkPlace/Add.cshtml:87-95): bekleme metni + dönen spinner. */
export function SubmitContent({
  pending,
  icon,
  idle,
  busy,
}: {
  pending: boolean;
  icon: string;
  idle: ReactNode;
  busy: ReactNode;
}) {
  return pending ? (
    <>
      <i className={icon} /> {busy} <i className="fas fa-spinner fa-spin" />
    </>
  ) : (
    <>
      <i className={icon} /> {idle}
    </>
  );
}

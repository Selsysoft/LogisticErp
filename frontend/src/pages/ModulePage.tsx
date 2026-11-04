import { useTranslation } from "react-i18next";
import { EmptyState } from "../components/EmptyState";

/** İşlevi sonraki fazlarda gelecek modüllerin yer tutucu ekranı. */
export function ModulePage({ label }: { label: string }) {
  const { t } = useTranslation();
  return <EmptyState title={t(label)} description={t("module.description")} />;
}

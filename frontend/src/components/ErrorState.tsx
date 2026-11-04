import { Alert, AlertTitle } from "@mui/material";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";

export function ErrorState({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const message = error instanceof Error ? error.message : String(error);
  const traceId = error instanceof ApiError ? error.body.traceId : null;
  const details = error instanceof ApiError ? (error.body.details ?? []) : [];

  return (
    <Alert severity="error">
      <AlertTitle>{t("error.title")}</AlertTitle>
      {message}
      {details.map((detail) => (
        <div key={detail}>{detail}</div>
      ))}
      {traceId && <div>{t("error.traceId", { traceId })}</div>}
    </Alert>
  );
}

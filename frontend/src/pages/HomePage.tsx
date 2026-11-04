import { Alert, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGet } from "../api/client";
import { ErrorState } from "../components/ErrorState";

export function HomePage() {
  const { t } = useTranslation();
  const ping = useQuery({
    queryKey: ["ping"],
    queryFn: () => apiGet<{ status: string }>("/ping"),
  });

  return (
    <>
      <Typography variant="h5" gutterBottom>
        {t("home.title")}
      </Typography>
      {ping.isPending && <Typography>{t("home.loading")}</Typography>}
      {ping.isError && <ErrorState error={ping.error} />}
      {ping.isSuccess && <Alert severity="success">{t("home.apiOk")}</Alert>}
    </>
  );
}

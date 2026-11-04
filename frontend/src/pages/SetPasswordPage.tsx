import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Link, Stack, TextField } from "@mui/material";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { apiRequest } from "../api/client";
import { session, tenantFromHost } from "../auth/session";
import { CenteredCard } from "../components/CenteredCard";

/** Davet kabulü ve şifre sıfırlama aynı ekranı kullanır. */
export function SetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token");
  const tenant = params.get("tenant");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenant && !tenantFromHost()) {
      session.setTenantCode(tenant);
    }
  }, [tenant]);

  const schema = z
    .object({ newPassword: z.string().min(1, t("common.required")), confirm: z.string() })
    .refine((values) => values.newPassword === values.confirm, {
      message: t("setPassword.mismatch"),
      path: ["confirm"],
    });
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ newPassword }: FormValues) => {
    setError(null);
    try {
      await apiRequest("POST", "/auth/password-reset/confirm", { token, newPassword });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!token) {
    return (
      <CenteredCard title={t("setPassword.title")}>
        <Alert severity="error">{t("setPassword.invalidLink")}</Alert>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard title={t("setPassword.title")}>
      {done ? (
        <Stack spacing={2}>
          <Alert severity="success">{t("setPassword.done")}</Alert>
          <Link component={RouterLink} to="/login">
            {t("login.title")}
          </Link>
        </Stack>
      ) : (
        <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t("setPassword.newPassword")}
            type="password"
            autoComplete="new-password"
            error={!!errors.newPassword}
            helperText={errors.newPassword?.message ?? t("setPassword.hint")}
            {...register("newPassword")}
          />
          <TextField
            label={t("setPassword.confirm")}
            type="password"
            autoComplete="new-password"
            error={!!errors.confirm}
            helperText={errors.confirm?.message}
            {...register("confirm")}
          />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {t("setPassword.submit")}
          </Button>
        </Stack>
      )}
    </CenteredCard>
  );
}

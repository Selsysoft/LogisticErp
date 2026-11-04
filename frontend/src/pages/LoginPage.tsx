import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Link, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Navigate, Link as RouterLink } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../api/client";
import { useAuthStore } from "../auth/authStore";
import { session, tenantFromHost } from "../auth/session";
import { CenteredCard } from "../components/CenteredCard";

export function LoginPage() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const login = useAuthStore((state) => state.login);
  const hostTenant = tenantFromHost();
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z.object({
    tenantCode: hostTenant ? z.string().optional() : z.string().min(1, t("common.required")),
    email: z.string().email(t("common.invalidEmail")),
    password: z.string().min(1, t("common.required")),
    totpCode: z.string().optional(),
  });
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tenantCode: session.getTenantCode() ?? "" },
  });

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await login(values);
    } catch (e) {
      if (e instanceof ApiError && e.body.code === "TOTP_REQUIRED") {
        setNeedsTotp(true);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <CenteredCard title={t("login.title")}>
      <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
        {error && <Alert severity="error">{error}</Alert>}
        {!hostTenant && (
          <TextField
            label={t("login.tenantCode")}
            autoComplete="organization"
            error={!!errors.tenantCode}
            helperText={errors.tenantCode?.message}
            {...register("tenantCode")}
          />
        )}
        <TextField
          label={t("login.email")}
          type="email"
          autoComplete="username"
          error={!!errors.email}
          helperText={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label={t("login.password")}
          type="password"
          autoComplete="current-password"
          error={!!errors.password}
          helperText={errors.password?.message}
          {...register("password")}
        />
        {needsTotp && (
          <TextField
            label={t("login.totpCode")}
            helperText={t("login.totpHint")}
            autoComplete="one-time-code"
            autoFocus
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            {...register("totpCode")}
          />
        )}
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          {t("login.submit")}
        </Button>
        <Link component={RouterLink} to="/forgot-password" variant="body2">
          {t("login.forgot")}
        </Link>
      </Stack>
    </CenteredCard>
  );
}

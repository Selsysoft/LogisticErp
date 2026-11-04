import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Link, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { z } from "zod";
import { apiRequest } from "../api/client";
import { session, tenantFromHost } from "../auth/session";
import { CenteredCard } from "../components/CenteredCard";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const hostTenant = tenantFromHost();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z.object({
    tenantCode: hostTenant ? z.string().optional() : z.string().min(1, t("common.required")),
    email: z.string().email(t("common.invalidEmail")),
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

  const onSubmit = async ({ tenantCode, email }: FormValues) => {
    setError(null);
    session.setTenantCode(hostTenant ? null : (tenantCode?.trim().toLowerCase() ?? null));
    try {
      await apiRequest("POST", "/auth/password-reset/request", { email });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <CenteredCard title={t("forgot.title")}>
      <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
        {sent && <Alert severity="success">{t("forgot.sent")}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {!hostTenant && (
          <TextField
            label={t("login.tenantCode")}
            error={!!errors.tenantCode}
            helperText={errors.tenantCode?.message}
            {...register("tenantCode")}
          />
        )}
        <TextField
          label={t("login.email")}
          type="email"
          error={!!errors.email}
          helperText={errors.email?.message}
          {...register("email")}
        />
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          {t("forgot.submit")}
        </Button>
        <Link component={RouterLink} to="/login" variant="body2">
          {t("forgot.back")}
        </Link>
      </Stack>
    </CenteredCard>
  );
}

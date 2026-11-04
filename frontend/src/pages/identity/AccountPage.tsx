import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { apiRequest } from "../../api/client";
import { useAuthStore } from "../../auth/authStore";
import { session } from "../../auth/session";
import { ErrorState } from "../../components/ErrorState";

export function AccountPage() {
  const { t } = useTranslation();
  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Typography variant="h5" component="h1">
        {t("account.title")}
      </Typography>
      <ChangePasswordCard />
      <TwoFactorCard />
    </Stack>
  );
}

function ChangePasswordCard() {
  const { t } = useTranslation();

  const schema = z
    .object({
      currentPassword: z.string().min(1, t("common.required")),
      newPassword: z.string().min(1, t("common.required")),
      confirm: z.string(),
    })
    .refine((values) => values.newPassword === values.confirm, {
      message: t("setPassword.mismatch"),
      path: ["confirm"],
    });
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Şifre değişince tüm token'lar geçersiz olur; kullanıcı yeniden giriş yapmalıdır.
  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: FormValues) =>
      apiRequest("POST", "/auth/password", { currentPassword, newPassword }),
    onSuccess: () => {
      session.clear();
      useAuthStore.setState({ status: "anonymous", me: null });
    },
  });

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          {t("account.changePassword")}
        </Typography>
        <Stack
          component="form"
          spacing={2}
          noValidate
          onSubmit={handleSubmit((values) => change.mutate(values))}
        >
          {change.isError && <ErrorState error={change.error} />}
          <TextField
            label={t("account.currentPassword")}
            type="password"
            autoComplete="current-password"
            error={!!errors.currentPassword}
            helperText={errors.currentPassword?.message}
            {...register("currentPassword")}
          />
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
          <Box>
            <Button type="submit" variant="contained" disabled={change.isPending}>
              {t("common.save")}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function TwoFactorCard() {
  const { t } = useTranslation();
  const enabled = useAuthStore((state) => state.me?.twoFactorEnabled ?? false);
  const reloadMe = useAuthStore((state) => state.reloadMe);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const setup = useMutation({
    mutationFn: () => apiRequest<{ secret: string }>("POST", "/auth/2fa/setup"),
    onSuccess: (data) => setSecret(data.secret),
  });
  const submit = useMutation({
    mutationFn: () =>
      apiRequest("POST", enabled ? "/auth/2fa/disable" : "/auth/2fa/enable", { code }),
    onSuccess: async () => {
      setSecret(null);
      setCode("");
      await reloadMe();
    },
  });

  const showCodeInput = enabled || secret !== null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          {t("account.twoFactor")}
        </Typography>
        <Stack spacing={2}>
          <Alert severity={enabled ? "success" : "info"}>
            {enabled ? t("account.twoFactorOn") : t("account.twoFactorOff")}
          </Alert>
          {setup.isError && <ErrorState error={setup.error} />}
          {submit.isError && <ErrorState error={submit.error} />}
          {secret && (
            <div>
              <Typography variant="body2">{t("account.secret")}</Typography>
              <Typography sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>
                {secret}
              </Typography>
            </div>
          )}
          {showCodeInput && (
            <TextField
              label={t("account.code")}
              value={code}
              autoComplete="one-time-code"
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
          <Box>
            {showCodeInput ? (
              <Button
                variant="contained"
                color={enabled ? "error" : "primary"}
                disabled={!code || submit.isPending}
                onClick={() => submit.mutate()}
              >
                {enabled ? t("account.twoFactorDisable") : t("account.confirm")}
              </Button>
            ) : (
              <Button variant="contained" disabled={setup.isPending} onClick={() => setup.mutate()}>
                {t("account.twoFactorStart")}
              </Button>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

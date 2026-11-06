import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { apiGet, apiRequest } from "../../api/client";
import { useAuthStore } from "../../auth/authStore";
import { MODULE_ITEMS } from "../../components/AppShell";
import { ErrorState } from "../../components/ErrorState";
import { PermissionInfo, Role } from "./types";

/** Satırlar izinler, sütunlar roller. Kilitli olmayan rollerde değişiklik hemen kaydedilir. */
export function RolesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const reloadMe = useAuthStore((state) => state.reloadMe);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const roles = useQuery({ queryKey: ["roles"], queryFn: () => apiGet<Role[]>("/identity/roles") });
  const permissions = useQuery({
    queryKey: ["permissions"],
    queryFn: () => apiGet<PermissionInfo[]>("/identity/permissions"),
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["roles"] });
    void reloadMe();
  };

  const toggle = useMutation({
    mutationFn: ({ role, permission, on }: { role: Role; permission: string; on: boolean }) =>
      apiRequest("PUT", `/identity/roles/${role.id}`, {
        code: role.code,
        name: role.name,
        priority: role.priority,
        landingPath: role.landingPath,
        permissions: on
          ? [...role.permissions, permission]
          : role.permissions.filter((code) => code !== permission),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/identity/roles/${id}`),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5" component="h1">
          {t("roles.title")}
        </Typography>
        <Button variant="contained" onClick={() => setAdding(true)}>
          {t("roles.add")}
        </Button>
      </Stack>
      {roles.isError && <ErrorState error={roles.error} />}
      {permissions.isError && <ErrorState error={permissions.error} />}
      {toggle.isError && <ErrorState error={toggle.error} />}
      {(roles.isPending || permissions.isPending) && <Typography>{t("common.loading")}</Typography>}
      {roles.isSuccess && permissions.isSuccess && (
        <TableContainer sx={{ maxHeight: "75vh" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 180 }}>{t("roles.permission")}</TableCell>
                {roles.data.map((role) => (
                  <TableCell key={role.id} align="center" sx={{ minWidth: 110 }}>
                    <div>{role.name}</div>
                    {role.locked ? (
                      <Typography variant="caption" color="text.secondary">
                        {t("roles.locked")}
                      </Typography>
                    ) : (
                      <Button size="small" color="error" onClick={() => setDeleting(role)}>
                        {t("common.delete")}
                      </Button>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {permissions.data.map((permission) => (
                <TableRow key={permission.code} hover>
                  <TableCell>{t(`permissions.${permission.code}`)}</TableCell>
                  {roles.data.map((role) => (
                    <TableCell key={role.id} align="center">
                      <Checkbox
                        size="small"
                        checked={role.permissions.includes(permission.code)}
                        disabled={role.locked || toggle.isPending}
                        slotProps={{
                          input: {
                            "aria-label": `${role.name}: ${t(`permissions.${permission.code}`)}`,
                          },
                        }}
                        onChange={(event) =>
                          toggle.mutate({
                            role,
                            permission: permission.code,
                            on: event.target.checked,
                          })
                        }
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {adding && (
        <AddRoleDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>{t("roles.deleteTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("roles.deleteBody", { name: deleting?.name })}</DialogContentText>
          {remove.isError && <ErrorState error={remove.error} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
          <Button
            color="error"
            disabled={remove.isPending}
            onClick={() => deleting && remove.mutate(deleting.id)}
          >
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function AddRoleDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();

  const schema = z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,48}$/, t("roles.codeHint")),
    name: z.string().min(1, t("common.required")),
    priority: z.coerce.number().int(),
    landingPath: z.string().min(1, t("common.required")),
  });
  // priority girdide metindir, doğrulamadan sonra sayıdır.
  type FormInput = z.input<typeof schema>;
  type FormValues = z.output<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", name: "", priority: 5, landingPath: "/dashboard" },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      apiRequest("POST", "/identity/roles", { ...values, permissions: [] }),
    onSuccess: onSaved,
  });

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        <DialogTitle>{t("roles.add")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {save.isError && <ErrorState error={save.error} />}
            <TextField
              label={t("roles.code")}
              error={!!errors.code}
              helperText={errors.code?.message ?? t("roles.codeHint")}
              {...register("code")}
            />
            <TextField
              label={t("roles.name")}
              error={!!errors.name}
              helperText={errors.name?.message}
              {...register("name")}
            />
            <TextField
              label={t("roles.priority")}
              type="number"
              error={!!errors.priority}
              helperText={errors.priority?.message ?? t("roles.priorityHint")}
              {...register("priority")}
            />
            <TextField
              select
              label={t("roles.landingPath")}
              defaultValue="/dashboard"
              {...register("landingPath")}
            >
              {MODULE_ITEMS.map((item) => (
                <MenuItem key={item.path} value={item.path}>
                  {t(item.label)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

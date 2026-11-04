import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { apiGet, apiRequest } from "../../api/client";
import { hasPermission, useAuthStore } from "../../auth/authStore";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Page, Role, User } from "./types";

type Editing = { mode: "invite" } | { mode: "edit"; user: User } | null;

export function UsersPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const me = useAuthStore((state) => state.me);
  const canManage = hasPermission(me, "USER_MANAGE");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ["users", page, size],
    queryFn: () => apiGet<Page<User>>(`/identity/users?page=${page}&size=${size}&sort=email`),
  });
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiGet<Role[]>("/identity/roles"),
  });

  const refresh = () => client.invalidateQueries({ queryKey: ["users"] });

  const resend = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/identity/users/${id}/resend-invite`),
    onSuccess: () => setNotice(t("users.resent")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/identity/users/${id}`),
    onSuccess: () => {
      setDeleting(null);
      void refresh();
    },
  });

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5" component="h1">
          {t("users.title")}
        </Typography>
        {canManage && (
          <Button variant="contained" onClick={() => setEditing({ mode: "invite" })}>
            {t("users.invite")}
          </Button>
        )}
      </Stack>
      {notice && (
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {users.isError && <ErrorState error={users.error} />}
      {resend.isError && <ErrorState error={resend.error} />}
      {users.isSuccess && users.data.totalElements === 0 && <EmptyState title={t("users.empty")} />}
      {users.isPending && <Typography>{t("common.loading")}</Typography>}
      {users.isSuccess && users.data.totalElements > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("users.fullName")}</TableCell>
                <TableCell>{t("users.email")}</TableCell>
                <TableCell>{t("users.roles")}</TableCell>
                <TableCell>{t("users.status")}</TableCell>
                {canManage && <TableCell align="right">{t("common.actions")}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.data.content.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.fullName}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {user.roles.map((role) => (
                        <Chip key={role.id} label={role.name} size="small" />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{t(`users.statusValues.${user.status}`)}</TableCell>
                  {canManage && (
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {user.status === "INVITED" && (
                        <Button size="small" onClick={() => resend.mutate(user.id)}>
                          {t("users.resend")}
                        </Button>
                      )}
                      <Button size="small" onClick={() => setEditing({ mode: "edit", user })}>
                        {t("common.edit")}
                      </Button>
                      <Button size="small" color="error" onClick={() => setDeleting(user)}>
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={users.data.totalElements}
            page={page}
            rowsPerPage={size}
            rowsPerPageOptions={[20, 50, 100]}
            onPageChange={(_, next) => setPage(next)}
            onRowsPerPageChange={(event) => {
              setSize(Number(event.target.value));
              setPage(0);
            }}
          />
        </TableContainer>
      )}

      {editing && (
        <UserDialog
          key={editing.mode === "edit" ? editing.user.id : "invite"}
          editing={editing}
          roles={roles.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message);
            void refresh();
          }}
        />
      )}

      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>{t("users.deleteTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("users.deleteBody", { email: deleting?.email })}</DialogContentText>
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

function UserDialog({
  editing,
  roles,
  onClose,
  onSaved,
}: {
  editing: NonNullable<Editing>;
  roles: Role[];
  onClose: () => void;
  onSaved: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const user = editing.mode === "edit" ? editing.user : null;

  const schema = z.object({
    email: user ? z.string() : z.string().email(t("common.invalidEmail")),
    fullName: z.string().min(1, t("common.required")),
    roleIds: z.array(z.string()).min(1, t("users.selectRole")),
    enabled: z.boolean(),
  });
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: user?.email ?? "",
      fullName: user?.fullName ?? "",
      roleIds: user?.roles.map((role) => role.id) ?? [],
      enabled: user ? user.status !== "DISABLED" : true,
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      user
        ? apiRequest("PUT", `/identity/users/${user.id}`, {
            fullName: values.fullName,
            roleIds: values.roleIds,
            enabled: values.enabled,
          })
        : apiRequest("POST", "/identity/users", {
            email: values.email,
            fullName: values.fullName,
            roleIds: values.roleIds,
          }),
    onSuccess: () => onSaved(user ? null : t("users.invited")),
  });

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        <DialogTitle>{user ? t("users.edit") : t("users.invite")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {save.isError && <ErrorState error={save.error} />}
            <TextField
              label={t("users.email")}
              type="email"
              disabled={!!user}
              error={!!errors.email}
              helperText={errors.email?.message}
              {...register("email")}
            />
            <TextField
              label={t("users.fullName")}
              error={!!errors.fullName}
              helperText={errors.fullName?.message}
              {...register("fullName")}
            />
            <Controller
              name="roleIds"
              control={control}
              render={({ field }) => (
                <FormControl error={!!errors.roleIds} component="fieldset">
                  <FormLabel component="legend">{t("users.roles")}</FormLabel>
                  <FormGroup>
                    {roles.map((role) => (
                      <FormControlLabel
                        key={role.id}
                        label={role.name}
                        control={
                          <Checkbox
                            checked={field.value.includes(role.id)}
                            onChange={(event) =>
                              field.onChange(
                                event.target.checked
                                  ? [...field.value, role.id]
                                  : field.value.filter((id) => id !== role.id),
                              )
                            }
                          />
                        }
                      />
                    ))}
                  </FormGroup>
                  {errors.roleIds && <FormHelperText>{errors.roleIds.message}</FormHelperText>}
                </FormControl>
              )}
            />
            {user && (
              <Controller
                name="enabled"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    label={t("users.enabled")}
                    control={
                      <Switch
                        checked={field.value}
                        onChange={(event) => field.onChange(event.target.checked)}
                      />
                    }
                  />
                )}
              />
            )}
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

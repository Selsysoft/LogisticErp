import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { ReactNode, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z, ZodTypeAny } from "zod";
import { apiGet } from "../../api/client";
import { hasPermission, useAuthStore } from "../../auth/authStore";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Account, Branch, Fund, Money, Page } from "./types";

const AMOUNT_PATTERN = /^\d+([.,]\d{1,4})?$/;

export function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function shiftDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Virgüllü girişi API'nin beklediği noktalı biçime çevirir. */
export function normalizeAmount(value: string) {
  return value.trim().replace(",", ".");
}

const amountFormat = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatAmount(value: string | number) {
  return amountFormat.format(Number(value));
}

export function formatMoney(money: Money) {
  return `${formatAmount(money.amount)} ${money.currency}`;
}

export function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function useCan(permission: string) {
  const me = useAuthStore((state) => state.me);
  return hasPermission(me, permission);
}

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: () => apiGet<Page<Branch>>("/organization/branches?size=200&sort=name"),
    select: (page) => page.content,
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: ["finance", "accounts", "options"],
    queryFn: () => apiGet<Page<Account>>("/finance/accounts?size=200&sort=name"),
    select: (page) => page.content,
  });
}

export function useFunds() {
  return useQuery({
    queryKey: ["finance", "funds"],
    queryFn: () => apiGet<Fund[]>("/finance/funds"),
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["finance", "currencies"],
    queryFn: () => apiGet<{ code: string; name: string }[]>("/finance/currencies"),
  });
}

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "amount" | "date" | "select" | "checkbox" | "integer";
  options?: Option[];
  required?: boolean;
  helperText?: string;
  defaultValue?: string | boolean;
}

type FormValues = Record<string, string | boolean>;

function schemaFor(fields: FieldDef[], requiredMessage: string, amountMessage: string) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const field of fields) {
    if (field.type === "checkbox") {
      shape[field.name] = z.boolean();
      continue;
    }
    let value: ZodTypeAny = z.string();
    if (field.type === "amount") {
      const pattern = z.string().regex(AMOUNT_PATTERN, amountMessage);
      value = field.required ? pattern : pattern.or(z.literal(""));
    } else if (field.required) {
      value = z.string().min(1, requiredMessage);
    }
    shape[field.name] = value;
  }
  return z.object(shape);
}

/** Tanımdan oluşan form penceresi: finans ekranlarının ortak giriş kalıbı. */
export function FormDialog({
  title,
  fields,
  submitLabel,
  onClose,
  onSubmit,
  onSaved,
}: {
  title: string;
  fields: FieldDef[];
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>, flags: Record<string, boolean>) => Promise<unknown>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const schema = useMemo(
    () => schemaFor(fields, t("common.required"), t("finance.field.amount")),
    [fields, t],
  );
  const defaults = useMemo(() => {
    const values: FormValues = {};
    fields.forEach((field) => {
      values[field.name] = field.defaultValue ?? (field.type === "checkbox" ? false : "");
    });
    return values;
  }, [fields]);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const strings: Record<string, string> = {};
      const flags: Record<string, boolean> = {};
      for (const field of fields) {
        const value = values[field.name];
        if (typeof value === "boolean") {
          flags[field.name] = value;
        } else {
          strings[field.name] = field.type === "amount" ? normalizeAmount(value) : value.trim();
        }
      }
      return onSubmit(strings, flags);
    },
    onSuccess: onSaved,
  });

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {save.isError && <ErrorState error={save.error} />}
            {fields.map((field) => (
              <Controller
                key={field.name}
                name={field.name}
                control={control}
                render={({ field: input }) =>
                  field.type === "checkbox" ? (
                    <FormControlLabel
                      label={field.label}
                      control={
                        <Checkbox
                          checked={input.value === true}
                          onChange={(event) => input.onChange(event.target.checked)}
                        />
                      }
                    />
                  ) : (
                    <TextField
                      label={field.label}
                      select={field.type === "select"}
                      type={field.type === "date" ? "date" : "text"}
                      required={field.required}
                      value={input.value}
                      onChange={input.onChange}
                      error={!!errors[field.name]}
                      helperText={
                        errors[field.name] ? String(errors[field.name]?.message) : field.helperText
                      }
                      slotProps={{
                        inputLabel: field.type === "date" ? { shrink: true } : undefined,
                        htmlInput: field.type === "amount" ? { inputMode: "decimal" } : undefined,
                      }}
                    >
                      {field.type === "select" &&
                        [
                          ...(field.required ? [] : [{ value: "", label: "—" }]),
                          ...(field.options ?? []),
                        ].map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                    </TextField>
                  )
                }
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {submitLabel ?? t("common.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export interface Column<T> {
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  pagination,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  pagination?: {
    count: number;
    page: number;
    size: number;
    onPage: (page: number) => void;
    onSize: (size: number) => void;
  };
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <EmptyState title={t("finance.empty")} />;
  }
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((column, index) => (
              <TableCell key={index} align={column.align}>
                {column.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} hover>
              {columns.map((column, index) => (
                <TableCell key={index} align={column.align}>
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pagination && (
        <TablePagination
          component="div"
          count={pagination.count}
          page={pagination.page}
          rowsPerPage={pagination.size}
          rowsPerPageOptions={[20, 50, 100]}
          onPageChange={(_, next) => pagination.onPage(next)}
          onRowsPerPageChange={(event) => {
            pagination.onSize(Number(event.target.value));
            pagination.onPage(0);
          }}
        />
      )}
    </TableContainer>
  );
}

export function usePaging(initialSize = 20) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialSize);
  return { page, size, setPage, setSize };
}

export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap" }}
    >
      <Typography variant="h6" component="h2">
        {title}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {children}
      </Stack>
    </Stack>
  );
}

export function QueryState({ isPending, error }: { isPending: boolean; error: unknown }) {
  const { t } = useTranslation();
  if (error) {
    return <ErrorState error={error} />;
  }
  return isPending ? <Typography>{t("common.loading")}</Typography> : null;
}

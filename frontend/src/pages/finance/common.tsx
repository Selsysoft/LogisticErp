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
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { apiGet } from "../../api/client";
import { hasPermission, useAuthStore } from "../../auth/authStore";
import {
  activeCompanies,
  formDefaultCompanyId,
  implicitCompanyId,
  isMultiCompany,
  useActiveCompanyId,
} from "../../auth/companyStore";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { branchOptions } from "./branchOptions";
import { withCompany } from "./companyQuery";
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

/** Kiracıda ≥2 aktif şirket var mı (şirket sütunları ve "Şirket › İş yeri" etiketleri). */
export function useMultiCompany() {
  return useAuthStore((state) => isMultiCompany(state.me?.companies));
}

/**
 * Form iş yeri seçenekleri (12.1a §6.13): yalnız aktifler ve aktif şirketinkiler; `optionsFor(keepId)`
 * düzenlenen kaydın iş yerini korur. Ad çözümü için `branches.data` tüm iş yerlerini içerir.
 */
export function useBranchOptions() {
  const branches = useBranches();
  const companyId = useActiveCompanyId();
  const multiCompany = useMultiCompany();
  const optionsFor = useCallback(
    (keepId?: string | null) =>
      branchOptions(branches.data ?? [], { keepId, companyId, multiCompany }),
    [branches.data, companyId, multiCompany],
  );
  return { branches, optionsFor, companyId, multiCompany };
}

/**
 * Belgenin şirketi (teklif, sözleşme, iş yeri): yalnız ≥2 aktif şirkette "Şirket" seçimi; varsayılan
 * aktif şirket, konsolidede varsayılan şirket (12.1a §6.13). Tek şirkette alan yoktur ve gövdeye
 * `companyId` konmaz (`companyIdOf`).
 */
export function useCompanyField(label: string): FieldDef[] {
  const companies = useAuthStore((state) => state.me?.companies);
  const activeCompanyId = useActiveCompanyId();
  if (!isMultiCompany(companies)) {
    return [];
  }
  return [
    {
      name: "companyId",
      label,
      type: "select",
      required: true,
      defaultValue: formDefaultCompanyId(activeCompanyId, companies) ?? "",
      options: activeCompanies(companies).map((company) => ({
        value: company.id,
        label: company.shortName,
      })),
    },
  ];
}

/**
 * `useCompanyField` değerini gövdeye taşır: seçildiyse `{ companyId }`; alan yoksa görünen tek şirket
 * varsayılan değilse onun id'si (`implicitCompanyId`, LIMITED kullanıcı), gerçek tek şirkette `{}`.
 */
export function companyIdOf(values: Record<string, string>): { companyId?: string } {
  const companyId = values.companyId || implicitCompanyId(useAuthStore.getState().me?.companies);
  return companyId ? { companyId } : {};
}

/**
 * MUI cari seçicilerinin listesi. 12.1 (OK-7): personel carileri FINANCE_EMPLOYEE_VIEW olmayan
 * kullanıcıya sunucuda süzülür; seçicide görünmez, eski kayıtlarda adı çözülemeyen satır "—" gösterir
 * (bilinçli; ayrı süzülmeyen seçenek ucu açılmaz).
 */
export function useAccounts() {
  return useQuery({
    queryKey: ["finance", "accounts", "options"],
    queryFn: () => apiGet<Page<Account>>("/finance/accounts?size=200&sort=name"),
    select: (page) => page.content,
  });
}

/**
 * Fon listesi. `companyId` verilirse (aktif şirket) yalnız o şirketin fonları; konsolidede tümü.
 * Seçenek listeleri parametresiz çağırır ve şirkete göre istemcide süzer (`fund.companyId`).
 */
export function useFunds(companyId: string | null = null) {
  return useQuery({
    queryKey: ["finance", "funds", companyId],
    queryFn: () => apiGet<Fund[]>(withCompany("/finance/funds", companyId)),
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
  type?: "text" | "amount" | "date" | "datetime" | "select" | "checkbox" | "integer";
  options?: Option[];
  /** Seçenekler formdaki diğer değerlere bağlıysa (örn. iş yerinin şirketine göre fonlar). */
  optionsFrom?: (values: Record<string, string | boolean>) => Option[];
  required?: boolean;
  helperText?: string;
  defaultValue?: string | boolean;
}

type FormValues = Record<string, string | boolean>;

function schemaFor(
  fields: FieldDef[],
  requiredMessage: string,
  amountMessage: string,
): z.ZodType<FormValues, FormValues> {
  const shape: Record<string, z.ZodType<string | boolean, string | boolean>> = {};
  for (const field of fields) {
    if (field.type === "checkbox") {
      shape[field.name] = z.boolean();
      continue;
    }
    let value: z.ZodType<string, string> = z.string();
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
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  // Yalnız bağımlı seçenekli formlar değerleri izler; diğerlerinde yeniden çizim değişmez.
  const dependent = fields.some((field) => field.optionsFrom);
  const current = dependent ? watch() : defaults;
  // Bağlı alan değişince (örn. iş yeri → fon, şirket → şube grubu, kaynak fon → hedef fon) seçeneklerden
  // düşen eski seçim temizlenir; aksi hâlde görünmeyen değer gönderilir ve sunucu 422 COMPANY_MISMATCH
  // döner. Bağımlılık dizisi bilerek yok: watch() her çizimde yeni nesne döndürür; setValue yalnız
  // uyuşmazlıkta çalışır, temizlenen "" bir sonraki turda uyuşmazlık sayılmaz ve döngü durur.
  useEffect(() => {
    if (!dependent) {
      return;
    }
    for (const field of fields) {
      if (!field.optionsFrom) {
        continue;
      }
      const value = current[field.name];
      if (
        typeof value === "string" &&
        value !== "" &&
        !field.optionsFrom(current).some((option) => option.value === value)
      ) {
        setValue(field.name, "", { shouldDirty: true });
      }
    }
  });

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
                      type={
                        field.type === "date"
                          ? "date"
                          : field.type === "datetime"
                            ? "datetime-local"
                            : "text"
                      }
                      required={field.required}
                      value={input.value}
                      onChange={input.onChange}
                      error={!!errors[field.name]}
                      helperText={
                        errors[field.name] ? String(errors[field.name]?.message) : field.helperText
                      }
                      slotProps={{
                        inputLabel:
                          field.type === "date" || field.type === "datetime"
                            ? { shrink: true }
                            : undefined,
                        htmlInput: field.type === "amount" ? { inputMode: "decimal" } : undefined,
                      }}
                    >
                      {field.type === "select" &&
                        [
                          ...(field.required ? [] : [{ value: "", label: "—" }]),
                          ...((field.optionsFrom ? field.optionsFrom(current) : field.options) ??
                            []),
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
  const companyId = useActiveCompanyId();
  const [pagedCompany, setPagedCompany] = useState(companyId);
  if (pagedCompany !== companyId) {
    // Aktif şirket değişince ilk sayfaya dönülür: sorgu anahtarı companyId içerir ve eski sayfa numarası
    // yeni şirkette boş sayfa getirirdi. Çizim sırasında durum düzeltme deseni; eski numarayla istek atmaz.
    setPagedCompany(companyId);
    setPage(0);
  }
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

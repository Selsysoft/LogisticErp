import { useQuery } from "@tanstack/react-query";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet } from "../../../../api/client";
import { useExpenseItems, useSaveExpenseItem } from "../../../../pages/finance/expenseApi";
import { useDebouncedValue } from "../../../../pages/finance/fundApi";
import type { ExpenseType } from "../../../../pages/finance/types";
import { ZtoDefinitionBreadcrumb, useZtoSnackbar } from "../../../components";
import { ZTO_FINANS_BASE, ZTO_SLUGS } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  DESCRIPTION_MAX_LENGTH,
  EMPTY_EXPENSE_ITEM_FORM,
  NAME_MAX_LENGTH,
  SUGGESTION_DEBOUNCE_MS,
  UNIT_MAX_LENGTH,
  canSubmitName,
  errorCodeOf,
  errorText,
  evaluateName,
  formOf,
  nameErrorText,
  nameSuccessText,
  submitNameStatus,
  submitTitle,
  suggestNames,
  toSaveRequest,
  type ExpenseItemFormValues,
  type NameStatus,
} from "./expenseItemsLogic";

const MESSAGE_STYLE = { fontSize: "0.875em", marginTop: 5 } as const;
const HIDDEN = { display: "none" } as const;
const SHOWN = { display: "block" } as const;
const REQUIRED_STAR = { color: "red" } as const;

/**
 * Masraf kalemi ekleme/düzenleme (ZTO Views/ExpenseItems/Add.cshtml, Edit.cshtml; 12.7_TASARIM §5.4).
 * Ad tekilliği yerel listeyle denetlenir (aktif kalemler, Türkçe harf duyarsız); sunucu 409
 * `EXPENSE_ITEM_NAME_EXISTS` aynı iletiyi verir. Yazarken yalnız öneri ve "kullanılabilir" iletisi
 * görünür; hata `blur`'da (MWG forms). Rota FINANCE_MANAGE ile korunur (App.tsx).
 */
export function ExpenseItemFormPage() {
  useZtoRootClass("zto-page-expense-items");
  const { id } = useParams();
  const mode = id ? "edit" : "new";
  const { t } = useTranslation("ztoFinans");
  const k = (key: string) => t(`expenseItems.form.${key}`);
  const navigate = useNavigate();
  const snackbar = useZtoSnackbar();
  const items = useExpenseItems();
  const all = useMemo(() => items.data ?? [], [items.data]);
  const original = useMemo(() => (id ? all.find((item) => item.id === id) : undefined), [all, id]);
  const types = useQuery({
    queryKey: ["finance", "expense-types"],
    queryFn: () => apiGet<ExpenseType[]>("/finance/expense-types"),
  });
  const save = useSaveExpenseItem(id);

  const [values, setValues] = useState<ExpenseItemFormValues>(EMPTY_EXPENSE_ITEM_FORM);
  const [status, setStatus] = useState<NameStatus>(mode === "edit" ? "original" : "idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const loaded = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (original && !loaded.current) {
      loaded.current = true;
      setValues(formOf(original));
      setStatus("original");
    }
  }, [original]);

  const debouncedName = useDebouncedValue(values.name, SUGGESTION_DEBOUNCE_MS);
  const suggestions = useMemo(
    () => (open ? suggestNames(all, debouncedName, original?.id) : []),
    [open, all, debouncedName, original],
  );
  const listOpen = open && suggestions.length > 0 && debouncedName === values.name;

  // Yazma durduktan sonra yalnız "kullanılabilir" anlık gösterilir; tekrar eden ad blur'da hata olur.
  useEffect(() => {
    if (status !== "idle" || debouncedName !== values.name || !debouncedName.trim()) return;
    const next = evaluateName(all, debouncedName, mode, original);
    if (next !== "duplicate") setStatus(next);
  }, [debouncedName, values.name, status, all, mode, original]);

  const set = (patch: Partial<ExpenseItemFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const onNameChange = (value: string) => {
    set({ name: value });
    setOpen(true);
    setActive(-1);
    setStatus(
      mode === "edit" && original && value.trim() === original.name.trim() ? "original" : "idle",
    );
  };

  const validateName = () => {
    if (!values.name.trim()) return;
    setStatus(evaluateName(all, values.name, mode, original));
  };

  const choose = (value: string) => {
    set({ name: value });
    setOpen(false);
    setActive(-1);
    setStatus("suggested");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && listOpen) {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && listOpen) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (listOpen && active >= 0) choose(suggestions[active]);
      else validateName();
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    const checked = submitNameStatus(all, values.name, mode, original);
    if (!canSubmitName(checked)) {
      setStatus(checked);
      setOpen(false);
      nameRef.current?.focus();
      return;
    }
    if (!values.expenseTypeId) {
      document.getElementById("expenseTypeId")?.focus();
      return;
    }
    try {
      await save.mutateAsync(toSaveRequest(values, original));
      snackbar.show(k(mode === "edit" ? "updated" : "created"), "success");
      navigate(`${ZTO_FINANS_BASE}/${ZTO_SLUGS.expenseItems}`);
    } catch (error) {
      if (errorCodeOf(error) === "EXPENSE_ITEM_NAME_EXISTS") {
        setStatus("duplicate");
        nameRef.current?.focus();
      } else {
        snackbar.show(errorText(error), "error");
      }
    }
  };

  const error = nameErrorText(status, values.name, mode);
  const success = error ? null : nameSuccessText(status, values.name);
  const enabled = canSubmitName(status) && !save.isPending;
  const typeLocked = mode === "edit" && !!original?.system;

  if (mode === "edit" && !original) {
    return (
      <>
        <br />
        {items.isPending ? (
          <p className="text-muted" role="status">
            {k("loading")}
          </p>
        ) : (
          <div className="alert alert-danger" role="alert">
            {items.isError ? items.error.message : k("notFound")}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <br />
      <ZtoDefinitionBreadcrumb
        items={[
          { label: k("breadcrumbRoot"), to: `${ZTO_FINANS_BASE}/${ZTO_SLUGS.expenseItems}` },
          { label: k(mode === "edit" ? "breadcrumbEdit" : "breadcrumbNew") },
        ]}
        title={k(mode === "edit" ? "titleEdit" : "titleNew")}
        icon="fas fa-receipt"
        showHr
      />
      <form onSubmit={onSubmit} aria-busy={save.isPending || undefined}>
        <div className="col-md-12">
          <label htmlFor="expenseTypeId" className="form-label">
            {k("expenseType")}: <span style={REQUIRED_STAR}>*</span>
          </label>
          <select
            className="form-control"
            id="expenseTypeId"
            name="expenseTypeId"
            required
            value={values.expenseTypeId}
            disabled={typeLocked}
            title={typeLocked ? k("systemTypeLocked") : undefined}
            onChange={(event) => set({ expenseTypeId: event.target.value })}
          >
            <option value="">{k("expenseTypePlaceholder")}</option>
            {(types.data ?? []).map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-12">
          <label htmlFor="name" className="form-label">
            {k("name")}: <span style={REQUIRED_STAR}>*</span>
          </label>
          <div className="autocomplete">
            <input
              ref={nameRef}
              type="text"
              className={`form-control${error ? " is-invalid" : success ? " is-valid" : ""}`}
              id="name"
              name="name"
              required
              maxLength={NAME_MAX_LENGTH}
              placeholder={k("namePlaceholder")}
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-autocomplete="list"
              aria-controls="suggestions"
              aria-expanded={listOpen}
              aria-activedescendant={listOpen && active >= 0 ? `suggestion-${active}` : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby="nameError nameSuccess"
              value={values.name}
              onChange={(event) => onNameChange(event.target.value)}
              onBlur={() => {
                setOpen(false);
                validateName();
              }}
              onKeyDown={onKeyDown}
            />
            <div
              id="suggestions"
              className="autocomplete-items"
              role="listbox"
              aria-label={k("suggestions")}
              style={listOpen ? SHOWN : HIDDEN}
            >
              {listOpen &&
                suggestions.map((suggestion, index) => {
                  const term = values.name.trim();
                  return (
                    <div
                      key={suggestion}
                      id={`suggestion-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className={index === active ? "autocomplete-active" : undefined}
                      // Seçim blur'dan önce olur; ad alanı odağı kaybetmez.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(suggestion)}
                    >
                      <strong>{suggestion.slice(0, term.length)}</strong>
                      {suggestion.slice(term.length)}
                    </div>
                  );
                })}
            </div>
          </div>
          <div
            id="nameError"
            className="text-danger"
            aria-live="polite"
            style={{ ...MESSAGE_STYLE, ...(error ? SHOWN : HIDDEN) }}
          >
            {error && (
              <>
                <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {error}
              </>
            )}
          </div>
          <div
            id="nameSuccess"
            className="text-success"
            aria-live="polite"
            style={{ ...MESSAGE_STYLE, ...(success ? SHOWN : HIDDEN) }}
          >
            {success && (
              <>
                <i className="fas fa-check-circle" aria-hidden="true" /> {success}
              </>
            )}
          </div>
        </div>
        <div className="col-md-12">
          <label htmlFor="description" className="form-label">
            {k("description")}:
          </label>
          <textarea
            className="form-control"
            id="description"
            name="description"
            rows={3}
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={values.description}
            onChange={(event) => set({ description: event.target.value })}
          />
        </div>
        <div className="col-md-12">
          <label htmlFor="defaultUnit" className="form-label">
            {k("defaultUnit")}:
          </label>
          <input
            type="text"
            className="form-control"
            id="defaultUnit"
            name="defaultUnit"
            maxLength={UNIT_MAX_LENGTH}
            placeholder={k("defaultUnitPlaceholder")}
            value={values.defaultUnit}
            onChange={(event) => set({ defaultUnit: event.target.value })}
          />
        </div>
        <br />
        <div className="col-md-12">
          <button
            type="submit"
            id="submitButton"
            className={`btn btn-primary col-md-12 ${enabled ? "btn-enabled" : "btn-disabled"}`}
            disabled={!enabled}
            title={submitTitle(status, mode)}
          >
            <i className={mode === "edit" ? "fas fa-edit" : "fas fa-plus"} aria-hidden="true" />{" "}
            {save.isPending ? (
              <>
                {k(mode === "edit" ? "submittingEdit" : "submittingNew")}{" "}
                <i className="fas fa-spinner fa-spin" aria-hidden="true" />
              </>
            ) : (
              k(mode === "edit" ? "submitEdit" : "submitNew")
            )}
          </button>
        </div>
      </form>
    </>
  );
}

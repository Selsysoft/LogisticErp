import { createColumnHelper } from "@tanstack/react-table";
import { CSSProperties, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCan } from "../../../../pages/finance/common";
import { useExpenseItems, useSetExpenseItemActive } from "../../../../pages/finance/expenseApi";
import type { ExpenseItem } from "../../../../pages/finance/types";
import { ZtoConfirmModal, ZtoDataTable, formatDateTime, useZtoSnackbar } from "../../../components";
import { expenseItemEditPath, expenseItemInvoicesPath, newExpenseItemPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { activeItems } from "./expenseItemsLogic";

const column = createColumnHelper<ExpenseItem>();
const HEADER_ROW: CSSProperties = {
  margin: 2,
  display: "flex",
  justifyContent: "space-between",
  flexDirection: "row",
  alignItems: "center",
};
const ALIGN: CSSProperties = { alignItems: "center" };
const TITLE: CSSProperties = { margin: 0, alignItems: "center" };
const SMALL_BUTTON: CSSProperties = { fontSize: 11 };

/**
 * Masraf Kalemleri listesi (ZTO Views/ExpenseItems/Index.cshtml; 12.7_TASARIM §5.4). Yalnız aktif
 * kalemler; "Anahtar" sütunu yok. "Sil" kalemi pasifleştirir (OK-12.7-10), sistem kaleminde çizilmez.
 * Yazma düğmeleri FINANCE_MANAGE ister.
 */
export function ExpenseItemsPage() {
  useZtoRootClass("zto-page-expense-items");
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const canManage = useCan("FINANCE_MANAGE");
  const items = useExpenseItems();
  const rows = useMemo(() => activeItems(items.data ?? []), [items.data]);
  const [pending, setPending] = useState<ExpenseItem | null>(null);
  const setActive = useSetExpenseItemActive();
  const k = (key: string, options?: Record<string, unknown>) =>
    t(`expenseItems.list.${key}`, options);

  const columns = useMemo(() => {
    const c = (key: string) => t(`expenseItems.list.${key}`);
    return [
      column.accessor("expenseTypeName", {
        id: "type",
        header: c("expenseType"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor("name", { id: "name", header: c("name") }),
      column.accessor((row) => row.description ?? "", {
        id: "description",
        header: c("description"),
      }),
      column.accessor((row) => row.defaultUnit ?? "", { id: "unit", header: c("defaultUnit") }),
      column.accessor("createdAt", {
        id: "createdAt",
        header: c("createdAt"),
        cell: ({ getValue }) => formatDateTime(getValue()),
        meta: { searchValue: (value: string) => formatDateTime(value) },
      }),
      column.display({
        id: "actions",
        header: c("actions"),
        enableSorting: false,
        meta: { searchable: false, exportable: false },
        cell: ({ row }) => (
          <>
            <Link
              to={expenseItemInvoicesPath(row.original.id)}
              style={SMALL_BUTTON}
              className="btn btn-info"
              title={c("accounts")}
              aria-label={`${c("accounts")}: ${row.original.name}`}
            >
              <i className="fas fa-money-bill-alt" aria-hidden="true" />
            </Link>{" "}
            {canManage && (
              <Link
                to={expenseItemEditPath(row.original.id)}
                className="btn btn-success"
                title={c("edit")}
                aria-label={`${c("edit")}: ${row.original.name}`}
              >
                <i className="fas fa-edit" aria-hidden="true" />
              </Link>
            )}{" "}
            {canManage && !row.original.system && (
              <button
                type="button"
                className="btn btn-danger demo"
                title={c("delete")}
                aria-label={`${c("delete")}: ${row.original.name}`}
                onClick={() => setPending(row.original)}
              >
                <i className="fas fa-trash-alt" aria-hidden="true" />
              </button>
            )}
          </>
        ),
      }),
    ];
  }, [t, canManage]);

  return (
    <>
      <br />
      <div className="row">
        <div className="col-xl-12">
          <section className="card custom-card">
            <header className="card-header custom-card-header">
              <div style={HEADER_ROW}>
                <div style={ALIGN}>
                  <h5 style={TITLE}>
                    {k("title")} &nbsp;
                    <i className="fas fa-receipt" aria-hidden="true" />
                  </h5>
                </div>
                {canManage && (
                  <Link to={newExpenseItemPath()} className="btn btn-primary">
                    <i className="fas fa-plus" aria-hidden="true" /> {k("newRecord")}
                  </Link>
                )}
              </div>
            </header>
            <div className="card-body">
              {items.isError && (
                <div className="alert alert-danger" role="alert">
                  {items.error.message}
                </div>
              )}
              <div className="table-responsive">
                <ZtoDataTable
                  id="dataTable"
                  tableClassName="table table-hover"
                  columns={columns}
                  data={rows}
                  order={[{ id: "createdAt", desc: true }]}
                  getRowId={(row) => row.id}
                  processing={items.isPending}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
      <ZtoConfirmModal
        show={pending !== null}
        message={k("confirmDelete")}
        note={null}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          await setActive.mutateAsync({ id: pending.id, active: false });
          setPending(null);
          snackbar.show(k("deactivated"), "success");
        }}
        onError={(error) => {
          setPending(null);
          snackbar.show(
            k("error", { message: error instanceof Error ? error.message : String(error) }),
            "error",
          );
        }}
      />
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  activateRollover,
  createRollover,
  deleteRollover,
  restoreRollover,
  updateRollover,
  useFinanceMutation,
  useRollovers,
} from "../../../../pages/finance/accountApi";
import { today } from "../../../../pages/finance/common";
import type { AccountRollover } from "../../../../pages/finance/types";
import { ZtoModal, formatDate, formatDateTime } from "../../../components";
import { useCdDialogs } from "./TransactionDialogs";
import { apiErrorOf, sortSeasons } from "./transactionsLogic";

export type RolloverModalProps = {
  show: boolean;
  onHide: () => void;
  accountId: string;
  /** Aktif sezon değişince (oluştur/aktif yap/sil) sayfanın sezon seçimi buna geçer (ZTO ctReloadWithDevir). */
  onSeasonChange: (rolloverId: string | null) => void;
};

/**
 * Cari Devir / Sezon (ZTO Transactions.cshtml:4063-4214, betik :4341-4696): oluştur/düzenle formu, önceki
 * devirler tablosu (Aktif Yap, Düzenle, Sil), Silinenler (Geri Getir), aktif sezon silinirken yeni aktif
 * seçimi; js confirm/alert yerine cdConfirm/cdAlert.
 */
export function RolloverModal({ show, onHide, accountId, onSeasonChange }: RolloverModalProps) {
  const { t } = useTranslation("ztoFinans");
  const dialogs = useCdDialogs();
  const [date, setDate] = useState(today());
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<AccountRollover | null>(null);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [activeDelete, setActiveDelete] = useState<AccountRollover | null>(null);
  const [newActive, setNewActive] = useState("");
  const dateRef = useRef<HTMLInputElement>(null);
  const activeCancelRef = useRef<HTMLButtonElement>(null);

  const list = useRollovers(show ? accountId : undefined, false);
  const deleted = useRollovers(show && deletedOpen ? accountId : undefined, true);
  const seasons = sortSeasons(list.data ?? []).reverse();

  useEffect(() => {
    if (show) {
      setEditing(null);
      setDate(today());
      setName("");
    }
  }, [show]);

  const fail = (fallback: string) => (e: unknown) => {
    const api = apiErrorOf(e);
    dialogs.notify(api?.message || fallback, "error");
  };

  const save = useFinanceMutation(
    () =>
      editing
        ? updateRollover(editing.id, { rolloverDate: date, seasonName: name.trim() })
        : createRollover(accountId, { rolloverDate: date, seasonName: name.trim() }),
    {
      onSuccess: (r) => {
        if (!editing) onSeasonChange(r.id);
        setEditing(null);
        setDate(today());
        setName("");
      },
      onError: fail(t("transactions.rollover.errCreate")),
    },
  );
  const activate = useFinanceMutation((id: string) => activateRollover(id), {
    onSuccess: (r) => onSeasonChange(r.id),
    onError: fail(t("transactions.rollover.serverError")),
  });
  const remove = useFinanceMutation(
    ({ id, next }: { id: string; next?: string }) => deleteRollover(id, next),
    {
      onSuccess: (_r, vars) => {
        setActiveDelete(null);
        onSeasonChange(vars.next ?? null);
      },
      onError: (e, vars) => {
        const api = apiErrorOf(e);
        if (api?.code === "ROLLOVER_NEW_ACTIVE_REQUIRED") {
          const row = seasons.find((s) => s.id === vars.id) ?? null;
          setNewActive("");
          setActiveDelete(row);
          return;
        }
        fail(t("transactions.rollover.serverError"))(e);
      },
    },
  );
  const restore = useFinanceMutation((id: string) => restoreRollover(id), {
    onError: fail(t("transactions.rollover.serverError")),
  });

  const submit = () => {
    if (!date || !name.trim()) {
      dialogs.notify(t("transactions.rollover.errRequired"), "warning");
      return;
    }
    save.mutate(undefined);
  };

  const startEdit = (row: AccountRollover) => {
    setEditing(row);
    setDate(row.rolloverDate);
    setName(row.seasonName);
    dateRef.current?.focus();
  };

  const askDelete = async (row: AccountRollover) => {
    if (row.active && seasons.length > 1) {
      setNewActive("");
      setActiveDelete(row);
      return;
    }
    if (
      await dialogs.confirm(t("transactions.rollover.confirmDelete"), {
        confirmText: t("transactions.rollover.remove"),
        confirmClass: "btn-danger",
      })
    ) {
      remove.mutate({ id: row.id });
    }
  };

  const others = activeDelete ? seasons.filter((s) => s.id !== activeDelete.id) : [];
  const labelStyle = { fontSize: 11, fontWeight: 600, color: "#4b5563" } as const;

  return (
    <>
      <ZtoModal
        show={show}
        onHide={onHide}
        rootId="cariDevirModal"
        size="xl"
        centered
        headerClassName="text-white py-2"
        closeButtonClassName="text-white"
        footerClassName="py-2"
        title={
          <span style={{ fontSize: 15 }}>
            <i className="fas fa-calendar-check" aria-hidden="true" />{" "}
            {t("transactions.rollover.title")}
          </span>
        }
        footer={
          <button type="button" className="btn btn-sm btn-secondary" onClick={onHide}>
            {t("transactions.rollover.close")}
          </button>
        }
      >
        <div className="alert alert-info py-2 px-3" style={{ fontSize: 12 }}>
          <i className="fas fa-info-circle mr-1" aria-hidden="true" />
          {t("transactions.rollover.info")}
        </div>
        <form
          className="form-row align-items-end mb-1"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="col-md-4 mb-2">
            <label className="mb-1" htmlFor="cdDevirDate" style={labelStyle}>
              {t("transactions.rollover.date")}{" "}
              <span className="text-danger" aria-hidden="true">
                *
              </span>
            </label>
            <input
              ref={dateRef}
              type="date"
              id="cdDevirDate"
              className="form-control form-control-sm"
              required
              aria-required="true"
              autoFocus
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="col-md-5 mb-2">
            <label className="mb-1" htmlFor="cdSeasonName" style={labelStyle}>
              {t("transactions.rollover.name")}{" "}
              <span className="text-danger" aria-hidden="true">
                *
              </span>
            </label>
            <input
              type="text"
              id="cdSeasonName"
              className="form-control form-control-sm"
              placeholder={t("transactions.rollover.namePlaceholder")}
              maxLength={200}
              required
              aria-required="true"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="col-md-3 mb-2">
            <button
              type="submit"
              id="btnCdCreate"
              className="btn btn-sm btn-success btn-block"
              disabled={save.isPending}
              aria-busy={save.isPending}
            >
              <i className={editing ? "fas fa-save" : "fas fa-plus"} aria-hidden="true" />{" "}
              <span id="cdCreateBtnText">
                {t(editing ? "transactions.rollover.update" : "transactions.rollover.create")}
              </span>
            </button>
            {editing && (
              <button
                type="button"
                id="btnCdCancelEdit"
                className="btn btn-sm btn-outline-secondary btn-block mt-1"
                onClick={() => {
                  setEditing(null);
                  setDate(today());
                  setName("");
                }}
              >
                <i className="fas fa-times" aria-hidden="true" />{" "}
                {t("transactions.rollover.cancelEdit")}
              </button>
            )}
          </div>
        </form>
        <hr className="my-2" />
        <div className="d-flex align-items-center justify-content-between mb-1">
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
            <i
              className="fas fa-history text-muted mr-1"
              style={{ fontSize: 12 }}
              aria-hidden="true"
            />
            {t("transactions.rollover.previous")}
          </span>
          <button
            type="button"
            id="btnCdShowDeleted"
            className="btn btn-sm btn-outline-danger"
            style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={() => setDeletedOpen(true)}
          >
            <i className="fas fa-trash-restore mr-1" aria-hidden="true" />
            {t("transactions.rollover.deleted")}
          </button>
        </div>
        <div className="table-responsive">
          <table
            id="cdDevirTable"
            className="table table-sm table-striped mb-0"
            style={{ fontSize: 12, width: "100%" }}
          >
            <thead className="thead-light">
              <tr>
                <th scope="col">{t("transactions.rollover.name")}</th>
                <th scope="col">{t("transactions.rollover.date")}</th>
                <th scope="col">{t("transactions.rollover.by")}</th>
                <th scope="col">{t("transactions.rollover.createdAt")}</th>
                <th scope="col">{t("transactions.rollover.updatedAt")}</th>
                <th scope="col" className="text-center">
                  {t("transactions.rollover.status")}
                </th>
                <th scope="col" className="text-center">
                  {t("transactions.rollover.actions")}
                </th>
              </tr>
            </thead>
            <tbody id="cdDevirBody">
              {list.isPending ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-3">
                    {t("transactions.rollover.loading")}
                  </td>
                </tr>
              ) : list.isError ? (
                <tr>
                  <td colSpan={7} className="text-center text-danger py-3">
                    {t("transactions.rollover.loadError")}
                  </td>
                </tr>
              ) : seasons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-3">
                    {t("transactions.rollover.noRecords")}
                  </td>
                </tr>
              ) : (
                seasons.map((d) => (
                  <tr key={d.id}>
                    <td>{d.seasonName}</td>
                    <td>{formatDate(d.rolloverDate)}</td>
                    <td>{d.createdBy}</td>
                    <td>{formatDateTime(d.createdAt)}</td>
                    <td>
                      {d.updateCount > 0 ? (
                        <>
                          {d.updatedBy}
                          <br />
                          <small className="text-muted">{formatDateTime(d.updatedAt)}</small>
                        </>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="text-center">
                      {d.active ? (
                        <span className="badge badge-success">
                          <i className="fas fa-check-circle" aria-hidden="true" />{" "}
                          {t("transactions.rollover.active")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success cd-setactive"
                          title={t("transactions.rollover.makeActiveTitle")}
                          onClick={async () => {
                            if (
                              await dialogs.confirm(t("transactions.rollover.confirmActivate"), {
                                confirmText: t("transactions.rollover.makeActive"),
                                confirmClass: "btn-success",
                              })
                            ) {
                              activate.mutate(d.id);
                            }
                          }}
                        >
                          <i className="fas fa-toggle-on" aria-hidden="true" />{" "}
                          {t("transactions.rollover.makeActive")}
                        </button>
                      )}
                    </td>
                    <td className="text-center text-nowrap">
                      <button
                        type="button"
                        className="btn btn-sm btn-warning mr-1 cd-edit"
                        title={t("transactions.rollover.edit")}
                        aria-label={`${t("transactions.rollover.edit")}: ${d.seasonName}`}
                        onClick={() => startEdit(d)}
                      >
                        <i className="fas fa-edit" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger cd-del"
                        title={t("transactions.rollover.remove")}
                        aria-label={`${t("transactions.rollover.remove")}: ${d.seasonName}`}
                        onClick={() => void askDelete(d)}
                      >
                        <i className="fas fa-trash" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ZtoModal>

      <ZtoModal
        show={show && deletedOpen}
        onHide={() => setDeletedOpen(false)}
        rootId="cariDevirDeletedModal"
        size="lg"
        centered
        headerClassName="text-white py-2"
        closeButtonClassName="text-white"
        footerClassName="py-2"
        title={
          <span style={{ fontSize: 15 }}>
            <i className="fas fa-trash-restore" aria-hidden="true" />{" "}
            {t("transactions.rollover.deletedTitle")}
          </span>
        }
        footer={
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setDeletedOpen(false)}
          >
            {t("transactions.rollover.close")}
          </button>
        }
      >
        <div className="table-responsive" style={{ maxHeight: 360, overflow: "auto" }}>
          <table className="table table-sm table-striped mb-0" style={{ fontSize: 12 }}>
            <thead className="thead-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th scope="col">{t("transactions.rollover.name")}</th>
                <th scope="col">{t("transactions.rollover.date")}</th>
                <th scope="col">{t("transactions.rollover.createdBy")}</th>
                <th scope="col">{t("transactions.rollover.deletedBy")}</th>
                <th scope="col">{t("transactions.rollover.deletedAt")}</th>
                <th scope="col" className="text-center">
                  {t("transactions.rollover.actions")}
                </th>
              </tr>
            </thead>
            <tbody id="cdDeletedBody">
              {deleted.isPending ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-3">
                    {t("transactions.rollover.loading")}
                  </td>
                </tr>
              ) : (deleted.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-3">
                    {t("transactions.rollover.noDeleted")}
                  </td>
                </tr>
              ) : (
                (deleted.data ?? []).map((d) => (
                  <tr key={d.id}>
                    <td>{d.seasonName}</td>
                    <td>{formatDate(d.rolloverDate)}</td>
                    <td>{d.createdBy}</td>
                    <td>{d.deletedBy ?? "-"}</td>
                    <td>{formatDateTime(d.deletedAt)}</td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-sm btn-success cd-restore"
                        title={t("transactions.rollover.restore")}
                        aria-label={`${t("transactions.rollover.restore")}: ${d.seasonName}`}
                        onClick={async () => {
                          if (await dialogs.confirm(t("transactions.rollover.confirmRestore")))
                            restore.mutate(d.id);
                        }}
                      >
                        <i className="fas fa-trash-restore" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ZtoModal>

      <ZtoModal
        show={show && activeDelete !== null}
        onHide={() => setActiveDelete(null)}
        rootId="cdActiveDeleteModal"
        centered
        titleAs="h6"
        headerClassName="text-dark py-2"
        footerClassName="py-2"
        onEntered={() => activeCancelRef.current?.focus()}
        title={
          <span style={{ fontSize: 14 }}>
            <i className="fas fa-exclamation-triangle text-warning" aria-hidden="true" />{" "}
            {t("transactions.rollover.activeDeleteTitle")}
          </span>
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              ref={activeCancelRef}
              onClick={() => setActiveDelete(null)}
            >
              {t("transactions.rollover.giveUp")}
            </button>
            <button
              type="button"
              id="btnCdConfirmActiveDelete"
              className="btn btn-sm btn-danger"
              disabled={remove.isPending}
              onClick={() => {
                if (!newActive) {
                  dialogs.notify(t("transactions.rollover.errNewActive"), "warning");
                  return;
                }
                if (activeDelete) remove.mutate({ id: activeDelete.id, next: newActive });
              }}
            >
              <i className="fas fa-trash mr-1" aria-hidden="true" />
              {t("transactions.rollover.deleteAndActivate")}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: "#374151" }}>
          {t("transactions.rollover.activeDeleteBody")}
        </p>
        <label className="mb-1" htmlFor="cdNewActiveSelect" style={labelStyle}>
          {t("transactions.rollover.newActive")}{" "}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        </label>
        <select
          id="cdNewActiveSelect"
          className="form-control form-control-sm no-select2"
          required
          aria-required="true"
          value={newActive}
          onChange={(e) => setNewActive(e.target.value)}
        >
          <option value="" />
          {others.map((x) => (
            <option key={x.id} value={x.id}>
              {`${x.seasonName} (${formatDate(x.rolloverDate)})`}
            </option>
          ))}
        </select>
      </ZtoModal>
      {dialogs.dialogs}
    </>
  );
}

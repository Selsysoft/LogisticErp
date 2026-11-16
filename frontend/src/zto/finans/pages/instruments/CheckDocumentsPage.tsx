import { KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiBlobUrl, apiDownload, apiGet, apiRequest, apiUpload } from "../../../../api/client";
import { useCan } from "../../../../pages/finance/common";
import { useInstrument } from "../../../../pages/finance/instrumentApi";
import type { StoredFile } from "../../../../pages/crm/types";
import { ZtoModal, useZtoSnackbar } from "../../../components";
import { checksPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { fileIcon, nextMenuIndex, progressPercent, splitFiles } from "./checkDocumentsLogic";
import { ZtoFileUploadArea } from "./ZtoFileUploadArea";

const OWNER_TYPE = "INSTRUMENT";
const HINT_STYLE = { fontSize: 14, marginBottom: 10 } as const;
const EMPTY_STYLE = { textAlign: "center", padding: 20 } as const;
const EMPTY_ICON = { fontSize: 48, color: "#6c757d", marginBottom: 15 } as const;

type Menu = { file: StoredFile; x: number; y: number; source: HTMLElement } | null;

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

/**
 * Çek Belgeleri (ZTO Views/Checks/CheckDocuments.cshtml; 12.3_TASARIM §5.8). Sol: bilgi kutusu ve
 * "Çek Dokümanları" düz listesi (ZTO `treeview` sınıfları, tek seviye; klasör ağacı yok, OK-12.3-20).
 * Sağ: yükleme alanı. Dosyaya sağ tıklayınca Görüntüle / İndir / Sil menüsü ("Paylaş" yok). Dosyalar
 * genel `/files?ownerType=INSTRUMENT` ucundadır; görüntüleme FINANCE_VIEW, yükleme/silme
 * FINANCE_PAYMENT_CREATE. MWG `menu`: bağlam menüsü `ContextMenu`/`Shift+F10` ile de açılır, ilk öğe
 * odaklanır, ↑/↓/Home/End gezinir, Escape kapatır ve odak dosyaya döner.
 */
export function CheckDocumentsPage() {
  useZtoRootClass("zto-page-check-documents");
  const { id = "" } = useParams();
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const client = useQueryClient();
  const canEdit = useCan("FINANCE_PAYMENT_CREATE");
  const instrument = useInstrument(id);
  const key = ["finance", "instrument-files", id];
  const files = useQuery({
    queryKey: key,
    queryFn: () =>
      apiGet<StoredFile[]>(`/files?ownerType=${OWNER_TYPE}&ownerId=${encodeURIComponent(id)}`),
    enabled: !!id && instrument.isSuccess,
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<StoredFile>(
        `/files?ownerType=${OWNER_TYPE}&ownerId=${encodeURIComponent(id)}`,
        form,
      );
    },
  });
  const remove = useMutation({
    mutationFn: (fileId: string) => apiRequest("DELETE", `/files/${encodeURIComponent(fileId)}`),
  });
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [status, setStatus] = useState("");
  const [menu, setMenu] = useState<Menu>(null);
  const [confirm, setConfirm] = useState<StoredFile | null>(null);
  const [result, setResult] = useState<{ ok: boolean; detail?: string } | null>(null);
  const uploaded = useRef(new Set<string>());
  const menuRef = useRef<HTMLUListElement>(null);
  const c = (k: string, options?: Record<string, unknown>) => t(`checkDocuments.${k}`, options);

  const refresh = () => client.invalidateQueries({ queryKey: key });

  async function uploadAll(list: File[]) {
    const { valid, oversized } = splitFiles(list);
    for (const file of oversized) snackbar.show(c("upload.oversize", { name: file.name }), "gray");
    const fresh = valid.filter((file) => !uploaded.current.has(fileKey(file)));
    if (fresh.length === 0) {
      if (oversized.length === 0 || valid.length === 0) {
        snackbar.show(c("upload.noValid"), "gray");
      }
      return;
    }
    setUploading(true);
    setPercent(0);
    setStatus("");
    let done = 0;
    for (const file of fresh) {
      try {
        await upload.mutateAsync(file);
        uploaded.current.add(fileKey(file));
        snackbar.show(c("upload.done", { name: file.name }), "success");
      } catch {
        snackbar.show(c("upload.failed", { name: file.name }), "error");
      }
      done += 1;
      setPercent(progressPercent(done, fresh.length));
    }
    await refresh();
    setStatus(c("upload.allDone"));
    setTimeout(() => {
      setUploading(false);
      setPercent(0);
    }, 1500);
  }

  // Bağlam menüsü: dışarı tıklama ve kaydırma kapatır; açılınca ilk öğe odaklanır.
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const openMenu = (file: StoredFile, x: number, y: number, source: HTMLElement) =>
    setMenu({ file, x, y, source });
  const closeMenu = (restore: boolean) => {
    const source = menu?.source;
    setMenu(null);
    if (restore) source?.focus();
  };

  const view = async (file: StoredFile) => {
    const url = await apiBlobUrl(`/files/${encodeURIComponent(file.id)}/content`);
    window.open(url, "_blank", "noopener");
  };
  const download = (file: StoredFile) =>
    apiDownload(`/files/${encodeURIComponent(file.id)}/content`, file.fileName);

  const onMenuKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      closeMenu(false);
      return;
    }
    if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = nextMenuIndex(
        items.indexOf(document.activeElement as HTMLElement),
        event.key,
        items.length,
      );
      items[next]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    }
  };

  const runMenu = (action: "view" | "download" | "delete") => {
    if (!menu) return;
    const file = menu.file;
    closeMenu(action !== "delete");
    if (action === "view") void view(file);
    else if (action === "download") void download(file);
    else setConfirm(file);
  };

  const onFileContext = (event: MouseEvent<HTMLElement>, file: StoredFile) => {
    event.preventDefault();
    openMenu(file, event.pageX, event.pageY, event.currentTarget);
  };
  const onFileKey = (event: KeyboardEvent<HTMLElement>, file: StoredFile) => {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openMenu(file, rect.left + window.scrollX, rect.bottom + window.scrollY, event.currentTarget);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void view(file);
    }
  };

  async function confirmDelete() {
    if (!confirm) return;
    const file = confirm;
    setConfirm(null);
    try {
      await remove.mutateAsync(file.id);
      await refresh();
      setResult({ ok: true });
    } catch (error) {
      setResult({ ok: false, detail: error instanceof Error ? error.message : undefined });
    }
  }

  const item = instrument.data?.item;
  const list = files.data ?? [];

  return (
    <div className="col-md-12">
      <ol className="breadcrumb">
        <li>
          <Link to={checksPath()}>{c("crumbChecks")}</Link>
        </li>
        <li className="divider" aria-hidden="true" />
        <li className="active" aria-current="page">
          {c("crumbDocuments")}
        </li>
      </ol>
      {instrument.isError && (
        <div className="alert alert-warning" role="alert">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {c("notFound")}
        </div>
      )}
      {item && (
        <h6 className="mb-2" id="checkDocumentsTitle">
          {c("heading", { number: item.number, bank: item.bankName ?? "-" })}
        </h6>
      )}
      <div className="row">
        <div className="col-md-4">
          <div className="alert alert-info" role="note" style={HINT_STYLE}>
            {c("hint")}
          </div>
          <div className="treeview">
            <div className="document-text">
              <h6>
                <i className="fas fa-folder" aria-hidden="true" /> {c("listTitle")}
              </h6>
            </div>
            <div className="treeview-content">
              {files.isPending && instrument.isSuccess ? (
                <p className="text-muted">{c("loading")}</p>
              ) : list.length === 0 ? (
                <div style={EMPTY_STYLE}>
                  <i className="fas fa-folder-open" style={EMPTY_ICON} aria-hidden="true" />
                  <p>{c("empty")}</p>
                </div>
              ) : (
                <ul aria-labelledby="checkDocumentsTitle">
                  {list.map((file) => (
                    <li key={file.id}>
                      <i className={fileIcon(file.fileName)} aria-hidden="true" />{" "}
                      <span
                        className="file"
                        role="button"
                        tabIndex={0}
                        aria-haspopup="menu"
                        onClick={() => void view(file)}
                        onContextMenu={(event) => onFileContext(event, file)}
                        onKeyDown={(event) => onFileKey(event, file)}
                      >
                        {file.fileName}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-8">
          <ZtoFileUploadArea
            onFiles={(picked) => void uploadAll(picked)}
            onUpload={(picked) => void uploadAll(picked)}
            uploading={uploading}
            percent={percent}
            disabled={!canEdit || !item}
          />
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>

      {menu && (
        <div
          id="context-menu"
          className="custom-context-menu"
          style={{ display: "block", left: menu.x, top: menu.y }}
        >
          <ul ref={menuRef} role="menu" aria-label={c("menu.label")} onKeyDown={onMenuKey}>
            <li id="view-image" role="menuitem" tabIndex={-1} onClick={() => runMenu("view")}>
              <i className="fas fa-eye" aria-hidden="true" /> {c("menu.view")}
            </li>
            <li
              id="download-image"
              role="menuitem"
              tabIndex={-1}
              onClick={() => runMenu("download")}
            >
              <i className="fas fa-download" aria-hidden="true" /> {c("menu.download")}
            </li>
            {canEdit && (
              <li id="delete-image" role="menuitem" tabIndex={-1} onClick={() => runMenu("delete")}>
                <i className="fas fa-trash-alt" aria-hidden="true" /> {c("menu.delete")}
              </li>
            )}
          </ul>
        </div>
      )}

      <ZtoModal
        show={confirm !== null}
        onHide={() => setConfirm(null)}
        centered
        rootId="deleteConfirmModal"
        title={
          <>
            <i className="fas fa-exclamation-triangle text-warning" aria-hidden="true" />{" "}
            {c("deleteModal.title")}
          </>
        }
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
              <i className="fas fa-times" aria-hidden="true" /> {c("deleteModal.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              id="confirmDeleteBtn"
              disabled={remove.isPending}
              onClick={() => void confirmDelete()}
            >
              <i className="fas fa-trash-alt" aria-hidden="true" /> {c("deleteModal.confirm")}
            </button>
          </>
        }
      >
        <p>{c("deleteModal.body")}</p>
        <p className="text-muted small" id="fileNamePreview">
          {confirm ? c("deleteModal.file", { name: confirm.fileName }) : ""}
        </p>
      </ZtoModal>

      <ZtoModal
        show={result !== null}
        onHide={() => setResult(null)}
        centered
        rootId={result?.ok ? "deleteSuccessModal" : "deleteErrorModal"}
        headerClassName={result?.ok ? "bg-success text-white" : "bg-danger text-white"}
        closeButtonClassName="text-white"
        title={
          result?.ok ? (
            <>
              <i className="fas fa-check-circle" aria-hidden="true" /> {c("successModal.title")}
            </>
          ) : (
            <>
              <i className="fas fa-exclamation-circle" aria-hidden="true" /> {c("errorModal.title")}
            </>
          )
        }
        footer={
          result?.ok ? (
            <button type="button" className="btn btn-success" onClick={() => setResult(null)}>
              <i className="fas fa-check" aria-hidden="true" /> {c("successModal.ok")}
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setResult(null)}>
              <i className="fas fa-times" aria-hidden="true" /> {c("errorModal.close")}
            </button>
          )
        }
      >
        {result?.ok ? (
          <p>{c("successModal.body")}</p>
        ) : (
          <>
            <p>{c("errorModal.body")}</p>
            {result?.detail && (
              <p className="small text-muted" id="errorDetails">
                {c("errorModal.detail", { error: result.detail })}
              </p>
            )}
          </>
        )}
      </ZtoModal>
    </div>
  );
}

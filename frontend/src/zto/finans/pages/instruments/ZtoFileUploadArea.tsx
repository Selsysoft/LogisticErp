import { DragEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pickedLabel } from "./checkDocumentsLogic";

type Props = {
  /** Seçilen/bırakılan dosyalar (boyut denetimi çağıranda). */
  onFiles: (files: File[]) => void;
  /** "Yükle" düğmesi: `custom-file` ile seçilmiş dosyalar. */
  onUpload: (files: File[]) => void;
  /** Yükleme sürüyor mu (çubuk görünür). */
  uploading: boolean;
  /** 0–100. */
  percent: number;
  /** Yükleme izni yoksa alan devre dışı. */
  disabled?: boolean;
};

const PROGRESS_STYLE = { display: "flex" } as const;

/**
 * ZTO Çek Belgeleri yükleme alanı (CheckDocuments.cshtml :280-330): sürükle-bırak bölgesi, "Dosya Seç",
 * `custom-file` + "Yükle", 20 MB notu ve Bootstrap ilerleme çubuğu. Klasör seçici çizilmez (OK-12.3-20).
 * MWG `progress`: ZTO `div.progress-bar` korunur (native `<progress>` yerine; §5.12), `role=progressbar`
 * + aria-value* + `aria-label`; odak verilmez, tamamlanma sayfanın kibar canlı bölgesinde duyurulur.
 * Sürükle-bırakın klavye karşılığı "Dosya Seç" düğmesidir.
 */
export function ZtoFileUploadArea({ onFiles, onUpload, uploading, percent, disabled }: Props) {
  const { t } = useTranslation("ztoFinans");
  const u = (key: string, options?: Record<string, unknown>) =>
    t(`checkDocuments.upload.${key}`, options);
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const label = pickedLabel(picked);

  const prevent = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      id="upload-area"
      className={`upload-area${dragging ? " dragover" : ""}`}
      onDragEnter={(event) => {
        prevent(event);
        if (!disabled) setDragging(true);
      }}
      onDragOver={prevent}
      onDragLeave={(event) => {
        prevent(event);
        setDragging(false);
      }}
      onDrop={(event) => {
        prevent(event);
        setDragging(false);
        if (disabled) return;
        const files = Array.from(event.dataTransfer?.files ?? []);
        setPicked(files);
        if (files.length > 0) onFiles(files);
      }}
    >
      <div className="drag-drop-content">
        <i className="fas fa-cloud-upload-alt drag-drop-icon" aria-hidden="true" />
        <div className="drag-drop-text">{u("dropText")}</div>
        <div className="drag-drop-subtext">{u("or")}</div>
        <button
          type="button"
          className="file-select-btn"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <i className="fas fa-folder-open" aria-hidden="true" /> {u("pick")}
        </button>
        <div className="or-text">{u("or")}</div>
        <div className="row" style={FULL_ROW}>
          <div className="col-md-9">
            <div className="custom-file">
              <input
                ref={inputRef}
                type="file"
                className="custom-file-input"
                id="file-input"
                multiple
                disabled={disabled}
                aria-label={u("pickLabel")}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setPicked(files);
                  if (files.length > 0) onFiles(files);
                  event.target.value = "";
                }}
              />
              <label className="custom-file-label" htmlFor="file-input">
                {label.kind === "none"
                  ? u("inputLabel")
                  : label.kind === "one"
                    ? label.name
                    : u("selectedMany", { count: label.count })}
              </label>
            </div>
          </div>
          <div className="col-md-3">
            <button
              id="upload-button"
              type="button"
              className="btn btn-primary form-control"
              disabled={disabled || uploading}
              onClick={() => onUpload(picked)}
            >
              <i className="fas fa-file-import" aria-hidden="true" /> {u("submit")}
            </button>
          </div>
        </div>
        <div className="mt-3">
          <small className="text-muted">
            <i className="fas fa-info-circle" aria-hidden="true" /> {u("maxSize")}
          </small>
        </div>
      </div>
      <br />
      <div
        className="progress mt-2 w-100"
        id="upload-progress"
        style={uploading ? PROGRESS_STYLE : HIDDEN}
      >
        <div
          className="progress-bar progress-bar-striped progress-bar-animated bg-success"
          role="progressbar"
          style={{ width: `${percent}%` }}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={u("progress")}
        />
      </div>
    </div>
  );
}

const FULL_ROW = { width: "100%" } as const;
const HIDDEN = { display: "none" } as const;

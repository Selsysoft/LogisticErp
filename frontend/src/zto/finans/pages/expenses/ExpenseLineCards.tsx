import { CSSProperties, ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { errorIdOf } from "../../../a11y";
import {
  computeLine,
  lineFieldId,
  MAX_LINES,
  type LineField,
  type LineInput,
} from "./expenseFormLogic";

type Props = {
  lines: LineInput[];
  /** Seçili para biriminin simgesi (ZTO `.currency-symbol`). */
  symbol: string;
  onChange: (index: number, field: LineField, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onBlur: (fieldId: string) => void;
  /** Görünür hata metinleri (alan kimliği → metin). */
  errors: Record<string, string>;
  disabled?: boolean;
};

const BOLD: CSSProperties = { fontWeight: "bold" };

/**
 * ZTO "Masraf Detayları" kartları (Add.cshtml:607-781, `expenseDetailTemplate`): `.expense-detail-card`
 * > `.material-card-header` + iki `.material-row`. Ara toplam, iskonto/net/KDV tutarı ve TOPLAM salt
 * okunur hesap alanlarıdır (`expenseFormLogic.computeLine`, sunucuyla aynı yuvarlama). MWG `forms`:
 * her alanda `label[for]`, hatalı alanda `aria-invalid` + `aria-describedby`; kart eklenince odak yeni
 * kartın Açıklama alanına, silinince önceki kartın Açıklama alanına (yoksa "Yeni Detay Ekle") gider.
 */
export function ExpenseLineCards({
  lines,
  symbol,
  onChange,
  onAdd,
  onRemove,
  onBlur,
  errors,
  disabled,
}: Props) {
  const { t } = useTranslation("ztoFinans");
  const l = (key: string) => t(`expenses.form.line.${key}`);
  const pendingFocus = useRef<number | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const previousCount = useRef(lines.length);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target !== null && previousCount.current !== lines.length) {
      pendingFocus.current = null;
      const input =
        target >= 0 ? document.getElementById(lineFieldId(target, "description")) : addRef.current;
      input?.focus();
    }
    previousCount.current = lines.length;
  }, [lines.length]);

  const field = (
    index: number,
    name: LineField,
    props: {
      type?: "text" | "number";
      placeholder?: string;
      required?: boolean;
      addon?: ReactNode;
      addonClass?: string;
      maxLength?: number;
    },
  ) => {
    const id = lineFieldId(index, name);
    const error = errors[id];
    const numeric = props.type !== "text";
    const input = (
      <input
        id={id}
        type={numeric ? "number" : "text"}
        step={numeric ? "0.01" : undefined}
        inputMode={numeric ? "decimal" : undefined}
        className={`form-control${error ? " is-invalid" : ""}`}
        name={`Detail-${name}`}
        placeholder={props.placeholder}
        required={props.required}
        maxLength={props.maxLength}
        value={lines[index][name]}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? errorIdOf(id) : undefined}
        onChange={(event) => onChange(index, name, event.target.value)}
        onBlur={() => onBlur(id)}
      />
    );
    return (
      <>
        {props.addon ? (
          <div className="input-group">
            {input}
            <div className={`input-group-text ${props.addonClass ?? "bg-primary-custom"}`}>
              {props.addon}
            </div>
          </div>
        ) : (
          input
        )}
        <small id={errorIdOf(id)} className="text-danger" hidden={!error}>
          {error}
        </small>
      </>
    );
  };

  const readOnly = (
    index: number,
    name: string,
    value: string,
    addonClass = "bg-primary-custom",
    bold = false,
  ) => {
    const id = `detail-${index}-${name}`;
    return (
      <div className="input-group">
        <input
          id={id}
          type="number"
          step="0.01"
          className="form-control"
          name={`Detail-${name}`}
          placeholder="0.00"
          value={value}
          readOnly
          aria-readonly="true"
        />
        <div className={`input-group-text ${addonClass}`}>
          <span className="currency-symbol" style={bold ? BOLD : undefined}>
            {symbol}
          </span>
        </div>
      </div>
    );
  };

  const currency = <span className="currency-symbol">{symbol}</span>;

  return (
    <>
      <div id="expenseDetailsContainer">
        {lines.map((line, index) => {
          const computed = computeLine(line);
          const label = (name: string, text: string, required = false) => (
            <label htmlFor={`detail-${index}-${name}`}>
              {text}
              {required && (
                <>
                  {" "}
                  <span className="text-danger">*</span>
                </>
              )}
            </label>
          );
          return (
            <div
              className="expense-detail-card"
              key={line.key}
              role="group"
              aria-labelledby={`detail-${index}-title`}
            >
              <div className="material-card-header">
                <span className="material-card-number" id={`detail-${index}-title`}>
                  {t("expenses.form.detailNo", { n: index + 1 })}
                </span>
                <div className="material-card-actions">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm btn-remove-detail"
                    disabled={disabled}
                    aria-describedby={`detail-${index}-title`}
                    onClick={() => {
                      if (lines.length > 1) pendingFocus.current = index > 0 ? index - 1 : 0;
                      onRemove(index);
                    }}
                  >
                    <i className="fas fa-trash" aria-hidden="true" />{" "}
                    {t("expenses.form.removeDetail")}
                  </button>
                </div>
              </div>

              <div className="material-row">
                <div className="material-field material-field-large">
                  {label("description", l("description"))}
                  {field(index, "description", {
                    type: "text",
                    placeholder: l("descriptionPlaceholder"),
                    maxLength: 300,
                  })}
                </div>
                <div className="material-field">
                  {label("quantity", l("quantity"), true)}
                  {field(index, "quantity", {
                    placeholder: "0",
                    required: true,
                    addon: <span>{l("quantityUnit")}</span>,
                  })}
                </div>
                <div className="material-field material-field-small">
                  {label("unit", l("unit"))}
                  {field(index, "unit", {
                    type: "text",
                    placeholder: l("unitPlaceholder"),
                    maxLength: 20,
                  })}
                </div>
                <div className="material-field">
                  {label("unitPrice", l("unitPrice"), true)}
                  {field(index, "unitPrice", {
                    placeholder: "0.00",
                    required: true,
                    addon: currency,
                  })}
                </div>
                <div className="material-field">
                  {label("subTotal", l("subTotal"))}
                  {readOnly(index, "subTotal", computed.subTotal)}
                </div>
              </div>

              <div className="material-totals-section">
                <div className="material-row">
                  <div className="material-field material-field-small">
                    {label("discountRate", l("discountRate"))}
                    {field(index, "discountRate", {
                      placeholder: "0",
                      addon: <span>%</span>,
                      addonClass: "bg-info-custom",
                    })}
                  </div>
                  <div className="material-field">
                    {label("discountAmount", l("discountAmount"))}
                    {readOnly(index, "discountAmount", computed.discountAmount, "bg-info-custom")}
                  </div>
                  <div className="material-field">
                    {label("netAmount", l("netAmount"))}
                    {readOnly(index, "netAmount", computed.netAmount)}
                  </div>
                  <div className="material-field material-field-small">
                    {label("vatRate", l("vatRate"), true)}
                    {field(index, "vatRate", {
                      placeholder: "20",
                      required: true,
                      addon: <span>%</span>,
                    })}
                  </div>
                  <div className="material-field">
                    {label("vatAmount", l("vatAmount"))}
                    {readOnly(index, "vatAmount", computed.vatAmount)}
                  </div>
                  <div className="material-field">
                    {label("withholdingAmount", l("withholding"))}
                    {field(index, "withholdingAmount", {
                      placeholder: "0.00",
                      addon: currency,
                      addonClass: "bg-warning-custom",
                    })}
                  </div>
                  <div className="material-field">
                    {label("otherTaxAmount", l("otherTax"))}
                    {field(index, "otherTaxAmount", {
                      placeholder: "0.00",
                      addon: currency,
                      addonClass: "bg-warning-custom",
                    })}
                  </div>
                  <div className="material-field">
                    {label("totalAmount", l("total"), true)}
                    {readOnly(
                      index,
                      "totalAmount",
                      computed.totalAmount,
                      "bg-success-custom",
                      true,
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <button
          ref={addRef}
          type="button"
          className="btn btn-secondary"
          disabled={disabled || lines.length >= MAX_LINES}
          onClick={() => {
            pendingFocus.current = lines.length;
            onAdd();
          }}
        >
          <i className="fas fa-plus" aria-hidden="true" /> {t("expenses.form.addDetail")}
        </button>
      </div>
    </>
  );
}

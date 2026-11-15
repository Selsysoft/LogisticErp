import { useState } from "react";
import type { Fund } from "../../../../pages/finance/types";
import { DisabledDescription, DueDateInput, IssueDateInput } from "./CheckFields";
import { FundSelect } from "./FundSelect";
import type { NoteFieldsProps, NoteFieldsValue } from "./index";
import { Help, PhaseNote, useBranchName, useModalText } from "./parts";

/*
 * Senet alanları (12.2a_TASARIM §5.9). issued = ödeme (APM:919-1019): "İş Yeri Bankası (Opsiyonel)"
 * (`fundAccountId`), banka/şube adı salt okunur, "Keşideci (İş Yeri)" ödeme iş yerine kilitli (MX7
 * Ç21). received = tahsilat (CMP): banka adı serbest, şube adı 12.3, "Keşideci (Cari Hesap)" tahsilat
 * carisine kilitli (`drawer_account_id` 12.3). Düzenlenme tarihi ve senet açıklaması 12.3'e kadar
 * devre dışı.
 */

export function NoteFields({
  variant,
  value,
  onChange,
  branchId,
  companyId,
  accountLabel,
  errors = {},
  disabled,
}: NoteFieldsProps) {
  const { tm } = useModalText();
  const branchName = useBranchName();
  const [fund, setFund] = useState<Fund | null>(null);
  const set = (patch: Partial<NoteFieldsValue>) => onChange({ ...value, ...patch });
  const issued = variant === "issued";

  return (
    <div id="billFields">
      <div className="field-group">
        <div className="field-group-title">
          <i className="fas fa-file-invoice-dollar" aria-hidden="true" />{" "}
          {issued ? tm("note.title") : tm("note.receivedTitle")}
        </div>
        <div className="alert alert-info" style={{ fontSize: 11 }}>
          <i className="fas fa-info-circle" aria-hidden="true" />{" "}
          <strong>{tm("shared.note")}</strong>{" "}
          {issued ? tm("note.issuedInfo") : tm("note.receivedInfo")}
        </div>

        {issued && (
          <div className="form-group">
            <label id="BillBankID-label">
              <i className="fas fa-university" aria-hidden="true" /> {tm("note.issuedBank")}
            </label>
            <FundSelect
              id="BillBankID"
              kind="BANK"
              branchId={branchId}
              companyId={companyId}
              value={value.fundAccountId}
              onChange={(fundAccountId, picked) => {
                setFund(picked);
                set({ fundAccountId, bankName: picked?.bankName ?? "" });
              }}
              disabled={disabled}
              ariaLabelledBy="BillBankID-label"
            />
            <Help icon="fa-filter">{tm("note.issuedBankHelp")}</Help>
          </div>
        )}

        <div className="form-row">
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="BillBankName">
                <i className="fas fa-university" aria-hidden="true" /> {tm("note.bankName")}
              </label>
              {issued ? (
                <input
                  type="text"
                  id="BillBankName"
                  name="BillBankName"
                  className="form-control"
                  placeholder={tm("check.autoFill")}
                  readOnly
                  value={value.bankName}
                />
              ) : (
                <input
                  type="text"
                  id="BillBankName"
                  name="BillBankName"
                  className="form-control"
                  placeholder={tm("note.receivedBankPlaceholder")}
                  maxLength={100}
                  autoComplete="off"
                  value={value.bankName}
                  onChange={(event) => set({ bankName: event.target.value })}
                  disabled={disabled}
                />
              )}
              <Help>{issued ? tm("check.autoFillHelp") : tm("note.receivedBankHelp")}</Help>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="BillBranchName">
                <i className="fas fa-code-branch" aria-hidden="true" /> {tm("note.branchName")}
              </label>
              {issued ? (
                <input
                  type="text"
                  id="BillBranchName"
                  name="BillBranchName"
                  className="form-control"
                  placeholder={tm("check.autoFill")}
                  readOnly
                  value={value.fundAccountId ? (fund?.bankBranchName ?? "") : ""}
                />
              ) : (
                <>
                  <input
                    type="text"
                    id="BillBranchName"
                    name="BillBranchName"
                    className="form-control"
                    placeholder={tm("note.receivedBranchPlaceholder")}
                    disabled
                    title={tm("shared.phase123")}
                    aria-describedby="BillBranchName-phase"
                  />
                  <PhaseNote id="BillBranchName-phase" step="12.3" />
                </>
              )}
              <Help>{issued ? tm("check.autoFillHelp") : tm("note.receivedBranchHelp")}</Help>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="BillWorkPlaceID" className={issued ? undefined : "required-field"}>
            <i className="fas fa-building" aria-hidden="true" />{" "}
            {issued ? tm("note.drawerBranch") : tm("note.drawerAccount")}
          </label>
          <select
            id="BillWorkPlaceID"
            name="BillWorkPlaceID"
            className="form-control no-select2"
            value="locked"
            disabled
            aria-describedby="BillWorkPlaceID-help"
            onChange={() => undefined}
          >
            <option value="locked">
              {(issued ? branchName(branchId) : accountLabel) || tm("shared.select")}
            </option>
          </select>
          <small className="form-text text-muted" id="BillWorkPlaceID-help">
            {issued ? tm("note.drawerBranchHelp") : tm("note.drawerAccountHelp")}
          </small>
        </div>

        <div className="form-row">
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="BillNumber" className={issued ? undefined : "required-field"}>
                <i className="fas fa-hashtag" aria-hidden="true" /> {tm("note.number")}
              </label>
              <input
                type="text"
                id="BillNumber"
                name="BillNumber"
                className="form-control"
                placeholder={tm("note.numberPlaceholder")}
                maxLength={50}
                autoComplete="off"
                required
                value={value.number}
                onChange={(event) => set({ number: event.target.value })}
                disabled={disabled}
                aria-invalid={!!errors.number}
                aria-describedby={errors.number ? "BillNumber-error" : undefined}
              />
            </div>
          </div>
          <div className="col-md-3">
            <IssueDateInput id="BillIssueDate" label={tm("note.issueDate")} required={!issued} />
          </div>
          <div className="col-md-3">
            <DueDateInput
              id="BillDueDate"
              label={tm("note.dueDate")}
              value={value.dueDate}
              onChange={(dueDate) => set({ dueDate })}
              error={errors.dueDate}
              disabled={disabled}
              labelRequired={!issued}
            />
          </div>
        </div>
        <DisabledDescription
          id="BillDescription"
          label={tm("note.description")}
          placeholder={tm("note.descriptionPlaceholder")}
        />
      </div>
    </div>
  );
}

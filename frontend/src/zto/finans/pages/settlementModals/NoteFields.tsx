import type { NoteType } from "../../../../pages/finance/types";
import { DescriptionInput, DueDateInput, IssueDateInput } from "./CheckFields";
import { FundSelect } from "./FundSelect";
import type { NoteFieldsProps, NoteFieldsValue } from "./index";
import { Help, useBranchName, useModalText } from "./parts";

/*
 * Senet alanları (12.2a_TASARIM §5.9; 12.3 §5.10). issued = ödeme (APM:919-1019): "İş Yeri Bankası
 * (Opsiyonel)" (`fundAccountId`), banka/şube adı salt okunur (bankadan), "Keşideci (İş Yeri)" ödeme iş
 * yerine kilitli (MX7 Ç21). received = tahsilat (CMP): banka ve şube adı serbest, "Keşideci (Cari
 * Hesap)" tahsilat carisine kilitli; üçüncü kişi keşideci "Keşideci" metni (`drawerName`, boşsa cari
 * adı; OK-12.3-9). BR eki (ZTO Bills addBill M, OK-12.3-12): "Senet Türü" ve devre dışı "Teminat
 * Durumu" ("Normal Senet" sabit; OK-12.3-7). Düzenlenme tarihi ve senet açıklaması 12.3'te açık.
 */

const NOTE_TYPES: readonly NoteType[] = ["PLAIN", "ORDER", "BOND"];

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
              onChange={(fundAccountId, picked) =>
                set({
                  fundAccountId,
                  bankName: picked?.bankName ?? "",
                  bankBranch: picked?.bankBranchName ?? "",
                })
              }
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
                  value={value.fundAccountId ? (value.bankBranch ?? "") : ""}
                />
              ) : (
                <input
                  type="text"
                  id="BillBranchName"
                  name="BillBranchName"
                  className="form-control"
                  placeholder={tm("note.receivedBranchPlaceholder")}
                  maxLength={100}
                  autoComplete="off"
                  value={value.bankBranch ?? ""}
                  onChange={(event) => set({ bankBranch: event.target.value })}
                  disabled={disabled}
                />
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

        {!issued && (
          <div className="form-group">
            <label htmlFor="BillDrawerName">
              <i className="fas fa-user" aria-hidden="true" /> {tm("note.drawerName")}
            </label>
            <input
              type="text"
              id="BillDrawerName"
              name="BillDrawerName"
              className="form-control"
              placeholder={accountLabel || tm("note.drawerNamePlaceholder")}
              maxLength={200}
              autoComplete="off"
              value={value.drawerName ?? ""}
              onChange={(event) => set({ drawerName: event.target.value })}
              disabled={disabled}
              aria-describedby="BillDrawerName-help"
            />
            <small className="form-text text-muted" id="BillDrawerName-help">
              {tm("note.drawerNameHelp")}
            </small>
          </div>
        )}

        <div className="form-row">
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="BillTypeModal" className="required-field">
                <i className="fas fa-file-alt" aria-hidden="true" /> {tm("note.type")}
              </label>
              <select
                id="BillTypeModal"
                name="BillTypeModal"
                className="form-control no-select2"
                required
                value={value.noteType ?? "PLAIN"}
                onChange={(event) => set({ noteType: event.target.value as NoteType })}
                disabled={disabled}
              >
                {NOTE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tm(`note.types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="BillIsCollateralModal">
                <i className="fas fa-shield-alt" aria-hidden="true" /> {tm("note.collateral")}
              </label>
              <select
                id="BillIsCollateralModal"
                name="BillIsCollateralModal"
                className="form-control no-select2"
                value="false"
                disabled
                onChange={() => undefined}
                aria-describedby="BillIsCollateralModal-help"
              >
                <option value="false">{tm("note.collateralNormal")}</option>
                <option value="true">{tm("note.collateralYes")}</option>
              </select>
              <small className="form-text text-muted" id="BillIsCollateralModal-help">
                {tm("note.collateralHelp")}
              </small>
            </div>
          </div>
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
            <IssueDateInput
              id="BillIssueDate"
              label={tm("note.issueDate")}
              required={!issued}
              value={value.issueDate ?? ""}
              onChange={(issueDate) => set({ issueDate })}
              error={errors.issueDate}
              disabled={disabled}
            />
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
        <DescriptionInput
          id="BillDescription"
          label={tm("note.description")}
          placeholder={tm("note.descriptionPlaceholder")}
          value={value.description ?? ""}
          onChange={(description) => set({ description })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../../../api/client";
import {
  invalidateOrganization,
  useCompanyEDocumentSettings,
} from "../../../../pages/organization/api";
import type {
  CompanyEDocumentSettings,
  EDocumentProfile,
} from "../../../../pages/organization/types";
import { formatDateTime } from "../../../components";
import { eDocumentSeriesInput, errorMessage } from "../../../components/definitionLogic";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import {
  eDocumentBody,
  eDocumentValues,
  validateEDocument,
  type EDocumentValues,
} from "./definitionForms";

const SPACED = { marginTop: 14 } as const;
const FLEX_1 = { flex: 1 } as const;
const MESSAGE_HIDE_MS = 4000;

export type CompanyEDocumentTabProps = { companyId: string };

/**
 * Şirket › e-Belge (12.1a §6.12): ZTO Views/Uyumsoft/Settings.cshtml yerleşimi ve `uy-*` sınıfları
 * birebir; ayar şirket başınadır ("müşteri bazlı" → "şirket bazlı"). 12.1a'da yalnız kayıt: mükellef
 * sorgusu ve bağlantı testi görünür ama devre dışı (Faz 12.10). Gönderen VKN/Ünvan Genel sekmesinden.
 */
export function CompanyEDocumentTab({ companyId }: CompanyEDocumentTabProps) {
  const settings = useCompanyEDocumentSettings(companyId);
  if (settings.isPending) return <ZtoPageLoading />;
  if (settings.isError) {
    return (
      <div className="alert alert-danger" role="alert">
        {settings.error.message}
      </div>
    );
  }
  return <EDocumentForm companyId={companyId} settings={settings.data} />;
}

function EDocumentForm({
  companyId,
  settings,
}: {
  companyId: string;
  settings: CompanyEDocumentSettings;
}) {
  const { t } = useTranslation("ztoFinans");
  const client = useQueryClient();
  const [values, setValues] = useState<EDocumentValues>(() => eDocumentValues(settings));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!message?.ok) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_HIDE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest<CompanyEDocumentSettings>(
        "PUT",
        `/organization/companies/${companyId}/edocument-settings`,
        eDocumentBody(values),
      ),
    onSuccess: async (saved) => {
      setMessage({ ok: true, text: t("companies.uySaved") });
      // ZTO: başarıda şifre alanı boşaltılır ve ayarlar yeniden yüklenir.
      if (saved) client.setQueryData(["companies", "edocument-settings", companyId], saved);
      setValues((current) => ({ ...(saved ? eDocumentValues(saved) : current), password: "" }));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["companies", "edocument-settings", companyId] }),
        invalidateOrganization(client),
      ]);
    },
    onError: (error) =>
      setMessage({
        ok: false,
        text: t("definitions.errorPrefix", {
          message: errorMessage(error, t("definitions.error")),
        }),
      }),
  });

  const set = <K extends keyof EDocumentValues>(field: K, value: EDocumentValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));

  const onSave = () => {
    const invalid = validateEDocument(values);
    if (invalid) {
      setMessage({ ok: false, text: t("definitions.errorPrefix", { message: t(invalid) }) });
      return;
    }
    save.mutate();
  };

  const current = save.data ?? settings;
  const switchRow = (
    id: string,
    field: "enabled" | "despatchEnabled" | "inboxEnabled",
    title: string,
    note: string,
    extra?: string,
    first = false,
  ) => (
    <div className="uy-switch" style={first ? undefined : SPACED}>
      <input
        type="checkbox"
        id={id}
        checked={values[field]}
        onChange={(event) => set(field, event.target.checked)}
        aria-label={title}
      />
      <div>
        <b>{title}</b>
        <div className="uy-note">
          {note}
          {extra && <> {extra}</>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="uy-wrap">
      <div className="uy-head">
        <h1>{t("companies.uyTitle")}</h1>
        <p>{t("companies.uySubtitle")}</p>
      </div>

      <div
        id="uyMsg"
        className={message ? `uy-msg ${message.ok ? "ok" : "err"}` : "uy-msg"}
        style={message ? { display: "block" } : undefined}
        role={message?.ok === false ? "alert" : "status"}
      >
        {message?.text}
      </div>

      <div className="uy-card">
        <h2>
          {t("companies.uyStatus")}{" "}
          <span id="uyFlag" className={current.enabled ? "uy-flag on" : "uy-flag off"}>
            {t(current.enabled ? "companies.on" : "companies.off")}
          </span>
        </h2>
        {switchRow(
          "uyEnabled",
          "enabled",
          t("companies.uyEnabled"),
          t("companies.uyEnabledNote"),
          undefined,
          true,
        )}
        {switchRow(
          "uyDespatchEnabled",
          "despatchEnabled",
          t("companies.uyDespatch"),
          t("companies.uyDespatchNote"),
        )}
        {switchRow(
          "uyInboxEnabled",
          "inboxEnabled",
          t("companies.uyInbox"),
          t("companies.uyInboxNote"),
          t("companies.uyLastSync", {
            value: current.inboxLastSync ? formatDateTime(current.inboxLastSync) : "-",
          }),
        )}
      </div>

      <div className="uy-card">
        <h2>{t("companies.uyConnection")}</h2>
        <div className="uy-grid">
          <div className="uy-field full">
            <label htmlFor="uyUrl">{t("companies.uyServiceUrl")}</label>
            <input
              type="text"
              id="uyUrl"
              placeholder="https://efatura-test.uyumsoft.com.tr/Services/Integration"
              maxLength={300}
              value={values.serviceUrl}
              onChange={(event) => set("serviceUrl", event.target.value)}
            />
          </div>
          <div className="uy-field">
            <label htmlFor="uyUser">{t("companies.uyUsername")}</label>
            <input
              type="text"
              id="uyUser"
              autoComplete="off"
              maxLength={100}
              value={values.username}
              onChange={(event) => set("username", event.target.value)}
            />
          </div>
          <div className="uy-field">
            <label htmlFor="uyPass">{t("companies.uyPassword")}</label>
            <input
              type="password"
              id="uyPass"
              autoComplete="new-password"
              placeholder={t("companies.uyPasswordPlaceholder")}
              maxLength={200}
              value={values.password}
              onChange={(event) => set("password", event.target.value)}
            />
            <div className="uy-note" id="uyPassNote">
              {t(current.passwordSet ? "companies.uyPasswordSet" : "companies.uyPasswordEmpty")}
            </div>
          </div>
          <div className="uy-field">
            <label htmlFor="uySenderVkn">{t("companies.uySenderTax")}</label>
            <input type="text" id="uySenderVkn" disabled value={current.senderTaxNumber ?? ""} />
            <div className="uy-note">{t("companies.uySenderNote")}</div>
          </div>
          <div className="uy-field">
            <label htmlFor="uySenderTitle">{t("companies.uySenderTitle")}</label>
            <input type="text" id="uySenderTitle" disabled value={current.senderTitle} />
            <div className="uy-note">{t("companies.uySenderNote")}</div>
          </div>
          <div className="uy-field">
            <label htmlFor="uyProfile">{t("companies.uyProfile")}</label>
            <select
              id="uyProfile"
              value={values.defaultProfile}
              onChange={(event) => set("defaultProfile", event.target.value as EDocumentProfile)}
            >
              <option value="TICARIFATURA">{t("companies.uyProfileTicari")}</option>
              <option value="TEMELFATURA">{t("companies.uyProfileTemel")}</option>
              <option value="EARSIVFATURA">{t("companies.uyProfileEarsiv")}</option>
            </select>
          </div>
          <div className="uy-field">
            <label htmlFor="uySeries">{t("companies.uyInvoiceSeries")}</label>
            <input
              type="text"
              id="uySeries"
              maxLength={3}
              placeholder="ZTO"
              value={values.invoiceSeries}
              onChange={(event) => set("invoiceSeries", eDocumentSeriesInput(event.target.value))}
            />
          </div>
          <div className="uy-field">
            <label htmlFor="uyDespatchSeries">{t("companies.uyDespatchSeries")}</label>
            <input
              type="text"
              id="uyDespatchSeries"
              maxLength={3}
              placeholder="ZTI"
              value={values.despatchSeries}
              onChange={(event) => set("despatchSeries", eDocumentSeriesInput(event.target.value))}
            />
          </div>
          <div className="uy-field">
            <label htmlFor="uyTestMode">{t("companies.uyEnvironment")}</label>
            <select
              id="uyTestMode"
              value={values.testMode ? "true" : "false"}
              onChange={(event) => set("testMode", event.target.value === "true")}
            >
              <option value="true">{t("companies.test")}</option>
              <option value="false">{t("companies.live")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="uy-card">
        <h2>{t("companies.uyTaxpayer")}</h2>
        <div className="uy-check">
          <div className="uy-field" style={FLEX_1}>
            <label htmlFor="uyCheckVkn">{t("companies.uyTaxpayerLabel")}</label>
            <input type="text" id="uyCheckVkn" placeholder={t("companies.uyTaxpayerPlaceholder")} />
          </div>
          <button
            className="uy-btn ghost"
            id="uyCheckBtn"
            type="button"
            disabled
            title={t("companies.uyLaterTitle")}
          >
            {t("companies.uyTaxpayerQuery")}
          </button>
        </div>
        <div className="uy-note" id="uyCheckResult">
          {t("companies.uyLater")}
        </div>
      </div>

      <div className="uy-actions">
        <button
          className="uy-btn primary"
          id="uySaveBtn"
          type="button"
          disabled={save.isPending}
          onClick={onSave}
        >
          {t("companies.uySave")}
        </button>
        <button
          className="uy-btn ghost"
          id="uyTestBtn"
          type="button"
          disabled
          title={t("companies.uyLaterTitle")}
        >
          {t("companies.uyTest")}
        </button>
      </div>
    </div>
  );
}

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCompanies } from "../../../../pages/organization/api";
import type { Company } from "../../../../pages/organization/types";
import {
  ZtoAlert,
  ZtoAuditCell,
  ZtoDataTable,
  ZtoDefinitionDetailsModal,
  ZtoDefinitionListCard,
  ZtoDefinitionRowActions,
  useZtoConfirm,
} from "../../../components";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { companyDetailFields, DEFINITION_PATHS, statusText } from "./definitionDetails";
import { useCan, useDefinitionNotice, useToggleActive } from "./definitionHooks";

const column = createColumnHelper<Company>();

/**
 * Şirketler listesi (12.1a §6.12; ZTO'da yok — kiracı tek tüzel kişi): BranchProvince/Index düzeni ve
 * aynı introduction-details.js süslemesi (simge fa-landmark). Sıra sunucudan (varsayılan önce, sonra
 * kısa ad). Pasifleştirme/aktifleştirme `/auth/me` şirket listesini de yeniler.
 */
export function CompaniesPage() {
  const { t } = useTranslation("ztoFinans");
  useZtoRootClass("definition-list-page");
  const canManage = useCan("COMPANY_MANAGE");
  const [showPassive, setShowPassive] = useState(false);
  const [notice, setNotice] = useDefinitionNotice();
  const [detail, setDetail] = useState<Company | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { confirm, confirmModal } = useZtoConfirm();
  const companies = useCompanies({ active: showPassive ? undefined : true });
  const { mutate, isPending } = useToggleActive({
    base: "/organization/companies",
    messages: { deactivated: t("companies.deactivated"), activated: t("companies.activated") },
    onNotice: setNotice,
    reloadMe: true,
  });

  const columns = useMemo(
    () => [
      column.accessor("title", {
        header: t("companies.titleShortStatus"),
        meta: {
          cellClassName: "definition-list-primary-cell",
          searchValue: (_value: string, row: Company) => `${row.title} ${row.shortName}`,
        },
        cell: ({ row }) => (
          <div className="definition-cell-stack">
            <strong>{row.original.title}</strong>
            <small>{row.original.shortName}</small>
            <small>
              {statusText(row.original.active, t)}
              {row.original.defaultCompany && (
                <>
                  {" "}
                  <small className="badge badge-primary">{t("companies.defaultBadge")}</small>
                </>
              )}
            </small>
          </div>
        ),
      }),
      column.accessor((row) => row.taxNumber ?? "", {
        id: "tax",
        header: t("companies.taxColumn"),
        meta: {
          searchValue: (_value: string, row: Company) =>
            `${row.taxNumber ?? ""} ${row.taxOffice ?? ""}`,
        },
        cell: ({ row }) => (
          <div className="definition-cell-stack">
            <span>{row.original.taxNumber}</span>
            <small>{row.original.taxOffice}</small>
          </div>
        ),
      }),
      column.accessor((row) => row.phone ?? "", {
        id: "phone",
        header: t("companies.phoneEmail"),
        meta: {
          searchValue: (_value: string, row: Company) => `${row.phone ?? ""} ${row.email ?? ""}`,
        },
        cell: ({ row }) => (
          <div className="definition-cell-stack">
            <span>{row.original.phone}</span>
            <small>{row.original.email}</small>
          </div>
        ),
      }),
      column.accessor((row) => row.address ?? "", {
        id: "address",
        header: t("companies.address"),
      }),
      column.accessor((row) => (row.edocumentEnabled ? t("companies.on") : t("companies.off")), {
        id: "edocument",
        header: t("companies.edocColumn"),
        cell: ({ row }) => (
          <div className="definition-cell-stack">
            <span>{t(row.original.edocumentEnabled ? "companies.on" : "companies.off")}</span>
            <small>{t(row.original.edocumentTestMode ? "companies.test" : "companies.live")}</small>
          </div>
        ),
      }),
      column.accessor("createdAt", {
        id: "audit",
        header: t("definitions.auditColumn"),
        cell: ({ row }) => <ZtoAuditCell {...row.original} />,
        meta: {
          headerClassName: "definition-list-audit-head",
          cellClassName: "intro-audit-host definition-list-audit-cell",
          searchable: false,
          exportable: false,
        },
      }),
      column.display({
        id: "actions",
        header: t("definitions.actions"),
        enableSorting: false,
        meta: {
          headerClassName: "definition-list-actions-head",
          cellClassName: "definition-list-actions-cell",
          searchable: false,
          exportable: false,
        },
        cell: ({ row }) => (
          <ZtoDefinitionRowActions
            grouped
            detail={() => {
              setDetail(row.original);
              setDetailOpen(true);
            }}
            edit={canManage ? `${DEFINITION_PATHS.companies}/${row.original.id}` : undefined}
            toggle={
              canManage
                ? {
                    active: row.original.active,
                    disabled: isPending,
                    onActivate: () => mutate({ id: row.original.id, activate: true }),
                    onDeactivate: async () => {
                      if (await confirm({ message: t("definitions.confirmDelete"), note: null })) {
                        mutate({ id: row.original.id, activate: false });
                      }
                    },
                  }
                : undefined
            }
          />
        ),
      }),
    ],
    [t, canManage, mutate, isPending, confirm],
  );

  const rows = companies.data ?? [];
  return (
    <div className="container-fluid">
      <br />
      <ZtoDefinitionListCard
        title={t("companies.listTitle")}
        icon="fas fa-landmark"
        count={rows.length}
        newHref={canManage ? `${DEFINITION_PATHS.companies}/yeni` : undefined}
        notice={
          <>
            {notice && (
              <ZtoAlert
                variant={notice.variant}
                message={notice.message}
                onClose={() => setNotice(null)}
              />
            )}
            {companies.isError && (
              <div className="alert alert-danger" role="alert">
                {companies.error.message}
              </div>
            )}
          </>
        }
        toolbar={
          <div className="form-check mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="showPassive"
              checked={showPassive}
              onChange={(event) => setShowPassive(event.target.checked)}
            />
            <label className="form-check-label" htmlFor="showPassive">
              {t("definitions.showPassive")}
            </label>
          </div>
        }
      >
        <ZtoDataTable
          id="dataTable"
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          order={[]}
          tableClassName="table table-hover definition-list-table"
          tableDataAttributes={{ "data-definition-density": "standard" }}
          pageLength={10}
          searchPlaceholder={t("definitions.searchPlaceholder")}
          lengthAriaLabel={t("definitions.lengthAria")}
          cellDataLabel
          processing={companies.isPending}
          rowClassName={(row) => (row.active ? undefined : "definition-row--inactive")}
        />
      </ZtoDefinitionListCard>
      <ZtoDefinitionDetailsModal
        show={detailOpen}
        onHide={() => setDetailOpen(false)}
        entityKey="company"
        entityTitle={t("companies.entityTitle")}
        recordTitle={detail?.title}
        recordId={detail?.code ?? ""}
        status={detail ? statusText(detail.active, t) : undefined}
        fields={detail ? companyDetailFields(detail, t) : []}
        audit={detail}
      />
      {confirmModal}
    </div>
  );
}

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../../auth/authStore";
import { isMultiCompany, useActiveCompanyId } from "../../../../auth/companyStore";
import { useBranchList } from "../../../../pages/organization/api";
import type { Branch } from "../../../../pages/organization/types";
import {
  ZtoAlert,
  ZtoAuditCell,
  ZtoDataTable,
  ZtoDefinitionDetailsModal,
  ZtoDefinitionListCard,
  ZtoDefinitionRowActions,
  formatDate,
  useZtoConfirm,
} from "../../../components";
import { formatLocation, mapsUrl } from "../../../components/definitionLogic";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { DEFINITION_PATHS, statusText, workPlaceDetailFields } from "./definitionDetails";
import { useCan, useDefinitionNotice, useToggleActive } from "./definitionHooks";

const column = createColumnHelper<Branch>();

/**
 * İş Yerleri listesi (12.1a §6.9): ZTO Views/WorkPlace/Index.cshtml + introduction-details.js
 * süslemesi (key "workplace", simge fa-building). Sil = pasifleştir (geri alınabilir), pasifler
 * "Pasifleri göster" ile görünür ve Aktifleştir ile geri döner.
 */
export function WorkPlacesPage() {
  const { t } = useTranslation("ztoFinans");
  useZtoRootClass("definition-list-page");
  const me = useAuthStore((state) => state.me);
  const multiCompany = isMultiCompany(me?.companies);
  const activeCompanyId = useActiveCompanyId();
  const canManage = useCan("BRANCH_MANAGE");
  const [showPassive, setShowPassive] = useState(false);
  const [notice, setNotice] = useDefinitionNotice();
  const [detail, setDetail] = useState<Branch | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { confirm, confirmModal } = useZtoConfirm();
  const branches = useBranchList({
    active: showPassive ? undefined : true,
    companyId: activeCompanyId,
  });
  const toggle = useToggleActive({
    base: "/organization/branches",
    messages: { deactivated: t("workPlaces.deactivated"), activated: t("workPlaces.activated") },
    onNotice: setNotice,
  });
  const { mutate, isPending: pending } = toggle;

  const columns = useMemo(
    () => [
      column.accessor("name", {
        header: t("workPlaces.name"),
        meta: { cellClassName: "definition-list-primary-cell" },
      }),
      column.accessor((row) => row.phone ?? "", { id: "phone", header: t("workPlaces.phone") }),
      column.accessor((row) => row.address ?? "", {
        id: "address",
        header: t("workPlaces.address"),
      }),
      column.accessor((row) => formatLocation(row.latitude, row.longitude), {
        id: "location",
        header: t("workPlaces.locationColumn"),
        meta: { searchable: false },
        cell: ({ row }) =>
          row.original.latitude !== null && row.original.longitude !== null ? (
            <a
              href={mapsUrl(row.original.latitude, row.original.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              title={t("workPlaces.mapsTitle")}
            >
              <i className="fas fa-map-marker-alt" />
            </a>
          ) : null,
      }),
      column.accessor((row) => row.branchGroupName ?? t("definitions.unspecified"), {
        id: "group",
        header: t("workPlaces.group"),
      }),
      ...(multiCompany
        ? [column.accessor("companyName", { id: "company", header: t("definitions.company") })]
        : []),
      column.accessor("createdAt", {
        header: t("definitions.createdAt"),
        cell: ({ getValue }) => formatDate(getValue()),
        meta: {
          cellClassName: "definition-list-date-cell",
          searchValue: (value: string) => formatDate(value),
        },
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
            detail={() => {
              setDetail(row.original);
              setDetailOpen(true);
            }}
            edit={canManage ? `${DEFINITION_PATHS.workPlaces}/${row.original.id}` : undefined}
            toggle={
              canManage
                ? {
                    active: row.original.active,
                    disabled: pending,
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
    [t, multiCompany, canManage, mutate, pending, confirm],
  );

  const rows = branches.data ?? [];
  return (
    <div className="container-fluid">
      <br />
      <ZtoDefinitionListCard
        title={t("workPlaces.listTitle")}
        icon="fas fa-building"
        count={rows.length}
        newHref={canManage ? `${DEFINITION_PATHS.workPlaces}/yeni` : undefined}
        notice={
          <>
            {notice && (
              <ZtoAlert
                variant={notice.variant}
                message={notice.message}
                onClose={() => setNotice(null)}
              />
            )}
            {branches.isError && (
              <div className="alert alert-danger" role="alert">
                {branches.error.message}
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
          tableClassName="table table-hover definition-list-table"
          tableDataAttributes={{ "data-definition-density": "standard" }}
          pageLength={10}
          searchPlaceholder={t("definitions.searchPlaceholder")}
          lengthAriaLabel={t("definitions.lengthAria")}
          cellDataLabel
          processing={branches.isPending}
          rowClassName={(row) => (row.active ? undefined : "definition-row--inactive")}
        />
      </ZtoDefinitionListCard>
      <ZtoDefinitionDetailsModal
        show={detailOpen}
        onHide={() => setDetailOpen(false)}
        entityKey="workplace"
        entityTitle={t("workPlaces.entityTitle")}
        recordTitle={detail?.name}
        recordId={detail?.code ?? ""}
        status={detail ? statusText(detail.active, t) : undefined}
        fields={detail ? workPlaceDetailFields(detail, multiCompany, t) : []}
        audit={detail}
      />
      {confirmModal}
    </div>
  );
}

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../../auth/authStore";
import { isMultiCompany, useActiveCompanyId } from "../../../../auth/companyStore";
import { useBranchGroups } from "../../../../pages/organization/api";
import type { BranchGroup } from "../../../../pages/organization/types";
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
import {
  branchGroupDetailFields,
  DEFINITION_PATHS,
  groupTypeText,
  statusText,
} from "./definitionDetails";
import { useCan, useDefinitionNotice, useToggleActive } from "./definitionHooks";

const column = createColumnHelper<BranchGroup>();

/**
 * Şubeler listesi (12.1a §6.11): ZTO Views/BranchProvince/Index.cshtml (yığın hücreler, "Kayıt
 * Bilgileri" sütunu, btn-group'lu işlemler, sıra Kayıt Bilgileri azalan) + introduction-details.js
 * süslemesi (key "branch", simge fa-city, yoğunluk "grouped").
 */
export function BranchGroupsPage() {
  const { t } = useTranslation("ztoFinans");
  useZtoRootClass("definition-list-page");
  const me = useAuthStore((state) => state.me);
  const multiCompany = isMultiCompany(me?.companies);
  const activeCompanyId = useActiveCompanyId();
  const canManage = useCan("BRANCH_MANAGE");
  const [showPassive, setShowPassive] = useState(false);
  const [notice, setNotice] = useDefinitionNotice();
  const [detail, setDetail] = useState<BranchGroup | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { confirm, confirmModal } = useZtoConfirm();
  const groups = useBranchGroups({
    active: showPassive ? undefined : true,
    companyId: activeCompanyId,
  });
  const { mutate, isPending } = useToggleActive({
    base: "/organization/branch-groups",
    messages: {
      deactivated: t("branchGroups.deactivated"),
      activated: t("branchGroups.activated"),
    },
    onNotice: setNotice,
    conflictMessage: (code) =>
      code === "BRANCH_GROUP_HAS_ACTIVE_BRANCHES" ? t("branchGroups.hasBranches") : undefined,
  });

  const columns = useMemo(
    () => [
      column.accessor("name", {
        header: t("branchGroups.nameTypeStatus"),
        meta: {
          cellClassName: "definition-list-primary-cell",
          searchValue: (_value: string, row: BranchGroup) =>
            `${row.name} ${groupTypeText(row.groupType, t)}`,
        },
        cell: ({ row }) => (
          <div className="definition-cell-stack">
            <strong>{row.original.name}</strong>
            <small>{groupTypeText(row.original.groupType, t)}</small>
            <small>{statusText(row.original.active, t)}</small>
          </div>
        ),
      }),
      ...(multiCompany
        ? [column.accessor("companyName", { id: "company", header: t("definitions.company") })]
        : []),
      column.accessor((row) => row.phone ?? "", {
        id: "phone",
        header: t("branchGroups.phoneEmail"),
        meta: {
          searchValue: (_value: string, row: BranchGroup) =>
            `${row.phone ?? ""} ${row.email ?? ""}`,
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
        header: t("branchGroups.address"),
      }),
      column.accessor((row) => row.taxNumber ?? "", {
        id: "tax",
        header: t("branchGroups.taxTaxOffice"),
        meta: {
          searchValue: (_value: string, row: BranchGroup) =>
            `${row.taxNumber ?? ""} ${row.taxOffice ?? ""}`,
        },
        cell: ({ row }) => (
          <div className="definition-cell-stack">
            <span>{row.original.taxNumber}</span>
            <small>{row.original.taxOffice}</small>
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
            edit={canManage ? `${DEFINITION_PATHS.branchGroups}/${row.original.id}` : undefined}
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
    [t, multiCompany, canManage, mutate, isPending, confirm],
  );

  const rows = groups.data ?? [];
  return (
    <div className="container-fluid">
      <br />
      <ZtoDefinitionListCard
        title={t("branchGroups.listTitle")}
        icon="fas fa-city"
        count={rows.length}
        newHref={canManage ? `${DEFINITION_PATHS.branchGroups}/yeni` : undefined}
        notice={
          <>
            {notice && (
              <ZtoAlert
                variant={notice.variant}
                message={notice.message}
                onClose={() => setNotice(null)}
              />
            )}
            {groups.isError && (
              <div className="alert alert-danger" role="alert">
                {groups.error.message}
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
          order={[{ id: "audit", desc: true }]}
          tableClassName="table table-hover definition-list-table"
          tableDataAttributes={{ "data-definition-density": "grouped" }}
          pageLength={10}
          searchPlaceholder={t("definitions.searchPlaceholder")}
          lengthAriaLabel={t("definitions.lengthAria")}
          cellDataLabel
          processing={groups.isPending}
          rowClassName={(row) => (row.active ? undefined : "definition-row--inactive")}
        />
      </ZtoDefinitionListCard>
      <ZtoDefinitionDetailsModal
        show={detailOpen}
        onHide={() => setDetailOpen(false)}
        entityKey="branch"
        entityTitle={t("branchGroups.entityTitle")}
        recordTitle={detail?.name}
        recordId={detail?.name ?? ""}
        status={detail ? statusText(detail.active, t) : undefined}
        fields={detail ? branchGroupDetailFields(detail, multiCompany, t) : []}
        audit={detail}
      />
      {confirmModal}
    </div>
  );
}

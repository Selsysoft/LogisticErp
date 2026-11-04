import { Button } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import {
  DataTable,
  FormDialog,
  formatDate,
  QueryState,
  SectionHeader,
  shiftDays,
  today,
  useCan,
  usePaging,
} from "../finance/common";
import { Page } from "../finance/types";
import { customerName, customerOptions, orNull, useCustomers, useTariffs } from "./common";
import { Contract } from "./types";

export function ContractsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CRM_EDIT");
  const customers = useCustomers();
  const tariffs = useTariffs();
  const paging = usePaging();
  const [adding, setAdding] = useState(false);

  const list = useQuery({
    queryKey: ["crm", "contracts", paging.page, paging.size],
    queryFn: () =>
      apiGet<Page<Contract>>(
        `/crm/contracts?page=${paging.page}&size=${paging.size}&sort=startDate,desc`,
      ),
    placeholderData: keepPreviousData,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["crm"] });
  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("POST", `/crm/contracts/${id}/status`, { status }),
    onSuccess: refresh,
  });
  const tariffCode = (id: string | null) => tariffs.data?.find((x) => x.id === id)?.code ?? "—";

  return (
    <>
      <SectionHeader title={t("crm.tabs.contracts")}>
        {canEdit && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            {t("crm.action.newContract")}
          </Button>
        )}
      </SectionHeader>
      {changeStatus.isError && <ErrorState error={changeStatus.error} />}
      <QueryState isPending={list.isPending} error={list.error} />
      {list.data && (
        <DataTable
          rows={list.data.content}
          rowKey={(row) => row.id}
          columns={[
            { header: t("crm.field.number"), render: (r) => r.number },
            {
              header: t("finance.field.account"),
              render: (r) => customerName(customers.data, r.accountId),
            },
            { header: t("crm.field.tariff"), render: (r) => tariffCode(r.tariffId) },
            { header: t("crm.field.startDate"), render: (r) => formatDate(r.startDate) },
            { header: t("crm.field.endDate"), render: (r) => formatDate(r.endDate) },
            {
              header: t("finance.field.status"),
              render: (r) => t(`crm.contractStatus.${r.status}`),
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (r) =>
                canEdit &&
                r.status === "ACTIVE" && (
                  <>
                    <Button
                      size="small"
                      onClick={() => changeStatus.mutate({ id: r.id, status: "ENDED" })}
                    >
                      {t("crm.action.endContract")}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => changeStatus.mutate({ id: r.id, status: "CANCELLED" })}
                    >
                      {t("crm.action.cancelContract")}
                    </Button>
                  </>
                ),
            },
          ]}
          pagination={{
            count: list.data.totalElements,
            page: paging.page,
            size: paging.size,
            onPage: paging.setPage,
            onSize: paging.setSize,
          }}
        />
      )}
      {adding && (
        <FormDialog
          title={t("crm.action.newContract")}
          fields={[
            {
              name: "accountId",
              label: t("finance.field.account"),
              type: "select",
              required: true,
              options: customerOptions(customers.data),
            },
            {
              name: "tariffId",
              label: t("crm.field.tariff"),
              type: "select",
              options: (tariffs.data ?? []).map((x) => ({
                value: x.id,
                label: `${x.code} · ${x.name}`,
              })),
            },
            {
              name: "startDate",
              label: t("crm.field.startDate"),
              type: "date",
              required: true,
              defaultValue: today(),
            },
            {
              name: "endDate",
              label: t("crm.field.endDate"),
              type: "date",
              required: true,
              defaultValue: shiftDays(today(), 365),
            },
            { name: "paymentTermDays", label: t("crm.field.paymentTerm") },
            { name: "fuelSurchargePercent", label: t("crm.field.fuelPercent"), type: "amount" },
            { name: "waitingHourlyFee", label: t("crm.field.waitingFee"), type: "amount" },
            { name: "specialTerms", label: t("crm.field.specialTerms") },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            apiRequest("POST", "/crm/contracts", {
              accountId: values.accountId,
              tariffId: orNull(values.tariffId),
              startDate: values.startDate,
              endDate: values.endDate,
              paymentTermDays: orNull(values.paymentTermDays),
              fuelSurchargePercent: orNull(values.fuelSurchargePercent),
              waitingHourlyFee: orNull(values.waitingHourlyFee),
              specialTerms: orNull(values.specialTerms),
            })
          }
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
    </>
  );
}

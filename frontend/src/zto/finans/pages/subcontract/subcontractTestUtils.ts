import type { SubcontractCostRow } from "../../../../pages/operations/types";

/** Taşeron testlerinin ortak satırı (yalnız testler içe aktarır): POSTED, TRY, KDV/tevkifat/kesintili. */
export function makeRow(overrides: Partial<SubcontractCostRow> = {}): SubcontractCostRow {
  return {
    shipmentId: "s1",
    shipmentNumber: "SF-2026-0007",
    legId: "l1",
    legSequenceNo: 1,
    shipmentStatus: "LOADED",
    customerName: "Alıcı A.Ş.",
    cargoDescription: "Kumaş",
    freightInvoiceNumber: null,
    vehiclePlate: null,
    trailerPlate: null,
    driverName: null,
    branchId: "b1",
    branchName: "Merkez",
    loadingDate: "2026-11-10",
    transportMode: "ROAD",
    carrierAccountId: "a1",
    carrierName: "Hızlı Nakliyat",
    costId: "c1",
    status: "POSTED",
    money: { amount: "10000.00", currency: "TRY" },
    vatAmount: "2000.00",
    withholdingAmount: "400.00",
    deductionAmount: "100.00",
    totalAmount: "12000.00",
    payableAmount: "11500.00",
    advanceAmount: "0.00",
    documentNo: "FTR-1",
    documentType: "ALIS_FATURASI",
    costDate: "2026-11-11",
    exchangeRate: "1.000000",
    description: null,
    postedAt: "2026-11-11T10:00:00Z",
    ledger: null,
    ...overrides,
  };
}

/** Tek şirket: "İzmir" grubu (Merkez, Liman) ve grupsuz "Depo". */
export const BRANCH_TREE = [
  {
    companyId: "c1",
    companyName: "Acme",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "İzmir",
        groupActive: true,
        branches: [
          { id: "b1", code: "1", name: "Merkez", active: true },
          { id: "b2", code: "2", name: "Liman", active: true },
        ],
      },
      {
        groupId: null,
        groupName: "Diğer",
        groupActive: true,
        branches: [{ id: "b3", code: "3", name: "Depo", active: true }],
      },
    ],
  },
];

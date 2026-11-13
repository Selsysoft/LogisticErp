import type { BranchTree } from "../branch/branchTree";
import type { ZtoSelectItem } from "../components/selectLogic";

/** Bileşen vitrininin sahte verileri (canlı veri gerektirmez). Belirlenimci: her çizimde aynı. */

export interface ShowcaseTransaction {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  documentNo: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

const DESCRIPTIONS = [
  "Navlun faturası",
  "Havale ile tahsilat",
  "Çek tahsilatı",
  "Yakıt alımı",
  "Şoför harcırahı",
  "Gümrük masrafı",
  "Kasa ile ödeme",
  "İade faturası",
];

/** Basit doğrusal eşlik üreteci; Math.random yerine, testte de aynı sonuç. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** count satırlık cari hareket listesi; bakiye = önceki bakiye + borç − alacak (kuruş yuvarlamalı). */
export function buildShowcaseTransactions(count = 57, start = "2026-09-01"): ShowcaseTransaction[] {
  const random = seeded(20261113);
  const [year, month, day] = start.split("-").map(Number);
  const rows: ShowcaseTransaction[] = [];
  let balance = 0;
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(year, month - 1, day + i * 2));
    const isDebit = random() < 0.55;
    const amount = Math.round((500 + random() * 49_500) * 100) / 100;
    const debit = isDebit ? amount : 0;
    const credit = isDebit ? 0 : amount;
    balance = Math.round((balance + debit - credit) * 100) / 100;
    rows.push({
      id: `t${i + 1}`,
      date: date.toISOString().slice(0, 10),
      documentNo: `BLG-${String(2026000 + i + 1)}`,
      description: DESCRIPTIONS[i % DESCRIPTIONS.length],
      debit,
      credit,
      balance,
    });
  }
  return rows;
}

/** İki şirketli, gruplu ve grupsuz şube içeren örnek ağaç (MX5 §5.2 sözleşmesi). */
export const SHOWCASE_BRANCH_TREE: BranchTree = [
  {
    companyId: "c1",
    companyName: "Blackrose Lojistik A.Ş.",
    groups: [
      {
        groupId: "g1",
        groupName: "Marmara",
        branches: [
          { id: "b1", code: "IST", name: "İstanbul Merkez", active: true },
          { id: "b2", code: "GEB", name: "Gebze Depo", active: true },
          { id: "b3", code: "BUR", name: "Bursa", active: true },
        ],
      },
      {
        groupId: "g2",
        groupName: "Ege",
        branches: [
          { id: "b4", code: "IZM", name: "İzmir", active: true },
          { id: "b5", code: "MAN", name: "Manisa", active: true },
        ],
      },
    ],
  },
  {
    companyId: "c2",
    companyName: "Blackrose Gümrük Ltd. Şti.",
    groups: [
      {
        groupId: "g3",
        groupName: "Sınır Kapıları",
        branches: [
          { id: "b6", code: "KPK", name: "Kapıkule", active: true },
          { id: "b7", code: "MRS", name: "Mersin Liman", active: true },
        ],
      },
      {
        groupId: null,
        groupName: "Diğer",
        branches: [{ id: "b8", code: "ANK", name: "Ankara İrtibat", active: true }],
      },
    ],
  },
];

export const SHOWCASE_SELECT_OPTIONS: ZtoSelectItem[] = [
  {
    label: "Müşteri",
    options: [
      { value: "a1", label: "Akdeniz Tekstil" },
      { value: "a2", label: "Çağrı Gıda" },
      { value: "a3", label: "Iğdır Ticaret" },
    ],
  },
  {
    label: "Nakliye Firması",
    options: [
      { value: "a4", label: "Şişli Taşımacılık" },
      { value: "a5", label: "Öztürk Nakliyat", disabled: true },
    ],
  },
  {
    label: "Tedarikçi",
    options: [
      { value: "a6", label: "Ünal Akaryakıt" },
      { value: "a7", label: "Görkem Yedek Parça" },
    ],
  },
];

/** İş yeri çipleri için örnek kaynak: her hareketin iş yeri adı. */
export function showcaseWorkPlaceNames(count = 57): string[] {
  const names = ["İstanbul Merkez", "Gebze Depo", "İzmir", "Kapıkule", ""];
  return Array.from({ length: count }, (_, i) => names[(i * 7) % names.length]);
}

/** Ay bazında borç/alacak toplamları (bar grafiği). */
export function monthlyTotals(rows: ShowcaseTransaction[]) {
  const months = new Map<string, { debit: number; credit: number }>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    const total = months.get(key) ?? { debit: 0, credit: 0 };
    total.debit = Math.round((total.debit + row.debit) * 100) / 100;
    total.credit = Math.round((total.credit + row.credit) * 100) / 100;
    months.set(key, total);
  }
  const labels = [...months.keys()].sort();
  return {
    labels,
    debit: labels.map((m) => months.get(m)!.debit),
    credit: labels.map((m) => months.get(m)!.credit),
  };
}

/** Açıklama bazında hareket sayısı (pasta grafiği). */
export function countByDescription(rows: ShowcaseTransaction[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.description, (counts.get(row.description) ?? 0) + 1);
  return { labels: [...counts.keys()], values: [...counts.values()] };
}

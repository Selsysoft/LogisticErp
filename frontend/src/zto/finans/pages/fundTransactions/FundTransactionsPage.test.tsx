// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import {
  TWO_COMPANIES,
  apiError,
  fakeApi,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import {
  MANAGER,
  makeDetail,
  makeFund,
  makeRow,
  mockFundCommon,
  txPage,
} from "../funds/fundsTestUtils";
import { todayIso, addDaysIso } from "./fundTransactionsLogic";
import { FundTransactionsPage } from "./FundTransactionsPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const download = vi.hoisted(() => vi.fn());
vi.mock("../../../export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../export")>()),
  downloadBlob: download,
}));

type ModalProps = {
  show: boolean;
  onHide: () => void;
  mode: string;
  presetFundAccountId?: string;
  presetBranchId?: string;
  presetCurrency?: string;
  presetMethod?: string;
};
// FE-2 modalları ayrı test edilir; burada yalnız sayfanın verdiği proplar (12.2a §5.13).
const modals = vi.hoisted(() => ({ payment: [] as unknown[], collection: [] as unknown[] }));
vi.mock("../settlementModals", () => {
  const stub = (name: string, log: unknown[]) =>
    function Stub(props: ModalProps) {
      log.push(props);
      return props.show ? (
        <div role="dialog" aria-label={name} data-mode={props.mode}>
          <span data-testid="preset">
            {[
              props.presetMethod,
              props.presetFundAccountId ?? "-",
              props.presetBranchId ?? "-",
              props.presetCurrency ?? "-",
            ].join("|")}
          </span>
          <button type="button" onClick={props.onHide}>
            Kapat-{name}
          </button>
        </div>
      ) : null;
    };
  return {
    PaymentModal: stub("ödeme-modalı", modals.payment),
    CollectionModal: stub("tahsilat-modalı", modals.collection),
  };
});

const ROUTES = {
  "banka-hareketleri": <FundTransactionsPage key="BANK" kind="BANK" />,
  "kasa-hareketleri": <FundTransactionsPage key="CASH" kind="CASH" />,
};

const FUNDS = [
  makeFund(),
  makeFund({ id: "f2", name: "Garanti", code: "GAR-1", bankBranchName: "Şişli", branchId: "b2" }),
  makeFund({ id: "f3", name: "Kredi", accountType: "CREDIT" }),
];

beforeEach(() => {
  fakeApi.reset();
  download.mockReset();
  modals.payment.length = 0;
  modals.collection.length = 0;
  signIn(MANAGER);
  mockFundCommon();
  fakeApi.on("GET", /^\/finance\/funds\?/, FUNDS);
  fakeApi.on(
    "GET",
    /^\/finance\/funds\/transactions\?/,
    txPage([
      makeRow(),
      makeRow({
        id: "t2",
        direction: "IN",
        accountingType: "BANK_TO_CASH",
        accountId: null,
        accountName: null,
        reversed: true,
      }),
    ]),
  );
});

afterEach(cleanup);

const lastQuery = () =>
  [...fakeApi.log("GET")].reverse().find((p) => p.startsWith("/finance/funds/transactions?")) ?? "";
const headers = () =>
  Array.from(document.querySelectorAll("#transactionsTable thead th"), (th) =>
    (th.textContent ?? "").trim(),
  );

describe(
  "FundTransactionsPage (ZTO BankTransactions/Index, CashTransactions/Index)",
  { timeout: 40_000 },
  () => {
    it("BT: başlık, süzgeç varsayılanları (yerel takvim), 11 sütun, satırlar ve sorgu", async () => {
      renderAt("/zto-finans/banka-hareketleri", ROUTES);
      await screen.findAllByText("Lastik ödemesi");
      expect(document.querySelector(".zto-finans")?.className).toContain(
        "zto-page-bank-transactions",
      );
      expect(screen.getByRole("heading", { name: "Banka Hareketleri" })).toBeTruthy();
      const today = todayIso();
      expect((document.getElementById("filterStartDate") as HTMLInputElement).value).toBe(
        addDaysIso(today, -7),
      );
      expect((document.getElementById("filterEndDate") as HTMLInputElement).value).toBe(
        addDaysIso(today, 1),
      );
      expect(screen.getByText("Bİtİş", { exact: false })).toBeTruthy();
      expect(headers()).toEqual([
        "S.No",
        "TARİH",
        "İŞ YERİ",
        "Banka",
        "Tür",
        "MUHASEBE TİPİ",
        "Tutar",
        "BAKİYE",
        "CARİ HESAP",
        "Açıklama",
        "İşlem",
      ]);
      const query = lastQuery();
      expect(query).toContain("kind=BANK");
      expect(query).toContain(`from=${addDaysIso(today, -7)}`);
      expect(query).toContain("size=50");
      expect(query).toContain("sort=transactionDate%2Cdesc");
      const first = document.querySelector("#transactionsTable tbody tr") as HTMLElement;
      expect(within(first).getByText("Cari Ödeme")).toBeTruthy();
      expect(within(first).getByText("-250,00 ₺", { exact: false })).toBeTruthy();
      expect(
        within(first).getByRole("img", {
          name: /Bakiye hesabı: \(1\.500,00\) - \(250,00\) = 1\.250,00/,
        }),
      ).toBeTruthy();
      expect(
        within(first)
          .getByRole("link", { name: /Ankara Lastik/ })
          .getAttribute("href"),
      ).toBe("/zto-finans/cari-kartlar/a1/hareketler");
      expect(
        within(first)
          .getByRole("link", { name: /Ödemeyi Düzenle/ })
          .getAttribute("href"),
      ).toBe("/zto-finans/odemeler?openEditPayment=true&paymentId=s1");
      expect(screen.getByText("İptal/Ters kayıt")).toBeTruthy();
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
      expect(document.querySelector(".table-responsive")?.getAttribute("role")).toBe("region");
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Yeni Ödeme/ }));
      const dialog = screen.getByRole("dialog", { name: "ödeme-modalı" });
      expect(dialog.getAttribute("data-mode")).toBe("add");
      expect(within(dialog).getByTestId("preset").textContent).toBe("BANK|-|-|-");
      fireEvent.click(within(dialog).getByRole("button", { name: "Kapat-ödeme-modalı" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("Banka süzgeci ZtoSearchableSelect: arama, seçim → sorgu + seçili hesap özeti", async () => {
      fakeApi.on(
        "GET",
        "/finance/funds/f2",
        makeDetail({ id: "f2", name: "Garanti", futureCount: 2, futureNet: 30 }),
      );
      fakeApi.on(
        "GET",
        /^\/finance\/funds\/transactions\?.*fundId=f2/,
        txPage([makeRow({ fundAccountId: "f2" })], {
          currencies: [{ currency: "TRY", totalIn: 100, totalOut: 250, net: -150, count: 1 }],
          periodOpening: 1000,
          periodClosing: 850,
        }),
      );
      renderAt("/zto-finans/banka-hareketleri", ROUTES);
      await screen.findAllByText("Lastik ödemesi");
      const trigger = document.getElementById("filterBank") as HTMLElement;
      expect(trigger.className).toContain("ss-trigger");
      expect(trigger.textContent).toBe("Tüm Bankalar");
      fireEvent.click(trigger);
      const search = screen.getByPlaceholderText("Banka ara...");
      expect(
        within(screen.getByRole("listbox"))
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual([
        "Tüm Bankalar",
        "Ziraat Vadesiz | Konak (ZRT-1) [Vadesiz]",
        "Garanti | Şişli (GAR-1) [Vadesiz]",
      ]);
      fireEvent.change(search, { target: { value: "sisli" } });
      fireEvent.click(within(screen.getByRole("listbox")).getByRole("option"));
      await waitFor(() => expect(lastQuery()).toContain("fundId=f2"));
      expect(lastQuery()).toContain("summary=true");
      await screen.findByText("FİLTRELENEN");
      expect(screen.getByText("850,00₺")).toBeTruthy();
      expect(
        screen.getByText(/2 ileri tarihli \(vadesi gelmemiş\) hareket var — net 30,00₺/),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Yeni Tahsilat/ }));
      const dialog = screen.getByRole("dialog", { name: "tahsilat-modalı" });
      expect(within(dialog).getByTestId("preset").textContent).toBe("BANK|f2|b2|TRY");
      expect(screen.queryByRole("dialog", { name: "ödeme-modalı" })).toBeNull();
    });

    it("12.2a derin bağlantı: ?openModal=true fon listesi gelince Yeni Ödeme modalını açar, parametre silinir", async () => {
      fakeApi.on("GET", "/finance/funds/f2", makeDetail({ id: "f2", name: "Garanti" }));
      renderAt("/zto-finans/banka-hareketleri?fundId=f2&openModal=true", ROUTES);
      const dialog = await screen.findByRole("dialog", { name: "ödeme-modalı" });
      expect(within(dialog).getByTestId("preset").textContent).toBe("BANK|f2|b2|TRY");
      await waitFor(() =>
        expect(screen.getByTestId("where").textContent).toBe(
          "/zto-finans/banka-hareketleri?fundId=f2",
        ),
      );
      expect(lastQuery()).toContain("fundId=f2");
    });

    it("12.2a derin bağlantı: kasa kartı Tahsilat → Yeni Tahsilat (Nakit), yetkisizde yok sayılır", async () => {
      fakeApi.on("GET", /^\/finance\/funds\?/, [
        makeFund({ id: "k1", kind: "CASH", name: "Merkez Kasa", branchId: "b2", currency: "EUR" }),
      ]);
      fakeApi.on("GET", "/finance/funds/k1", makeDetail({ id: "k1", kind: "CASH" }));
      const path =
        "/zto-finans/kasa-hareketleri?fundId=k1&openCollection=true&collectionMethod=Nakit";
      renderAt(path, ROUTES);
      const dialog = await screen.findByRole("dialog", { name: "tahsilat-modalı" });
      expect(within(dialog).getByTestId("preset").textContent).toBe("CASH|k1|b2|EUR");
      await waitFor(() =>
        expect(screen.getByTestId("where").textContent).toBe(
          "/zto-finans/kasa-hareketleri?fundId=k1",
        ),
      );
      cleanup();
      const rendered = modals.collection.length;
      signIn(["FINANCE_VIEW"]);
      renderAt(path, ROUTES);
      await screen.findAllByText("Lastik ödemesi");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("button", { name: /Yeni Ödeme/ })).toBeNull();
      expect(screen.queryByRole("link", { name: /Ödemeyi Düzenle/ })).toBeNull();
      expect(modals.collection).toHaveLength(rendered);
    });

    it("süzgeçler Filtrele ile uygulanır; Temizle ilk varsayılana döner; iş yeri anında", async () => {
      renderAt("/zto-finans/banka-hareketleri?fundId=f1", ROUTES);
      fakeApi.on("GET", "/finance/funds/f1", makeDetail());
      await screen.findAllByText("Lastik ödemesi");
      fireEvent.change(document.getElementById("filterTransactionType") as Element, {
        target: { value: "OUT" },
      });
      fireEvent.change(document.getElementById("filterAccountingType") as Element, {
        target: { value: "eft" },
      });
      expect(lastQuery()).not.toContain("direction=");
      fireEvent.click(screen.getByRole("button", { name: "Filtrele" }));
      await waitFor(() => expect(lastQuery()).toContain("direction=OUT"));
      expect(lastQuery()).toContain("accountingType=EFT");
      expect(lastQuery()).toContain("fundId=f1");
      fireEvent.click(screen.getByRole("button", { name: "Temizle" }));
      await waitFor(() => expect(lastQuery()).not.toContain("direction="));
      expect(lastQuery()).not.toContain("fundId=");
      expect((document.getElementById("filterAccountingType") as HTMLSelectElement).value).toBe(
        "all",
      );
      fireEvent.click(screen.getByRole("button", { name: "Yenile" }));
      expect(document.querySelector(".btn-filter-refresh i")?.className).toContain("is-spinning");
    });

    it("CT: turuncu tema, 10 sütun, 18 ZTO muhasebe tipi + ekler, 'BİTİŞ', bitiş bugün, sayfa 25", async () => {
      renderAt("/zto-finans/kasa-hareketleri", ROUTES);
      await screen.findAllByText("Lastik ödemesi");
      expect(document.querySelector(".zto-finans")?.className).toContain(
        "zto-page-cash-transactions",
      );
      expect(screen.getByText("BİTİŞ", { exact: false })).toBeTruthy();
      expect((document.getElementById("filterEndDate") as HTMLInputElement).value).toBe(todayIso());
      expect(headers()).toHaveLength(10);
      expect(headers()).not.toContain("CARİ HESAP");
      const options = Array.from(
        (document.getElementById("filterAccountingType") as HTMLSelectElement).options,
        (o) => o.textContent,
      );
      expect(options.slice(0, 18)).toEqual([
        "Tüm Tipler",
        "Cari Ödeme",
        "Cari Tahsilat",
        "EFT",
        "Havale",
        "Virman (Transfer)",
        "Döviz Bozum",
        "Bankadan Kasaya",
        "Kasadan Bankaya",
        "Kasadan Kasaya",
        "Net Maaş",
        "Çek Tahsil",
        "Senet Tahsil",
        "Bankadan Çekim",
        "Bankaya Yatırma",
        "Masraf",
        "Gelir",
        "Diğer",
      ]);
      expect(lastQuery()).toContain("size=25");
      expect(document.getElementById("filterCash")?.textContent).toBe("Tüm Kasalar");
      expect(document.querySelector(".btn-outline-warning")).toBeTruthy();
    });

    it("BT-2 detay modalı: tutar kartı, bilgiler, yalnız Kapat", async () => {
      fakeApi.on("GET", "/finance/funds/transactions/t1", {
        ...makeRow(),
        transferCode: "VRM-2026-000001",
        fund: {
          id: "f1",
          code: "ZRT-1",
          name: "Ziraat Vadesiz",
          bankName: null,
          iban: "TR33",
          accountNo: "****1234",
          bankBranchName: "Konak",
          currency: "TRY",
        },
        source: {
          kind: "SETTLEMENT",
          id: "s1",
          code: "OD-1",
          route: "/zto-finans/odemeler?settlementId=s1",
        },
      });
      renderAt("/zto-finans/banka-hareketleri", ROUTES);
      await screen.findAllByText("Lastik ödemesi");
      fireEvent.click(screen.getAllByRole("button", { name: "Detay" })[0]);
      expect(await screen.findByText("İşlem Detayı")).toBeTruthy();
      await screen.findByText("Banka Bilgileri");
      expect(screen.getByText("ÇIKIŞ")).toBeTruthy();
      expect(screen.getByText("#VRM-2026-000001")).toBeTruthy();
      expect(screen.getByRole("link", { name: /Görüntüle \(OD-1\)/ }).getAttribute("href")).toBe(
        "/zto-finans/odemeler?settlementId=s1",
      );
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog)
          .getAllByRole("button")
          .map((b) => b.textContent?.trim()),
      ).toEqual(["", "Kapat"]);
      fireEvent.click(within(dialog).getAllByRole("button", { name: "Kapat" })[1]);
      await waitFor(() => expect(screen.queryByText("İşlem Detayı")).toBeNull());
    });

    it("BT-3 faaliyet raporu: banka zorunlu, yeni sekmede açar", async () => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      renderAt("/zto-finans/banka-hareketleri", ROUTES);
      await screen.findAllByText("Lastik ödemesi");
      fireEvent.click(screen.getByRole("button", { name: /Faaliyet Raporu/ }));
      expect(await screen.findByText("FIFO Giriş-Çıkış Eşleştirmesi")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Raporu Göster/ }));
      expect(screen.getByRole("alert").textContent).toBe("Lütfen bir banka seçin.");
      fireEvent.change(document.getElementById("activityReportBank") as Element, {
        target: { value: "f1" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Raporu Göster/ }));
      expect(open.mock.calls[0][0]).toMatch(
        /^\/zto-finans-yazdir\/faaliyet-raporu\/f1\?from=\d{4}-\d{2}-\d{2}&to=/,
      );
      open.mockRestore();
    });

    it("Excel: CSV başlıkları, BOM, dosya adı; boş veri ve 10.000 aşımı iletisi", async () => {
      fakeApi.on("GET", /^\/finance\/funds\/transactions\/export\?/, [makeRow()]);
      renderAt("/zto-finans/banka-hareketleri", ROUTES);
      await screen.findAllByText("Lastik ödemesi");
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
      });
      await waitFor(() => expect(download).toHaveBeenCalled());
      const [blob, name] = download.mock.calls[0] as [Blob, string];
      expect(name).toBe(`banka_hareketleri_${todayIso()}.csv`);
      // FileReader UTF-8 çözerken BOM'u atar; BOM baytları ayrıca denetlenir.
      const bytes = await new Promise<Uint8Array>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.readAsArrayBuffer(blob);
      });
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
      expect(text.split("\n")[0]).toBe(
        String.fromCharCode(0xfeff) +
          "Sıra No;Tarih;Banka;Banka Kodu;İşlem Türü;Muhasebe Tipi;Tutar;Para Birimi;Cari Hesap Kodu;Cari Hesap Adı;Açıklama",
      );
      fakeApi.on("GET", /^\/finance\/funds\/transactions\/export\?/, []);
      fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
      await screen.findByText("Dışa aktarılacak veri bulunamadı.");
      fakeApi.on("GET", /^\/finance\/funds\/transactions\/export\?/, () => {
        throw apiError(422, "RESULT_TOO_LARGE", "çok");
      });
      fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
      await screen.findByText(/10\.000/);
    });

    it("çok şirkette ŞİRKET süzgeci ve Şirket sütunu", async () => {
      signIn(MANAGER, TWO_COMPANIES);
      renderAt("/zto-finans/banka-hareketleri", ROUTES);
      await screen.findAllByText("Lastik ödemesi");
      expect(screen.getByText("ŞİRKET", { exact: false })).toBeTruthy();
      expect(headers()).toContain("Şirket");
      expect(screen.getAllByText("Acme").length).toBeGreaterThan(0);
    });

    it("yükleme hatası uyarısı", async () => {
      fakeApi.on("GET", /^\/finance\/funds\/transactions\?/, () => {
        throw apiError(400, "DATE_RANGE_TOO_LARGE", "Tarih aralığı çok uzun");
      });
      renderAt("/zto-finans/banka-hareketleri", ROUTES);
      expect(await screen.findByText(/Tarih aralığı çok uzun/)).toBeTruthy();
    });
  },
);

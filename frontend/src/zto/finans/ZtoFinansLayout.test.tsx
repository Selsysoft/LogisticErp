// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy } from "react";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { useAuthStore } from "../../auth/authStore";
import { useZtoSnackbar } from "../components/ZtoSnackbar";
import { useQuickCari } from "./quickCariContext";
import { useTreasuryModal } from "./treasuryContext";
import { menuModalOf, SIDEBAR_LEAVE_DELAY_MS } from "./ZtoFinanceSidebar";
import { ZtoFinansLayout } from "./ZtoFinansLayout";
import { useZtoRootClass } from "./ZtoRootClassContext";
import { addRootClass, removeRootClass, rootClassName } from "./rootClass";

// Hızlı Cari modalının içeriği FE3'te; burada yalnız bağlam ve `show` durumu sınanır.
vi.mock("./QuickCariModal", () => ({
  QuickCariModal: ({ show, onHide }: { show: boolean; onHide: () => void }) =>
    show ? (
      <div data-testid="quick-cari">
        <button onClick={onHide}>hızlı kapat</button>
      </div>
    ) : null,
}));

// Hızlı Bakiye Özeti modalının içeriği FE-3'te (12.8 §5.10); burada yalnız bağlam ve `show` durumu.
vi.mock("./TreasuryModal", () => ({
  TreasuryModal: ({ show, onHide }: { show: boolean; onHide: () => void }) =>
    show ? (
      <div data-testid="treasury">
        <button onClick={onHide}>hazine kapat</button>
      </div>
    ) : null,
}));

/** Cari Hareketler yer tutucusu: sayfa içeriği FE3'ün testlerinde; burada kabuk sınanır. */
function AllTransactionsStub() {
  const quickCari = useQuickCari();
  const treasury = useTreasuryModal();
  const snackbar = useZtoSnackbar();
  return (
    <div className="container-fluid bank-statement-page">
      <h6>Günlük Tüm Cari İşlemleri</h6>
      <button onClick={quickCari.open}>Hızlı Cari İşlemi aç</button>
      <button onClick={treasury.open}>Finansal Varlık Durumu aç</button>
      <button onClick={() => snackbar.show("Kaydedildi", "success")}>bildir</button>
    </div>
  );
}

function ListLike() {
  useZtoRootClass("definition-list-page");
  return <p>liste</p>;
}

function FormLike() {
  useZtoRootClass("definition-form-page");
  useZtoRootClass("definition-form-page");
  return <p>form</p>;
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderAt(path: string, broken = false) {
  const Broken = lazy(() => Promise.reject(new Error("yüklenemedi")));
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/zto-finans" element={<ZtoFinansLayout />}>
          <Route index element={<Navigate to="cari-hareketler" replace />} />
          <Route path="cari-hareketler" element={broken ? <Broken /> : <AllTransactionsStub />} />
          <Route path="cari-kartlar" element={<p>cari kartlar</p>} />
          <Route path="cari-kartlar/:id/hareketler" element={<p>hareketler</p>} />
          <Route path="vitrin" element={<p>vitrin</p>} />
          <Route path="tanimlar/is-yerleri" element={<ListLike />} />
          <Route path="tanimlar/is-yerleri/yeni" element={<FormLike />} />
        </Route>
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) as T;
const sidebar = () => q("#ztSidebar");
const arrow = () => screen.getByRole("button", { name: "Finans menüsünü aç/kapat" });

beforeEach(() => {
  useAuthStore.setState({
    me: { fullName: "Ayşe Yılmaz", permissions: ["FINANCE_VIEW", "BRANCH_VIEW"] } as never,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ZtoFinansLayout", () => {
  it("/zto-finans Cari Hareketler sayfasına yönlenir; sayfa kapsam kökünde", () => {
    renderAt("/zto-finans");
    expect(screen.getByTestId("where").textContent).toBe("/zto-finans/cari-hareketler");
    const title = screen.getByRole("heading", { level: 6, name: "Günlük Tüm Cari İşlemleri" });
    expect(title.closest(".zto-finans > .zto-finans-layout > .zto-finans-content")).not.toBeNull();
  });

  it("ZTO yan menüsü: başlık, gruplar, etkin öğe, pasif öğeler", () => {
    renderAt("/zto-finans/cari-hareketler");
    const root = q(".zto-finans > .zto-finans-layout");
    expect(root.firstElementChild).toBe(sidebar());
    expect(root.lastElementChild?.className).toBe("zto-finans-content");
    expect(sidebar().className).toBe("zt-sidebar");
    expect(q(".zt-sidebar-header span").textContent).toBe("FİNANS İŞLEMLERİ");
    const groups = Array.from(
      document.querySelectorAll(".zt-sidebar-group-header span"),
      (s) => s.textContent,
    );
    expect(groups[0]).toBe("CARİ İŞLEMLERİ");
    expect(groups).not.toContain("EK İŞLEMLERİ");
    expect(document.querySelectorAll(".zt-sidebar-divider")).toHaveLength(groups.length - 1);

    const active = q<HTMLAnchorElement>("a.zt-active");
    expect(active.getAttribute("href")).toBe("/zto-finans/cari-hareketler");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.querySelector(".zt-icon > i.fas.fa-calendar-day")).not.toBeNull();
    expect(active.querySelector(".zt-label")?.textContent).toBe("Günlük Cari İşlemleri");

    // Yazılmamış ekran pasif (Ödeme Onay Yönetimi 12.4); 12.2a Ödemeler / Tahsilatlar ve 12.3 Çekler /
    // Senetler bağlantı.
    const approval = screen.getByText("Ödeme Onay Yönetimi").closest("a") as HTMLAnchorElement;
    expect(approval.className).toBe("disabled");
    expect(approval.hasAttribute("href")).toBe(false);
    expect(approval.getAttribute("aria-disabled")).toBe("true");
    expect(approval.title).toBe("Bu ekran Faz 12.4 ile gelecek.");
    expect(approval.querySelector(".zt-phase")?.textContent).toBe("Faz 12.4");
    const checks = screen.getByText("Çekler").closest("a") as HTMLAnchorElement;
    expect(checks.getAttribute("href")).toBe("/zto-finans/cekler");
    expect(checks.hasAttribute("aria-disabled")).toBe(false);
    expect(checks.querySelector(".zt-phase")).toBeNull();
    const bills = screen.getByText("Senetler").closest("a") as HTMLAnchorElement;
    expect(bills.getAttribute("href")).toBe("/zto-finans/senetler");
    const payments = screen.getByText("Ödemeler").closest("a") as HTMLAnchorElement;
    expect(payments.getAttribute("href")).toBe("/zto-finans/odemeler");
    expect(payments.hasAttribute("aria-disabled")).toBe(false);
    expect(payments.querySelector(".zt-phase")).toBeNull();
    const collections = screen.getByText("Tahsilatlar").closest("a") as HTMLAnchorElement;
    expect(collections.getAttribute("href")).toBe("/zto-finans/tahsilatlar");
    // Yeni Cari Kart yalnız FINANCE_MANAGE ile görünür.
    expect(screen.queryByText("Yeni Cari Kart")).toBeNull();
    const accounts = screen.getByText("Cari Kartlar").closest("a") as HTMLAnchorElement;
    expect(accounts.getAttribute("href")).toBe("/zto-finans/cari-kartlar");
    expect(screen.queryByText("Yatırımlar")).toBeNull();
  });

  it("ok tıklamayla açılır/kapanır; dışarı tıklama ve Escape kapatır; sayfa değişince kapanır", () => {
    renderAt("/zto-finans/cari-hareketler");
    expect(arrow().getAttribute("aria-expanded")).toBe("false");
    expect(q(".zt-sidebar-panel").getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(arrow());
    expect(sidebar().className).toBe("zt-sidebar open");
    expect(q(".zt-sidebar-panel").getAttribute("aria-hidden")).toBe("false");
    fireEvent.click(q(".zt-sidebar-header"));
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.click(document.body);
    expect(sidebar().classList.contains("open")).toBe(false);

    fireEvent.keyDown(arrow(), { key: "Enter" });
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.keyDown(q(".zt-sidebar-nav"), { key: "Escape" });
    expect(sidebar().classList.contains("open")).toBe(false);
    expect(document.activeElement).toBe(arrow());
    fireEvent.keyDown(arrow(), { key: " " });
    fireEvent.keyDown(arrow(), { key: "a" });
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.keyDown(arrow(), { key: "Escape" });
    fireEvent.keyDown(arrow(), { key: "Escape" });
    expect(sidebar().classList.contains("open")).toBe(false);

    fireEvent.click(arrow());
    fireEvent.click(q("a.zt-active"));
    expect(sidebar().classList.contains("open")).toBe(false);
  });

  it("fareyle üzerine gelince açılır, çıkınca gecikmeyle kapanır; dokunmatik olaylar yok sayılır", () => {
    vi.useFakeTimers();
    renderAt("/zto-finans/cari-hareketler");
    fireEvent.pointerEnter(sidebar(), { pointerType: "touch" });
    expect(sidebar().classList.contains("open")).toBe(false);
    fireEvent.pointerEnter(sidebar(), { pointerType: "mouse" });
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.pointerLeave(sidebar(), { pointerType: "touch" });
    fireEvent.pointerLeave(sidebar(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(SIDEBAR_LEAVE_DELAY_MS - 1));
    expect(sidebar().classList.contains("open")).toBe(true);
    // Geri gelirse kapanma iptal.
    fireEvent.pointerEnter(sidebar(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(SIDEBAR_LEAVE_DELAY_MS * 2));
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.pointerLeave(sidebar(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(SIDEBAR_LEAVE_DELAY_MS));
    expect(sidebar().classList.contains("open")).toBe(false);
  });

  it("geliştirmede vitrin öğesi bağlantıdır", () => {
    renderAt("/zto-finans/vitrin");
    // vitest import.meta.env.DEV = true
    const link = screen.getByText("Bileşen vitrini").closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/zto-finans/vitrin");
    expect(link.className).toBe("zt-active");
    expect(screen.getByText("GELİŞTİRME")).toBeTruthy();
  });

  it("sayfa yüklenemezse Bootstrap uyarısı gösterir", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderAt("/zto-finans/cari-hareketler", true);
    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("alert-danger");
    expect(alert.closest(".zto-finans")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Sayfayı yenile" }).className).toContain("btn");
    error.mockRestore();
  });

  it("TEMEL TANIMLAR bölümü 'GELİŞTİRME'den önce; BRANCH_VIEW yoksa gizli", () => {
    renderAt("/zto-finans/cari-hareketler");
    const groups = Array.from(
      document.querySelectorAll(".zt-sidebar-group-header span"),
      (s) => s.textContent,
    );
    expect(groups.slice(-2)).toEqual(["TEMEL TANIMLAR", "GELİŞTİRME"]);
    expect(document.querySelectorAll(".zt-sidebar-divider")).toHaveLength(groups.length - 1);
    const workPlaces = screen.getByText("İş Yerleri").closest("a") as HTMLAnchorElement;
    expect(workPlaces.getAttribute("href")).toBe("/zto-finans/tanimlar/is-yerleri");
    expect(workPlaces.querySelector(".zt-icon > i.fas.fa-building")).not.toBeNull();
    expect(screen.getByText("Şubeler").closest("a")?.getAttribute("href")).toBe(
      "/zto-finans/tanimlar/subeler",
    );
    expect(screen.getByText("Şirketler").closest("a")?.getAttribute("href")).toBe(
      "/zto-finans/tanimlar/sirketler",
    );
    cleanup();

    useAuthStore.setState({ me: { fullName: "A", permissions: ["FINANCE_VIEW"] } as never });
    renderAt("/zto-finans/cari-hareketler");
    // 12.7: Masraf Kalemleri FINANCE_VIEW ile görünür; iş yeri tanımları BRANCH_VIEW ister.
    expect(screen.getByText("TEMEL TANIMLAR")).not.toBeNull();
    expect(screen.getByText("Masraf Kalemleri").closest("a")?.getAttribute("href")).toBe(
      "/zto-finans/tanimlar/masraf-kalemleri",
    );
    expect(screen.queryByText("İş Yerleri")).toBeNull();
    cleanup();

    useAuthStore.setState({ me: { fullName: "A", permissions: ["SHIPMENT_VIEW"] } as never });
    renderAt("/zto-finans/cari-hareketler");
    expect(screen.queryByText("TEMEL TANIMLAR")).toBeNull();
  });

  it("sayfalar köke sınıf ekler (ZTO body sınıfı); alt yolda menü öğesi etkin kalır", () => {
    renderAt("/zto-finans/tanimlar/is-yerleri");
    const root = q(".zto-finans");
    expect(root.className).toBe("zto-finans sb-nav-fixed definition-list-page");
    // Derlenmiş ".definition-list-page x" kuralları için kök altında da bir ata.
    expect(q(".zto-finans > .zto-finans-layout").className).toBe(
      "zto-finans-layout definition-list-page",
    );
    expect(q("a.zt-active").getAttribute("href")).toBe("/zto-finans/tanimlar/is-yerleri");
    cleanup();

    renderAt("/zto-finans/tanimlar/is-yerleri/yeni");
    expect(q(".zto-finans").className).toBe("zto-finans sb-nav-fixed definition-form-page");
    expect(q("a.zt-active").getAttribute("href")).toBe("/zto-finans/tanimlar/is-yerleri");
    cleanup();

    renderAt("/zto-finans/cari-hareketler");
    expect(q(".zto-finans").className).toBe("zto-finans sb-nav-fixed");
    expect(q(".zto-finans-layout").className).toBe("zto-finans-layout");
  });

  it("kök sınıf listesi sayaçlıdır", () => {
    let list = addRootClass([], "a");
    list = addRootClass(list, "b");
    list = addRootClass(list, "a");
    expect(rootClassName(list)).toBe("a b");
    list = removeRootClass(list, "a");
    expect(rootClassName(list)).toBe("b a");
    expect(removeRootClass(list, "yok")).toEqual(list);
    expect(rootClassName(removeRootClass(removeRootClass(list, "a"), "b"))).toBeUndefined();
    expect(rootClassName([" ", ""])).toBeUndefined();
  });
});

describe("ZtoFinansLayout 12.1", () => {
  it("Yeni Cari Kart FINANCE_MANAGE ile bağlantı; alt yolda yalnız Cari Kartlar etkin", () => {
    useAuthStore.setState({
      me: { fullName: "A", permissions: ["FINANCE_VIEW", "FINANCE_MANAGE"] } as never,
    });
    renderAt("/zto-finans/cari-kartlar/abc/hareketler");
    const add = screen.getByText("Yeni Cari Kart").closest("a") as HTMLAnchorElement;
    expect(add.className).toBe("zt-action-add");
    expect(add.getAttribute("href")).toBe("/zto-finans/cari-kartlar/yeni");
    const active = Array.from(document.querySelectorAll("a.zt-active"), (a) =>
      a.getAttribute("href"),
    );
    expect(active).toEqual(["/zto-finans/cari-kartlar"]);
    cleanup();
    renderAt("/zto-finans/cari-kartlar");
    // ZTO'daki gibi Tüm Planlamalar da etkin görünür (12.4'e dek pasif öğe).
    expect(
      Array.from(document.querySelectorAll("a.zt-active"), (a) => a.getAttribute("href")),
    ).toEqual(["/zto-finans/cari-kartlar", null]);
  });

  it("menüdeki Hızlı Cari İşlemi modalı açar (ZTO openQuickCariModal); menü kapanır", async () => {
    renderAt("/zto-finans/cari-hareketler");
    const item = screen.getByText("Hızlı Cari İşlemi").closest("a") as HTMLAnchorElement;
    expect(item.getAttribute("role")).toBe("button");
    expect(item.getAttribute("href")).toBe("#");
    expect(item.querySelector(".zt-phase")).toBeNull();
    fireEvent.click(arrow());
    fireEvent.click(item);
    expect(await screen.findByTestId("quick-cari")).toBeTruthy();
    expect(sidebar().classList.contains("open")).toBe(false);
    fireEvent.click(screen.getByText("hızlı kapat"));
    expect(screen.queryByTestId("quick-cari")).toBeNull();
    // Sayfadan da açılır (AllTransactions boş durum düğmesi).
    fireEvent.click(screen.getByText("Hızlı Cari İşlemi aç"));
    expect(await screen.findByTestId("quick-cari")).toBeTruthy();
    // Boşluk tuşu da açar.
    fireEvent.click(screen.getByText("hızlı kapat"));
    fireEvent.keyDown(item, { key: " " });
    expect(await screen.findByTestId("quick-cari")).toBeTruthy();
  });

  it("?quickcari=1 modalı açar ve parametreyi adresten siler", async () => {
    renderAt("/zto-finans/cari-hareketler?quickcari=1&x=2");
    expect(await screen.findByTestId("quick-cari")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe("/zto-finans/cari-hareketler"),
    );
  });

  it("bildirim bölgesi kökte; sayfalar useZtoSnackbar ile ileti gösterir", () => {
    renderAt("/zto-finans/cari-hareketler");
    const region = screen.getByRole("region", { name: "Bildirimler" });
    expect(region.parentElement).toBe(q(".zto-finans"));
    fireEvent.click(screen.getByText("bildir"));
    expect(region.querySelector(".snackbar.snackbar-success")?.textContent).toContain("Kaydedildi");
  });
});

describe("ZtoFinansLayout 12.8 (Hızlı Bakiye Özeti, §5.3)", () => {
  it("menü modal dağıtımı: quickTransaction → Hızlı Cari, quickBalance → hazine, diğer → yok", () => {
    expect(menuModalOf("quickTransaction")).toBe("quickCari");
    expect(menuModalOf("quickBalance")).toBe("treasury");
    expect(menuModalOf("allTransactions")).toBeNull();
    expect(menuModalOf("bilinmeyen")).toBeNull();
  });

  it("menüdeki Hızlı Bakiye Özeti hazine modalını açar (Hızlı Cari açılmaz); menü kapanır", async () => {
    renderAt("/zto-finans/cari-hareketler");
    const item = screen.getByText("Hızlı Bakiye Özeti").closest("a") as HTMLAnchorElement;
    expect(item.getAttribute("role")).toBe("button");
    expect(item.getAttribute("href")).toBe("#");
    expect(item.className).toBe("");
    expect(item.querySelector(".zt-phase")).toBeNull();
    fireEvent.click(arrow());
    fireEvent.click(item);
    expect(await screen.findByTestId("treasury")).toBeTruthy();
    expect(screen.queryByTestId("quick-cari")).toBeNull();
    expect(sidebar().classList.contains("open")).toBe(false);
    fireEvent.click(screen.getByText("hazine kapat"));
    expect(screen.queryByTestId("treasury")).toBeNull();
    // Sayfadan da açılır (Cari Kartlar "Finansal Varlık Durumu"); Boşluk tuşu da açar.
    fireEvent.click(screen.getByText("Finansal Varlık Durumu aç"));
    expect(await screen.findByTestId("treasury")).toBeTruthy();
    fireEvent.click(screen.getByText("hazine kapat"));
    fireEvent.keyDown(item, { key: " " });
    expect(await screen.findByTestId("treasury")).toBeTruthy();
  });

  it("?treasury=1 modalı açar; ?quickcari=1 ile birlikte iki parametre tek gezinmeyle silinir", async () => {
    renderAt("/zto-finans/cari-hareketler?treasury=1&quickcari=1&x=2");
    expect(await screen.findByTestId("treasury")).toBeTruthy();
    expect(await screen.findByTestId("quick-cari")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe("/zto-finans/cari-hareketler"),
    );
  });

  it("12.8 rapor öğeleri FINANCE_VIEW ile bağlantı", () => {
    renderAt("/zto-finans/cari-hareketler");
    const href = (text: string) => screen.getByText(text).closest("a")?.getAttribute("href");
    expect(href("Finans Raporları")).toBe("/zto-finans/finans-raporlari");
    expect(href("Cari Hesap Raporları")).toBe("/zto-finans/cari-raporlari");
    expect(href("Finansal Varlıklar & Bilanço")).toBe("/zto-finans/bilanco");
    expect(href("Kur Farkı Raporu")).toBe("/zto-finans/kur-farki-raporu");
    expect(href("Nakit Akış")).toBe("/zto-finans/nakit-akis");
    expect(href("Para Birimleri")).toBe("/zto-finans/tanimlar/para-birimleri");
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { useCompanyStore } from "../../auth/companyStore";
import type { BranchTree } from "../branch/branchTree";
import { useBranchTree } from "../branch/branchTree";
import { ZtoBranchMultiSelect, type ZtoBranchMultiSelectProps } from "./ZtoBranchMultiSelect";

vi.mock("../branch/branchTree", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../branch/branchTree")>()),
  useBranchTree: vi.fn(),
}));

const b = (id: string, name: string) => ({ id, code: id, name, active: true });

const singleCompany: BranchTree = [
  {
    companyId: null,
    companyName: "",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "İzmir",
        groupActive: true,
        branches: [b("a", "Bornova"), b("b", "Kemalpaşa")],
      },
      { groupId: null, groupName: "Diğer", groupActive: true, branches: [b("c", "Isparta Depo")] },
    ],
  },
];

const twoCompanies: BranchTree = [
  { ...singleCompany[0], companyId: "c1", companyName: "Gül Lojistik" },
  {
    companyId: "c2",
    companyName: "Lale Nakliyat",
    companyActive: true,
    groups: [
      { groupId: "g2", groupName: "Ankara", groupActive: true, branches: [b("d", "Sincan")] },
    ],
  },
];

type HarnessProps = Partial<ZtoBranchMultiSelectProps> & { initial?: string[] };

function Harness({ initial = [], onChange, ...rest }: HarnessProps) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <ZtoBranchMultiSelect
      variant="list"
      tree={singleCompany}
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T & Element>(selector) as T;
const qa = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
const wpCheck = (id: string) => q<HTMLInputElement>(`input.dpr-wp-check[value="${id}"]`);
const groupOf = (name: string) => q<HTMLElement>(`.dpr-branch[data-branch-name="${name}"]`);
const groupCheck = (name: string) =>
  groupOf(name).querySelector<HTMLInputElement>("input.dpr-branch-check")!;

afterEach(() => {
  cleanup();
  vi.mocked(useBranchTree).mockReset();
  useCompanyStore.setState({ activeCompanyId: null });
});

describe("ZtoBranchMultiSelect — list (Varyant B)", () => {
  it("ZTO işaretlemesini birebir üretir (Payments.cshtml:466-523)", () => {
    render(<Harness />);
    const root = q(".form-group.mb-0");
    expect(root).not.toBeNull();
    const label = root.querySelector("label.font-weight-bold.mb-0")!;
    expect(label.textContent).toBe("İş Yeri (çoklu seçim)");
    expect(label.querySelector("span.text-muted.font-weight-normal")!.textContent).toBe(
      "(çoklu seçim)",
    );
    expect(screen.getByRole("button", { name: "Tümünü seç" }).className).toBe("small");
    expect(q(".dpr-wp-search > i.fas.fa-search")).not.toBeNull();
    const search = q<HTMLInputElement>(".dpr-wp-search > input.form-control");
    expect(search.placeholder).toBe("İş yeri / şube ara...");
    expect(search.getAttribute("autocomplete")).toBe("off");

    const list = q(".dpr-wp-list");
    expect(list.getAttribute("role")).toBe("group");
    expect(list.getAttribute("aria-labelledby")).toBe(label.id);
    expect(qa(".dpr-wp-list > .dpr-branch")).toHaveLength(2);
    const head = groupOf("İzmir").querySelector(".dpr-branch-head")!;
    expect(head.querySelector("label.dpr-branch-label > input.dpr-branch-check")).not.toBeNull();
    expect(head.querySelector("label.dpr-branch-label > i.fas.fa-code-branch")).not.toBeNull();
    expect(head.querySelector(".dpr-branch-name")!.textContent).toBe("İzmir");
    expect(head.querySelector(".dpr-branch-count")!.textContent).toBe("(0/2)");
    expect(head.querySelector(":scope > i.fas.fa-chevron-down.dpr-chev")).not.toBeNull();
    const items = qa(".dpr-branch-body > label.dpr-wp-item");
    expect(items.map((item) => item.dataset.wpName)).toEqual([
      "Bornova",
      "Kemalpaşa",
      "Isparta Depo",
    ]);
    expect(items[0].querySelector("input.dpr-wp-check")!.getAttribute("value")).toBe("a");
    expect(items[0].querySelector("span")!.textContent).toBe("Bornova");
    expect(q("small.form-text.text-muted").textContent).toBe(
      "Birden fazla iş yeri seçebilirsiniz. Hiçbiri seçilmezse tüm iş yerleri raporlanır.",
    );
    // Tek şirkette şirket başlığı yok
    expect(q(".dpr-company")).toBeNull();
    expect(q(".fa-building")).toBeNull();
  });

  it("iş yeri seçimi şube kutusunu belirsiz yapar ve sayacı günceller", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(wpCheck("a"));
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
    expect(groupCheck("İzmir").indeterminate).toBe(true);
    expect(groupCheck("İzmir").checked).toBe(false);
    expect(groupCheck("İzmir").getAttribute("aria-checked")).toBe("mixed");
    expect(groupOf("İzmir").querySelector(".dpr-branch-count")!.textContent).toBe("(1/2)");
    fireEvent.click(wpCheck("b"));
    expect(groupCheck("İzmir").checked).toBe(true);
    expect(groupCheck("İzmir").indeterminate).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.click(wpCheck("a"));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("şube kutusu altındaki tüm iş yerlerini seçer/kaldırır; başlığı daraltmaz", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(groupCheck("İzmir"));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    expect(wpCheck("a").checked && wpCheck("b").checked).toBe(true);
    expect(groupOf("İzmir").classList.contains("collapsed")).toBe(false);
    fireEvent.click(groupCheck("İzmir"));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(wpCheck("a").checked).toBe(false);
  });

  it("hepsi seçilince [] gönderir ama kutular işaretli kalır; Tümünü seç ↔ Temizle", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Tümünü seç" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(qa("input.dpr-wp-check").every((box) => (box as HTMLInputElement).checked)).toBe(true);
    const toggle = screen.getByRole("button", { name: "Temizle" });
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(qa("input.dpr-wp-check").some((box) => (box as HTMLInputElement).checked)).toBe(false);
    expect(screen.getByRole("button", { name: "Tümünü seç" })).toBe(toggle);
  });

  it("emptyMeansAll=false: hepsi açıkça gönderilir, alt yazı yok", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} emptyMeansAll={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Tümünü seç" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b", "c"]);
    expect(q("small.form-text")).toBeNull();
  });

  it("dışarıdan verilen değer ekrana yansır", () => {
    const { rerender } = render(
      <ZtoBranchMultiSelect variant="list" tree={singleCompany} value={["c"]} onChange={vi.fn()} />,
    );
    expect(wpCheck("c").checked).toBe(true);
    rerender(
      <ZtoBranchMultiSelect variant="list" tree={singleCompany} value={["a"]} onChange={vi.fn()} />,
    );
    expect(wpCheck("c").checked).toBe(false);
    expect(wpCheck("a").checked).toBe(true);
  });

  it("onChange'i yok sayan üst bileşende değer değişmez", () => {
    render(
      <ZtoBranchMultiSelect variant="list" tree={singleCompany} value={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(wpCheck("a"));
    expect(wpCheck("a").checked).toBe(false);
  });

  it("başlığa tıklayınca daraltır; ok klavyeyle de çalışır", () => {
    render(<Harness />);
    const group = groupOf("İzmir");
    const chev = group.querySelector<HTMLElement>(".dpr-chev")!;
    expect(chev.getAttribute("aria-expanded")).toBe("true");
    expect(chev.getAttribute("tabindex")).toBe("0");
    expect(chev.getAttribute("aria-label")).toBe("İzmir: Grubu aç/kapat");
    fireEvent.click(group.querySelector(".dpr-branch-head")!);
    expect(group.classList.contains("collapsed")).toBe(true);
    expect(chev.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(chev, { key: "Enter" });
    expect(group.classList.contains("collapsed")).toBe(false);
    fireEvent.keyDown(chev, { key: " " });
    expect(group.classList.contains("collapsed")).toBe(true);
    fireEvent.keyDown(chev, { key: "a" });
    expect(group.classList.contains("collapsed")).toBe(true);
    // Etiket tıklaması daraltmaz
    fireEvent.click(group.querySelector(".dpr-branch-label")!);
    expect(group.classList.contains("collapsed")).toBe(true);
  });

  it("arama iş yeri ve şube adında, tr-TR duyarsız; eşleşen şubeyi açar", () => {
    render(<Harness />);
    const izmir = groupOf("İzmir");
    fireEvent.click(izmir.querySelector(".dpr-branch-head")!);
    expect(izmir.classList.contains("collapsed")).toBe(true);
    const search = screen.getByRole("textbox", { name: "İş yeri / şube ara..." });

    fireEvent.change(search, { target: { value: "KEMAL" } });
    expect(izmir.classList.contains("collapsed")).toBe(false);
    expect(izmir.classList.contains("hidden")).toBe(false);
    expect(groupOf("Diğer").classList.contains("hidden")).toBe(true);
    expect(q('.dpr-wp-item[data-wp-name="Bornova"]').classList.contains("hidden")).toBe(true);
    expect(q('.dpr-wp-item[data-wp-name="Kemalpaşa"]').classList.contains("hidden")).toBe(false);

    fireEvent.change(search, { target: { value: "izmir" } });
    expect(q('.dpr-wp-item[data-wp-name="Bornova"]').classList.contains("hidden")).toBe(false);

    fireEvent.change(search, { target: { value: "ISPARTA" } });
    expect(groupOf("Diğer").classList.contains("hidden")).toBe(false);
    expect(izmir.classList.contains("hidden")).toBe(true);

    // Gizli olanlar da "Tümünü seç"e dahil (ZTO: $('#dprWpList .dpr-wp-check'))
    fireEvent.click(screen.getByRole("button", { name: "Tümünü seç" }));
    expect(wpCheck("a").checked).toBe(true);

    fireEvent.change(search, { target: { value: "" } });
    expect(qa(".hidden")).toHaveLength(0);
  });

  it("classPrefix='dcr' tahsilat ekranının sınıflarını üretir", () => {
    render(<Harness classPrefix="dcr" />);
    expect(q(".dcr-wp-search")).not.toBeNull();
    expect(q(".dcr-wp-list")).not.toBeNull();
    expect(qa(".dcr-branch")).toHaveLength(2);
    expect(qa("input.dcr-wp-check")).toHaveLength(3);
    expect(q(".dcr-chev")).not.toBeNull();
    expect(q("[class*='dpr-']")).toBeNull();
  });

  it("label ve helpText özelleştirilir ya da gizlenir", () => {
    render(<Harness label="Şube" helpText={null} />);
    expect(q("label.font-weight-bold").textContent).toBe("Şube (çoklu seçim)");
    expect(q("small.form-text")).toBeNull();
    cleanup();
    render(<Harness label={null} helpText="Açıklama" />);
    expect(q("label.font-weight-bold")).toBeNull();
    expect(q(".dpr-wp-list").hasAttribute("aria-labelledby")).toBe(false);
    expect(q("small.form-text").textContent).toBe("Açıklama");
  });

  it("≥2 şirkette en üstte şirket başlığı (fa-building) ve şirket kutusu", () => {
    const onChange = vi.fn();
    render(<Harness tree={twoCompanies} onChange={onChange} />);
    const companies = qa(".dpr-branch.dpr-company");
    expect(companies.map((company) => company.dataset.companyName)).toEqual([
      "Gül Lojistik",
      "Lale Nakliyat",
    ]);
    const first = companies[0];
    expect(q(".dpr-wp-list").firstElementChild).toBe(first);
    expect(first.querySelector(".dpr-branch-label > i.fas.fa-building")).not.toBeNull();
    expect(first.querySelector(".dpr-branch-count")!.textContent).toBe("(0/3)");
    const companyCheck = first.querySelector<HTMLInputElement>(
      "input.dpr-branch-check.dpr-company-check",
    )!;
    fireEvent.click(companyCheck);
    expect(onChange).toHaveBeenLastCalledWith(["a", "b", "c"]);
    fireEvent.click(wpCheck("a"));
    expect(companyCheck.indeterminate).toBe(true);

    // Şirket daraltılınca grupları çizilmez; arama şirket adında da eşleşir ve açar
    fireEvent.click(first.querySelector(".dpr-branch-head")!);
    expect(first.classList.contains("collapsed")).toBe(true);
    expect(groupOf("İzmir")).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "gül" } });
    expect(first.classList.contains("collapsed")).toBe(false);
    expect(groupOf("İzmir")).not.toBeNull();
    expect(companies[1].classList.contains("hidden")).toBe(true);
  });

  it("companyId: aktif şirket ağacı süzer; null ya da kimlik verilebilir", () => {
    useCompanyStore.setState({ activeCompanyId: "c2" });
    render(<Harness tree={twoCompanies} />);
    // Tek şirket kalınca şirket başlığı yok, yalnız o şirketin iş yerleri.
    expect(qa(".dpr-branch.dpr-company")).toHaveLength(0);
    expect(qa("input.dpr-wp-check").map((input) => (input as HTMLInputElement).value)).toEqual([
      "d",
    ]);
    cleanup();
    render(<Harness tree={twoCompanies} companyId={null} />);
    expect(qa(".dpr-branch.dpr-company")).toHaveLength(2);
    cleanup();
    render(<Harness tree={twoCompanies} companyId="c1" />);
    expect(qa("input.dpr-wp-check").map((input) => (input as HTMLInputElement).value)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ağaç verilmezse useBranchTree kullanır; yükleniyor ve hata durumları", () => {
    const hook = vi.mocked(useBranchTree);
    hook.mockReturnValue({ isError: false, isPending: true, data: undefined } as never);
    const { rerender } = render(
      <ZtoBranchMultiSelect
        variant="list"
        scope="all"
        includeInactive
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(hook).toHaveBeenCalledWith("all", true);
    expect(q(".dpr-wp-list").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Yükleniyor...")).toBeTruthy();

    hook.mockReturnValue({ isError: true, isPending: false, data: undefined } as never);
    rerender(<ZtoBranchMultiSelect variant="list" value={[]} onChange={vi.fn()} />);
    expect(hook).toHaveBeenLastCalledWith("mine", false);
    expect(screen.getByRole("alert").textContent).toBe("İş yerleri yüklenemedi.");

    hook.mockReturnValue({ isError: false, isPending: false, data: singleCompany } as never);
    rerender(<ZtoBranchMultiSelect variant="list" value={["b"]} onChange={vi.fn()} />);
    expect(wpCheck("b").checked).toBe(true);
  });
});

describe("ZtoBranchMultiSelect — dropdown (Varyant C)", () => {
  const dq = (selector: string) => document.querySelector<HTMLElement>(selector);
  const boxes = () => qa("#root-test input.wp-checkbox") as HTMLInputElement[];
  const renderDropdown = (props: HarnessProps = {}) =>
    render(
      <div>
        <div id="root-test">
          <Harness variant="dropdown" {...props} />
        </div>
        <button type="button">dışarı</button>
      </div>,
    );
  const toggleButton = () => dq("button.filter-field.wp-multiselect-btn")!;

  it("kapalı başlar; etiket 'Tüm İş Yerleri Toplamı' (CAI:4256-4262)", () => {
    renderDropdown();
    expect(dq("label.filter-label")!.textContent).toBe("İŞ YERİ (Borç/Alacak)");
    const container = dq(".wp-multiselect-container")!;
    expect(container.firstElementChild).toBe(toggleButton());
    expect(toggleButton().getAttribute("aria-expanded")).toBe("false");
    expect(toggleButton().querySelector("span")!.textContent).toBe("Tüm İş Yerleri Toplamı");
    expect(toggleButton().querySelector("i.fas.fa-chevron-down")).not.toBeNull();
    expect(dq(".wp-multiselect-dropdown")).toBeNull();
  });

  it("açılınca hepsi işaretli; düz liste ve eylem düğmeleri", () => {
    renderDropdown();
    fireEvent.click(toggleButton());
    expect(toggleButton().getAttribute("aria-expanded")).toBe("true");
    const dropdown = dq(".wp-multiselect-container > .wp-multiselect-dropdown")!;
    const actions = dropdown.querySelectorAll(".wp-multiselect-actions > button");
    expect(Array.from(actions).map((button) => button.textContent)).toEqual([
      "Tümünü Seç",
      "Tümünü Kaldır",
    ]);
    expect(actions[0].querySelector("i.fas.fa-check-double")).not.toBeNull();
    expect(actions[1].querySelector("i.fas.fa-times")).not.toBeNull();
    const items = dropdown.querySelectorAll("label.wp-multiselect-item");
    expect(items).toHaveLength(3);
    expect(items[0].querySelector("input.wp-checkbox")!.getAttribute("data-wpid")).toBe("a");
    expect(items[0].querySelector("span")!.textContent).toBe("Bornova");
    expect(boxes().every((box) => box.checked)).toBe(true);
    expect(dq(".wp-multiselect-company")).toBeNull();
    expect(screen.getByRole("button", { name: "Tabloyu Yenile" })).toBeTruthy();
  });

  it("etiket: n seçili, tek ad, Hiç Seçilmedi, yeniden tümü", () => {
    const onChange = vi.fn();
    renderDropdown({ onChange });
    fireEvent.click(toggleButton());
    fireEvent.click(boxes()[2]);
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    expect(toggleButton().textContent).toBe("2 İş Yeri Seçildi");
    fireEvent.click(boxes()[1]);
    expect(toggleButton().textContent).toBe("Bornova");
    fireEvent.click(screen.getByRole("button", { name: "Tümünü Kaldır" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(toggleButton().textContent).toBe("Hiç Seçilmedi");
    expect(boxes().some((box) => box.checked)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Tümünü Seç" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(toggleButton().textContent).toBe("Tüm İş Yerleri Toplamı");
  });

  it("dışarı tıklayınca kapanır, içeride açık kalır; Escape kapatır", () => {
    renderDropdown();
    fireEvent.click(toggleButton());
    fireEvent.click(boxes()[0]);
    expect(dq(".wp-multiselect-dropdown")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "dışarı" }));
    expect(dq(".wp-multiselect-dropdown")).toBeNull();

    fireEvent.click(toggleButton());
    fireEvent.keyDown(boxes()[0], { key: "Escape" });
    expect(dq(".wp-multiselect-dropdown")).toBeNull();
    expect(document.activeElement).toBe(toggleButton());

    fireEvent.click(toggleButton());
    fireEvent.click(toggleButton());
    expect(dq(".wp-multiselect-dropdown")).toBeNull();
  });

  it("Tabloyu Yenile listeyi kapatır ve seçimi onApply ile verir", () => {
    const onApply = vi.fn();
    renderDropdown({ onApply });
    fireEvent.click(toggleButton());
    fireEvent.click(boxes()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Tabloyu Yenile" }));
    expect(onApply).toHaveBeenCalledWith(["b", "c"]);
    expect(dq(".wp-multiselect-dropdown")).toBeNull();
    // onApply verilmese de kapanır
    cleanup();
    renderDropdown();
    fireEvent.click(toggleButton());
    act(() => screen.getByRole("button", { name: "Tabloyu Yenile" }).click());
    expect(dq(".wp-multiselect-dropdown")).toBeNull();
  });

  it("≥2 şirkette şirket satırı (fa-building) şirketin iş yerlerini değiştirir", () => {
    const onChange = vi.fn();
    renderDropdown({ tree: twoCompanies, onChange, label: null });
    expect(dq("label.filter-label")).toBeNull();
    fireEvent.click(toggleButton());
    const companies = qa(".wp-multiselect-item.wp-multiselect-company");
    expect(companies.map((company) => company.textContent)).toEqual([
      "Gül Lojistik",
      "Lale Nakliyat",
    ]);
    expect(companies[0].querySelector("i.fas.fa-building")).not.toBeNull();
    const companyBox = companies[1].querySelector<HTMLInputElement>("input")!;
    expect(companyBox.checked).toBe(true);
    fireEvent.click(companyBox);
    expect(onChange).toHaveBeenLastCalledWith(["a", "b", "c"]);
    expect(toggleButton().textContent).toBe("3 İş Yeri Seçildi");
  });

  it("yükleniyor ve hata durumları açılır listede", () => {
    const hook = vi.mocked(useBranchTree);
    hook.mockReturnValue({ isError: false, isPending: true, data: undefined } as never);
    const { rerender } = render(
      <ZtoBranchMultiSelect variant="dropdown" value={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(toggleButton());
    expect(screen.getByText("Yükleniyor...")).toBeTruthy();
    hook.mockReturnValue({ isError: true, isPending: false, data: undefined } as never);
    rerender(<ZtoBranchMultiSelect variant="dropdown" value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toBe("İş yerleri yüklenemedi.");
  });
});

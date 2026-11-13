// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { ZtoModal } from "./ZtoModal";
import { ZtoSelect, ZtoSelectItem, ZtoSelectProps } from "./ZtoSelect";

const options: ZtoSelectItem[] = [
  {
    label: "İzmir Şubesi",
    options: [
      { value: "1", label: "Çiğli Depo" },
      { value: "2", label: "Bornova Ofis", disabled: true },
      { value: "3", label: "Işıkkent Fabrika" },
    ],
  },
  { value: "4", label: "Merkez" },
];

type Props = Partial<ZtoSelectProps> & { onSpy?: (value: string) => void };

function Harness({ onSpy, value: initial = "", ...rest }: Props) {
  const [value, setValue] = useState(initial);
  return (
    <ZtoSelect
      id="filterWorkPlace"
      options={options}
      placeholder="Seçiniz..."
      {...rest}
      value={value}
      onChange={(next) => {
        onSpy?.(next);
        setValue(next);
      }}
    />
  );
}

function renderInRoot(props: Props = {}) {
  return render(
    <ZtoFinansRoot>
      <Harness {...props} />
      <button type="button">dışarı</button>
    </ZtoFinansRoot>,
  );
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) as T;
const selection = () => q(".select2-selection");
const container = () => q("span.select2");
const dropdown = () => document.querySelector(".select2-dropdown");
const search = () => q<HTMLInputElement>(".select2-search__field");
const openByMouse = () => fireEvent.mouseDown(selection(), { button: 0 });
const optionByText = (text: string) => screen.getByText(text, { selector: "li" });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ZtoSelect — select2 4.1 işaretlemesi", () => {
  it("gizli yerel select + select2 kapsayıcısı; yer tutucu", () => {
    renderInRoot({ name: "WorkPlaceID", required: true });
    const native = q<HTMLSelectElement>("select#filterWorkPlace");
    expect(native.className).toBe("form-control select2-hidden-accessible");
    expect(native.getAttribute("aria-hidden")).toBe("true");
    expect(native.tabIndex).toBe(-1);
    expect(native.name).toBe("WorkPlaceID");
    expect(native.required).toBe(true);
    // select2 yer tutucu için boş seçenek gerekir; optgroup korunur.
    expect(native.options[0].value).toBe("");
    expect(native.querySelector("optgroup")?.getAttribute("label")).toBe("İzmir Şubesi");
    expect(native.nextElementSibling).toBe(container());

    expect(container().className).toBe("select2 select2-container select2-container--bootstrap");
    expect(container().getAttribute("dir")).toBe("ltr");
    expect(container().style.width).toBe("100%");
    expect(container().querySelector(":scope > span.selection > .select2-selection")).toBe(
      selection(),
    );
    expect(
      container().querySelector(":scope > span.dropdown-wrapper")?.getAttribute("aria-hidden"),
    ).toBe("true");

    const sel = selection();
    expect(sel.className).toBe("select2-selection select2-selection--single");
    expect(sel.getAttribute("role")).toBe("combobox");
    expect(sel.getAttribute("aria-haspopup")).toBe("true");
    expect(sel.getAttribute("aria-expanded")).toBe("false");
    expect(sel.getAttribute("tabindex")).toBe("0");
    expect(sel.getAttribute("aria-disabled")).toBe("false");
    expect(sel.getAttribute("aria-labelledby")).toBe("select2-filterWorkPlace-container");
    expect(sel.getAttribute("aria-controls")).toBe("select2-filterWorkPlace-container");
    expect(sel.hasAttribute("aria-owns")).toBe(false);

    const rendered = q("#select2-filterWorkPlace-container");
    expect(rendered.className).toBe("select2-selection__rendered");
    expect(rendered.getAttribute("role")).toBe("textbox");
    expect(rendered.getAttribute("aria-readonly")).toBe("true");
    expect(rendered.getAttribute("title")).toBe("Seçiniz...");
    expect(rendered.querySelector(".select2-selection__placeholder")?.textContent).toBe(
      "Seçiniz...",
    );
    const arrow = q(".select2-selection__arrow");
    expect(arrow.getAttribute("role")).toBe("presentation");
    expect(arrow.querySelector("b")?.getAttribute("role")).toBe("presentation");
    expect(dropdown()).toBeNull();
  });

  it("seçili değerin etiketi ve başlığı gösterilir", () => {
    renderInRoot({ value: "3" });
    const rendered = q(".select2-selection__rendered");
    expect(rendered.textContent).toBe("Işıkkent Fabrika");
    expect(rendered.getAttribute("title")).toBe("Işıkkent Fabrika");
    expect(q<HTMLSelectElement>("select").value).toBe("3");
  });

  it("açılınca liste kök kapsayıcıya portal'lanır; gruplar ve seçenek sınıfları select2 4.1", () => {
    renderInRoot({ value: "3" });
    openByMouse();
    expect(container().classList.contains("select2-container--open")).toBe(true);
    expect(container().classList.contains("select2-container--below")).toBe(true);
    expect(selection().getAttribute("aria-expanded")).toBe("true");
    expect(selection().getAttribute("aria-owns")).toBe("select2-filterWorkPlace-results");

    const wrapper = dropdown()!.parentElement!;
    expect(wrapper.className).toBe(
      "select2-container select2-container--bootstrap select2-container--open",
    );
    expect(wrapper.style.position).toBe("absolute");
    expect(wrapper.parentElement?.classList.contains("zto-finans")).toBe(true);
    expect(dropdown()!.className).toBe("select2-dropdown select2-dropdown--below");
    expect(dropdown()!.getAttribute("dir")).toBe("ltr");

    const searchBox = q(".select2-search");
    expect(searchBox.className).toBe("select2-search select2-search--dropdown");
    const input = search();
    expect(input.type).toBe("search");
    expect(input.getAttribute("role")).toBe("searchbox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBe("select2-filterWorkPlace-results");
    expect(input.getAttribute("aria-label")).toBe("Ara");
    expect(document.activeElement).toBe(input);

    const list = q("ul#select2-filterWorkPlace-results");
    expect(list.className).toBe("select2-results__options");
    expect(list.getAttribute("role")).toBe("listbox");
    expect(list.parentElement?.className).toBe("select2-results");
    // Yer tutucu ("") seçeneği listede yok (HidePlaceholder).
    const group = q("li.select2-results__option--group");
    expect(group.className).toBe("select2-results__option select2-results__option--group");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("İzmir Şubesi");
    expect(group.querySelector(":scope > strong.select2-results__group")?.textContent).toBe(
      "İzmir Şubesi",
    );
    const nested = group.querySelector(":scope > ul")!;
    expect(nested.className).toBe("select2-results__options select2-results__options--nested");
    expect(nested.getAttribute("role")).toBe("none");

    const selected = optionByText("Işıkkent Fabrika");
    expect(selected.className).toBe(
      "select2-results__option select2-results__option--selectable select2-results__option--selected select2-results__option--highlighted",
    );
    expect(selected.getAttribute("role")).toBe("option");
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(selected.id).toMatch(/^select2-filterWorkPlace-result-/);
    expect(input.getAttribute("aria-activedescendant")).toBe(selected.id);
    expect(selection().getAttribute("aria-activedescendant")).toBe(selected.id);

    const disabled = optionByText("Bornova Ofis");
    expect(disabled.className).toBe("select2-results__option select2-results__option--disabled");
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    expect(disabled.hasAttribute("aria-selected")).toBe(false);

    expect(optionByText("Merkez").getAttribute("aria-selected")).toBe("false");
  });

  it("aksansız arama süzer; sonuç yoksa select2-results__message", () => {
    renderInRoot();
    openByMouse();
    fireEvent.change(search(), { target: { value: "isik" } });
    const items = document.querySelectorAll("li[role=option]");
    expect(Array.from(items, (li) => li.textContent)).toEqual(["Işıkkent Fabrika"]);
    expect(items[0].classList.contains("select2-results__option--highlighted")).toBe(true);

    fireEvent.change(search(), { target: { value: "yok" } });
    const message = q("li.select2-results__message");
    expect(message.className).toBe("select2-results__option select2-results__message");
    expect(message.getAttribute("role")).toBe("alert");
    expect(message.getAttribute("aria-live")).toBe("assertive");
    expect(message.textContent).toBe("Sonuç bulunamadı");
  });

  it("ok tuşları devre dışı öğeyi atlayarak gezinir; Enter seçer, kapanır, odak seçime döner", () => {
    const spy = vi.fn();
    renderInRoot({ onSpy: spy });
    fireEvent.keyDown(selection(), { key: "Enter" });
    expect(container().classList.contains("select2-container--open")).toBe(true);
    const highlighted = () => q(".select2-results__option--highlighted").textContent;
    expect(highlighted()).toBe("Çiğli Depo");
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    expect(highlighted()).toBe("Işıkkent Fabrika");
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    expect(highlighted()).toBe("Merkez");
    fireEvent.keyDown(search(), { key: "ArrowUp" });
    expect(highlighted()).toBe("Işıkkent Fabrika");
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(spy).toHaveBeenCalledWith("3");
    expect(dropdown()).toBeNull();
    expect(document.activeElement).toBe(selection());
    expect(container().classList.contains("select2-container--focus")).toBe(true);
    expect(q(".select2-selection__rendered").textContent).toBe("Işıkkent Fabrika");
  });

  it("Tab vurgulu öğeyi seçer; ESC seçmeden kapatır", () => {
    const spy = vi.fn();
    renderInRoot({ onSpy: spy });
    fireEvent.keyDown(selection(), { key: " " });
    fireEvent.keyDown(search(), { key: "Escape" });
    expect(dropdown()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(selection());

    fireEvent.keyDown(selection(), { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(search(), { key: "Tab" });
    expect(spy).toHaveBeenCalledWith("1");
    expect(dropdown()).toBeNull();
  });

  it("vurgu yokken Enter bir şey seçmez; seçili öğede Enter yalnız kapatır", () => {
    const spy = vi.fn();
    renderInRoot({ onSpy: spy, value: "4" });
    openByMouse();
    fireEvent.change(search(), { target: { value: "yok" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(dropdown()).not.toBeNull();
    fireEvent.change(search(), { target: { value: "" } });
    expect(q(".select2-results__option--highlighted").textContent).toBe("Merkez");
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(spy).not.toHaveBeenCalled();
    expect(dropdown()).toBeNull();
  });

  it("fareyle vurgu ve seçim (mouseenter/mouseup); devre dışı öğe seçilmez", () => {
    const spy = vi.fn();
    renderInRoot({ onSpy: spy });
    openByMouse();
    fireEvent.mouseEnter(optionByText("Merkez"));
    expect(optionByText("Merkez").classList.contains("select2-results__option--highlighted")).toBe(
      true,
    );
    expect(optionByText("Çiğli Depo").getAttribute("aria-selected")).toBe("false");
    fireEvent.mouseUp(optionByText("Bornova Ofis"));
    expect(spy).not.toHaveBeenCalled();
    fireEvent.mouseUp(optionByText("Merkez"));
    expect(spy).toHaveBeenCalledWith("4");
    expect(dropdown()).toBeNull();
  });

  it("dışarı tıklama kapatır; liste içine tıklama kapatmaz; seçime tekrar tıklama kapatır", () => {
    renderInRoot();
    openByMouse();
    fireEvent.mouseDown(search());
    expect(dropdown()).not.toBeNull();
    fireEvent.mouseDown(screen.getByRole("button", { name: "dışarı" }));
    expect(dropdown()).toBeNull();
    openByMouse();
    expect(dropdown()).not.toBeNull();
    openByMouse();
    expect(dropdown()).toBeNull();
    // Sağ tık açmaz.
    fireEvent.mouseDown(selection(), { button: 2 });
    expect(dropdown()).toBeNull();
  });

  it("allowClear: × düğmesi değeri boşaltır ve listeyi açar (select2 toggle)", () => {
    const spy = vi.fn();
    renderInRoot({ onSpy: spy, value: "4", allowClear: true });
    expect(selection().classList.contains("select2-selection--clearable")).toBe(true);
    const clear = q<HTMLButtonElement>("button.select2-selection__clear");
    expect(selection().firstElementChild).toBe(clear);
    expect(clear.type).toBe("button");
    expect(clear.tabIndex).toBe(-1);
    expect(clear.title).toBe("Tüm öğeleri kaldır");
    expect(clear.getAttribute("aria-label")).toBe("Tüm öğeleri kaldır");
    expect(clear.getAttribute("aria-describedby")).toBe("select2-filterWorkPlace-container");
    expect(clear.querySelector("span[aria-hidden=true]")?.textContent).toBe("×");

    fireEvent.mouseDown(clear, { button: 0 });
    expect(spy).toHaveBeenCalledWith("");
    expect(q(".select2-selection__placeholder")).not.toBeNull();
    expect(document.querySelector("button.select2-selection__clear")).toBeNull();
    expect(dropdown()).not.toBeNull();
    expect(q(".select2-results__option--highlighted").textContent).toBe("Çiğli Depo");
  });

  it("allowClear: kapalıyken Delete temizler; yer tutucudayken bir şey yapmaz", () => {
    const spy = vi.fn();
    renderInRoot({ onSpy: spy, value: "1", allowClear: true });
    fireEvent.keyDown(selection(), { key: "Delete" });
    expect(spy).toHaveBeenCalledWith("");
    fireEvent.keyDown(search(), { key: "Escape" });
    spy.mockClear();
    fireEvent.keyDown(selection(), { key: "Backspace" });
    expect(spy).not.toHaveBeenCalled();
    expect(dropdown()).toBeNull();
  });

  it("disabled: sınıf, tabindex -1, açılmaz", () => {
    renderInRoot({ disabled: true, value: "4", allowClear: true });
    expect(container().classList.contains("select2-container--disabled")).toBe(true);
    expect(selection().getAttribute("tabindex")).toBe("-1");
    expect(selection().getAttribute("aria-disabled")).toBe("true");
    expect(q<HTMLSelectElement>("select").disabled).toBe(true);
    openByMouse();
    fireEvent.keyDown(selection(), { key: "Enter" });
    fireEvent.mouseDown(q("button.select2-selection__clear"));
    expect(dropdown()).toBeNull();
  });

  it("açıkken devre dışı kalırsa liste kapanır", () => {
    const { rerender } = render(
      <ZtoFinansRoot>
        <ZtoSelect value="" onChange={() => {}} options={options} />
      </ZtoFinansRoot>,
    );
    openByMouse();
    expect(dropdown()).not.toBeNull();
    rerender(
      <ZtoFinansRoot>
        <ZtoSelect value="" onChange={() => {}} options={options} disabled />
      </ZtoFinansRoot>,
    );
    expect(dropdown()).toBeNull();
  });

  it("minimumResultsForSearch=Infinity arama kutusunu gizler; klavye seçimde çalışır", () => {
    const spy = vi.fn();
    renderInRoot({ onSpy: spy, minimumResultsForSearch: Infinity });
    openByMouse();
    expect(q(".select2-search").classList.contains("select2-search--hide")).toBe(true);
    fireEvent.keyDown(selection(), { key: "ArrowDown" });
    fireEvent.keyDown(selection(), { key: "Enter" });
    expect(spy).toHaveBeenCalledWith("3");
  });

  it("yer tutucusuz: eşleşmeyen değerde ilk etkin seçenek görünür; boş değerli seçenek listelenir", () => {
    render(
      <ZtoFinansRoot>
        <ZtoSelect
          value=""
          onChange={() => {}}
          options={[{ value: "", label: "Tüm İş Yerleri" }, ...options]}
          placeholder={null}
        />
      </ZtoFinansRoot>,
    );
    expect(q(".select2-selection__rendered").textContent).toBe("Tüm İş Yerleri");
    expect(q<HTMLSelectElement>("select").options[0].textContent).toBe("Tüm İş Yerleri");
    openByMouse();
    expect(
      optionByText("Tüm İş Yerleri").classList.contains("select2-results__option--selected"),
    ).toBe(true);
  });

  it("ZTO global varsayılanı: yer tutucu 'Seçiniz...', '' seçeneği gizli, seçiliyken × görünür", () => {
    const spy = vi.fn();
    function Default() {
      const [value, setValue] = useState("");
      return (
        <ZtoSelect
          value={value}
          onChange={(next) => {
            spy(next);
            setValue(next);
          }}
          options={[{ value: "", label: "Tüm Hesaplar" }, ...options]}
        />
      );
    }
    render(
      <ZtoFinansRoot>
        <Default />
      </ZtoFinansRoot>,
    );
    expect(q(".select2-selection__placeholder").textContent).toBe("Seçiniz...");
    expect(document.querySelector(".select2-selection__clear")).toBeNull();
    openByMouse();
    expect(screen.queryByText("Tüm Hesaplar", { selector: "li" })).toBeNull();
    fireEvent.mouseUp(optionByText("Merkez"));
    expect(spy).toHaveBeenLastCalledWith("4");
    expect(q("button.select2-selection__clear")).not.toBeNull();
    fireEvent.keyDown(selection(), { key: "Delete" });
    expect(spy).toHaveBeenLastCalledWith("");
  });

  it("yer tutucusuz (null) allowClear çalışmaz", () => {
    const spy = vi.fn();
    render(<ZtoSelect value="4" onChange={spy} options={options} placeholder={null} allowClear />);
    expect(document.querySelector(".select2-selection__clear")).toBeNull();
    fireEvent.keyDown(selection(), { key: "Backspace" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("seçenek yoksa kutu boş kalır", () => {
    render(<ZtoSelect value="" onChange={() => {}} options={[]} placeholder={null} />);
    expect(q(".select2-selection__rendered").textContent).toBe("");
    expect(q(".select2-selection__rendered").hasAttribute("title")).toBe(false);
  });

  it("gizli select'teki değişiklik (form doldurma) onChange'e iletilir", () => {
    const spy = vi.fn();
    renderInRoot({ onSpy: spy });
    fireEvent.change(q("select"), { target: { value: "4" } });
    expect(spy).toHaveBeenCalledWith("4");
  });

  it("kök yoksa liste document.body'ye portal'lanır; konum tetikleyiciye göre hesaplanır", () => {
    render(<ZtoSelect id="s" value="" onChange={() => {}} options={options} />);
    let rect = { top: 100, bottom: 134, left: 20, width: 300, height: 34, right: 320 };
    vi.spyOn(container(), "getBoundingClientRect").mockImplementation(
      () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect,
    );
    openByMouse();
    const wrapper = dropdown()!.parentElement!;
    expect(wrapper.parentElement).toBe(document.body);
    expect(wrapper.style.top).toBe("134px");
    expect(wrapper.style.left).toBe("20px");
    expect((dropdown() as HTMLElement).style.width).toBe("300px");

    rect = { ...rect, top: 50, bottom: 84 };
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(wrapper.style.top).toBe("84px");
    rect = { ...rect, left: 40 };
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(wrapper.style.left).toBe("40px");
  });

  it("name ile kimlik üretilir (id yoksa)", () => {
    render(<ZtoSelect name="CurrencyID" value="" onChange={() => {}} options={options} />);
    expect(selection().getAttribute("aria-labelledby")).toMatch(
      /^select2-CurrencyID-.+-container$/,
    );
  });
});

// react-overlays odak tuzağı setTimeout ile çalışır; gerçek zamanlayıcılar beklenir.
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));

describe("ZtoSelect — ZtoModal içinde (ZTO dropdownParent: $('.modal'))", () => {
  function renderInModal(onHide = vi.fn(), onSpy = vi.fn()) {
    render(
      <ZtoFinansRoot>
        <ZtoModal show onHide={onHide} title="Ödeme" animation={false}>
          <Harness onSpy={onSpy} />
        </ZtoModal>
      </ZtoFinansRoot>,
    );
    return { onHide, onSpy };
  }

  it("liste .modal içine çizilir; odak arama kutusunda kalır, arama ve klavye seçimi çalışır", async () => {
    const { onSpy } = renderInModal();
    await settle();
    openByMouse();
    await settle();
    const modal = q(".modal");
    expect(search().closest(".modal")).toBe(modal);
    expect(document.activeElement).toBe(search());
    fireEvent.change(search(), { target: { value: "e" } });
    expect(screen.queryByText("Bornova Ofis", { selector: "li" })).toBeNull();
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onSpy).toHaveBeenCalledWith("3");
    expect(dropdown()).toBeNull();
  });

  it("arama kutusunda Escape yalnız listeyi kapatır; modal açık kalır, odak seçim kutusuna döner", async () => {
    const { onHide } = renderInModal();
    await settle();
    openByMouse();
    await settle();
    fireEvent.keyDown(search(), { key: "Escape", keyCode: 27 });
    expect(dropdown()).toBeNull();
    expect(onHide).not.toHaveBeenCalled();
    await settle();
    expect(document.activeElement).toBe(selection());
  });

  it("üst üste modalda liste üstteki .modal içinde; iç modal yine köke portal'lanır", async () => {
    // İkinci modal, birincisi açıldıktan sonra açılır (gerçek akış; yığının tepesi o olur).
    function Stacked() {
      const [second, setSecond] = useState(false);
      return (
        <ZtoModal show onHide={() => {}} title="Birinci" animation={false}>
          <button type="button" onClick={() => setSecond(true)}>
            ikinciyi aç
          </button>
          <ZtoModal show={second} onHide={() => {}} title="İkinci" animation={false}>
            <Harness />
          </ZtoModal>
        </ZtoModal>
      );
    }
    render(
      <ZtoFinansRoot>
        <Stacked />
      </ZtoFinansRoot>,
    );
    await settle();
    fireEvent.click(screen.getByText("ikinciyi aç"));
    await settle();
    const root = q(".zto-finans");
    const modals = Array.from(document.querySelectorAll<HTMLElement>(".modal"));
    expect(modals).toHaveLength(2);
    modals.forEach((modal) => expect(modal.parentElement).toBe(root));
    const second = selection().closest(".modal") as HTMLElement;
    expect(second.textContent).toContain("İkinci");
    openByMouse();
    await settle();
    expect(dropdown()!.closest(".modal")).toBe(second);
    expect(document.activeElement).toBe(search());
  });
});

describe("ZtoSelect — no-select2", () => {
  it("yerel select çizer; yer tutucu ilk boş seçenek", () => {
    const spy = vi.fn();
    render(
      <ZtoSelect
        id="PaymentMethod"
        name="PaymentMethod"
        className="form-control no-select2"
        value=""
        onChange={spy}
        options={options}
        placeholder="Seçiniz"
        required
      />,
    );
    const native = q<HTMLSelectElement>("select#PaymentMethod");
    expect(native.className).toBe("form-control no-select2");
    expect(native.required).toBe(true);
    expect(native.options[0].textContent).toBe("Seçiniz");
    expect(native.querySelector("optgroup option[disabled]")?.textContent).toBe("Bornova Ofis");
    expect(container()).toBeNull();
    fireEvent.change(native, { target: { value: "4" } });
    expect(spy).toHaveBeenCalledWith("4");
  });

  it("boş değerli seçenek varsa yer tutucu eklenmez", () => {
    render(
      <ZtoSelect
        className="filter-field no-select2"
        value=""
        onChange={() => {}}
        options={[{ value: "", label: "Tüm İş Yerleri" }]}
        placeholder="Seçiniz"
      />,
    );
    const native = q<HTMLSelectElement>("select");
    expect(Array.from(native.options, (o) => o.textContent)).toEqual(["Tüm İş Yerleri"]);
  });
});

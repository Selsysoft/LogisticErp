// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { CT_TARGET_SEARCH_IDS, TX_SEARCH_IDS } from "./accountSearchLogic";
import { ZtoAccountSearch, type ZtoAccountSearchProps } from "./ZtoAccountSearch";

const apiGet = vi.fn();
vi.mock("../../api/client", () => ({
  apiGet: (path: string) => apiGet(path),
  apiRequest: vi.fn(),
}));

const hit = (id: string, name: string, code: string, subGroupName = "Müşteri") => ({
  id,
  name,
  code,
  subGroupName,
  type: "CUSTOMER",
});

beforeEach(() => {
  vi.useFakeTimers();
  apiGet.mockReset();
  apiGet.mockResolvedValue({
    content: [hit("1", "Acar Lojistik", "MUS-0001"), hit("2", "Acar Tarım", "MUS-0002")],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderSearch(props: Partial<ZtoAccountSearchProps> = {}) {
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ZtoFinansRoot>
        <button>dışarı</button>
        <ZtoAccountSearch
          variant="atcs"
          placeholder="Cari ara..."
          emptyText="Sonuç bulunamadı"
          onSelect={onSelect}
          {...props}
        />
      </ZtoFinansRoot>
    </QueryClientProvider>,
  );
  return { onSelect, input: screen.getByRole("combobox") as HTMLInputElement };
}

/** React Query bildirimleri setTimeout(0) ile toplanır: birkaç tur zamanlayıcı ve söz akıtılır. */
async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }
}

async function type(input: HTMLInputElement, value: string, delay = 220) {
  fireEvent.change(input, { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(delay - 1);
  });
  await flush();
}

describe("ZtoAccountSearch", () => {
  it("atcs: ZTO işaretlemesi, gecikmeli arama, listbox ve combobox ARIA", async () => {
    const { input } = renderSearch({ ids: TX_SEARCH_IDS, wrapStyle: { width: 280 } });
    const wrap = document.getElementById("txCariSearchWrap") as HTMLElement;
    expect(wrap.className).toBe("atcs-wrap");
    expect(wrap.style.width).toBe("280px");
    expect(input.id).toBe("txCariSearch");
    expect(input.className).toBe("atcs-input");
    expect(input.parentElement?.className).toBe("atcs-inputbox");
    expect(input.getAttribute("aria-label")).toBe("Cari ara...");
    expect(input.getAttribute("aria-controls")).toBe("txCariSearchResults");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    const clear = document.getElementById("txCariSearchClear") as HTMLButtonElement;
    expect(clear.style.display).toBe("none");

    fireEvent.change(input, { target: { value: "aca" } });
    expect(apiGet).not.toHaveBeenCalled();
    await type(input, "acar");
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith("/finance/accounts?search=acar&active=true&size=20");
    const results = document.getElementById("txCariSearchResults") as HTMLElement;
    expect(results.className).toBe("atcs-results show");
    expect(results.getAttribute("role")).toBe("listbox");
    const items = results.querySelectorAll(".atcs-item");
    expect(items).toHaveLength(2);
    expect(items[0].querySelector(".atcs-ri-icon i")?.className).toBe("fas fa-user-tie");
    expect(items[0].querySelector(".atcs-ri-name")?.textContent).toBe("Acar Lojistik");
    expect(items[0].querySelector(".atcs-ri-sub")?.textContent).toBe("MUS-0001 · Müşteri");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(clear.style.display).toBe("");
  });

  it("↑/↓ etkin satır, Enter seçer; IME birleştirmesinde Enter seçmez", async () => {
    const { input, onSelect } = renderSearch({ variant: "qca" });
    await type(input, "acar");
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = document.querySelectorAll(".qca-result-item")[1] as HTMLElement;
    expect(second.className).toBe("qca-result-item active");
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(second.id);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
    expect(input.value).toBe("Acar Tarım");
    expect(document.querySelector(".qca-result-item")).toBeNull();
  });

  it("Enter ilk sonucu seçer; Escape kapatır; temizle metni siler ve onClear çağırır", async () => {
    const onClear = vi.fn();
    const { input, onSelect } = renderSearch({ onClear });
    await type(input, "acar");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.querySelector(".atcs-results")?.className).toBe("atcs-results");
    await type(input, "acar l");
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "Aramayı temizle" }));
    expect(input.value).toBe("");
    expect(onClear).toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it("boş sonuç role=status; hata metni; dışarı tıklama kapatır", async () => {
    apiGet.mockResolvedValueOnce({ content: [] });
    const { input } = renderSearch();
    await type(input, "yok");
    const empty = document.querySelector(".atcs-empty") as HTMLElement;
    expect(empty.textContent).toBe("Sonuç bulunamadı");
    expect(empty.getAttribute("role")).toBe("status");
    expect(document.querySelector(".atcs-results")?.hasAttribute("role")).toBe(false);
    apiGet.mockRejectedValueOnce(new Error("x"));
    await type(input, "hata");
    expect(document.querySelector(".atcs-empty")?.textContent).toBe("Hata oluştu");
    fireEvent.mouseDown(screen.getByText("dışarı"));
    expect(document.querySelector(".atcs-empty")).toBeNull();
  });

  it("listGroup (Cari Taşıma): 2 harf, 300 ms, yalnız metin, kaynak cari hariç, 'Sonuç yok'", async () => {
    const { input, onSelect } = renderSearch({
      variant: "listGroup",
      ids: CT_TARGET_SEARCH_IDS,
      excludeId: "1",
      emptyText: "Sonuç yok",
      renderItem: (h) => `${h.code} - ${h.name}`,
      types: ["CUSTOMER"],
      subGroup: "MUSTERI",
    });
    expect(input.className).toBe("form-control form-control-sm");
    const results = document.getElementById("ctTargetResults") as HTMLElement;
    expect(results.className).toBe("list-group");
    expect(results.style.display).toBe("none");
    expect(results.style.position).toBe("absolute");
    await type(input, "a", 300);
    expect(apiGet).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "ac" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(298);
    });
    expect(apiGet).not.toHaveBeenCalled();
    await flush();
    expect(apiGet).toHaveBeenCalledWith(
      "/finance/accounts?search=ac&types=CUSTOMER&subGroups=MUSTERI&active=true&size=20",
    );
    expect(results.style.display).toBe("block");
    const links = results.querySelectorAll(
      "a.list-group-item.list-group-item-action.ct-target-item",
    );
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("MUS-0002 - Acar Tarım");
    fireEvent.click(links[0]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
    apiGet.mockResolvedValueOnce({ content: [hit("1", "Acar Lojistik", "MUS-0001")] });
    await type(input, "acar l", 300);
    expect(results.querySelector("div.list-group-item.small.text-muted")?.textContent).toBe(
      "Sonuç yok",
    );
  });

  it("value prop giriş metnini belirler", () => {
    const { input } = renderSearch({ value: { id: "9", label: "Seçili Cari" } });
    expect(input.value).toBe("Seçili Cari");
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { ZtoRcpTable, type ZtoRcpTableRow } from "./ZtoRcpTable";

afterEach(cleanup);

const head = (
  <thead>
    <tr>
      <th>Hafta</th>
      <th className="text-right">Net</th>
      <th className="no-print" />
    </tr>
  </thead>
);

function makeRows(n: number, label = (i: number) => `Satır ${i}`): ZtoRcpTableRow[] {
  return Array.from({ length: n }, (_, index) => {
    const i = index + 1;
    return {
      key: `k${i}`,
      text: `${label(i)} ${i * 10}`,
      node: (
        <tr data-testid="row">
          <td data-label="Hafta">{label(i)}</td>
          <td data-label="Net">{i * 10}</td>
          <td />
        </tr>
      ),
    };
  });
}

function renderTable(
  rows: ZtoRcpTableRow[],
  extra: Partial<Parameters<typeof ZtoRcpTable>[0]> = {},
) {
  return render(
    <div className="card-body" data-testid="host">
      <ZtoRcpTable
        id="cfTable"
        tableClassName="table table-bordered table-hover cf-phone-card-table"
        head={head}
        rows={rows}
        {...extra}
      />
    </div>,
  );
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) as T;
const info = () => q(".rcpdt-info").textContent;
const visibleRows = () => screen.queryAllByTestId("row").map((tr) => tr.firstChild?.textContent);

describe("ZtoRcpTable DOM (recipe-table.js birebir)", () => {
  it("şerit .table-responsive dışında önce, alt bilgi sonra; tabloya dataTable sınıfı eklenmez", () => {
    renderTable(makeRows(8));
    const host = screen.getByTestId("host");
    expect(Array.from(host.children, (el) => el.className)).toEqual([
      "rcpdt-bar no-print",
      "table-responsive",
      "rcpdt-foot no-print",
    ]);
    const table = q<HTMLTableElement>(".table-responsive > table#cfTable");
    expect(table.className).toBe("table table-bordered table-hover cf-phone-card-table");
    expect(table.classList.contains("dataTable")).toBe(false);
    expect(document.querySelector("[class*='dataTables_']")).toBeNull();
    // Üst şerit: solda Sayfada göster (select), sağda Ara (input).
    const size = q(".rcpdt-bar > .rcpdt-size");
    expect(size.textContent).toBe("Sayfada göster: 102550Tümü kayıt");
    const select = q<HTMLSelectElement>(".rcpdt-size > select");
    expect(select.className).toBe("form-control form-control-sm no-select2");
    expect(Array.from(select.options, (o) => [o.value, o.textContent])).toEqual([
      ["10", "10"],
      ["25", "25"],
      ["50", "50"],
      ["0", "Tümü"],
    ]);
    expect(select.getAttribute("aria-label")).toBe("Sayfada gösterilecek kayıt");
    const input = q<HTMLInputElement>(".rcpdt-bar > .rcpdt-search > input");
    expect(input.type).toBe("text");
    expect(input.className).toBe("form-control form-control-sm");
    expect(input.placeholder).toBe("Tabloda ara...");
    expect(input.getAttribute("aria-label")).toBe("Tabloda ara");
    expect(q(".rcpdt-search").textContent).toBe("Ara: ");
    // 8 satır, boyut 10: tek sayfa, sayfalama düğmesi yok; özet görünür.
    expect(visibleRows()).toHaveLength(8);
    expect(info()).toBe("Toplam 8 kayıttan 1-8 arası gösteriliyor");
    expect(q(".rcpdt-info").querySelectorAll("b")).toHaveLength(2);
    expect(document.querySelector(".rcpdt-pg")).toBeNull();
  });

  it("sayfalama: ‹ sayılar ›, etkin rcpdt-active + aria-current, sınırda disabled, üç nokta", () => {
    renderTable(makeRows(95));
    const buttons = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>(".rcpdt-pg .rcpdt-btn"));
    expect(buttons().map((b) => b.textContent)).toEqual(["‹", "1", "2", "3", "10", "›"]);
    expect(q(".rcpdt-pg .rcpdt-dots").textContent).toBe("…");
    const first = buttons()[1];
    expect(first.className).toBe("rcpdt-btn rcpdt-active");
    expect(first.getAttribute("aria-current")).toBe("page");
    expect(first.getAttribute("aria-label")).toBe("Sayfa 1");
    expect(buttons()[0].disabled).toBe(true);
    expect(buttons()[0].getAttribute("aria-label")).toBe("Önceki sayfa");
    expect(buttons().every((b) => b.type === "button")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Sayfa 10" }));
    expect(info()).toBe("Toplam 95 kayıttan 91-95 arası gösteriliyor");
    expect(visibleRows()).toHaveLength(5);
    expect(buttons().at(-1)!.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Önceki sayfa" }));
    expect(info()).toBe("Toplam 95 kayıttan 81-90 arası gösteriliyor");
    fireEvent.click(screen.getByRole("button", { name: "Sonraki sayfa" }));
    expect(info()).toBe("Toplam 95 kayıttan 91-95 arası gösteriliyor");

    // Boyut değişimi sayfa 1'e döner; Tümü tek sayfa.
    fireEvent.change(q(".rcpdt-size > select"), { target: { value: "25" } });
    expect(info()).toBe("Toplam 95 kayıttan 1-25 arası gösteriliyor");
    fireEvent.change(q(".rcpdt-size > select"), { target: { value: "0" } });
    expect(info()).toBe("Toplam 95 kayıttan 1-95 arası gösteriliyor");
    expect(document.querySelector(".rcpdt-pg")).toBeNull();
  });

  it("resetKey değişince sayfa 1 (arama ve boyut korunur); aynı anahtarla yeniden sorguda sayfa korunur", async () => {
    const table = (rows: ZtoRcpTableRow[], resetKey: string) => (
      <div className="card-body" data-testid="host">
        <ZtoRcpTable
          id="cfTable"
          tableClassName="table table-bordered table-hover cf-phone-card-table"
          head={head}
          rows={rows}
          resetKey={resetKey}
        />
      </div>
    );
    const current = () => q(".rcpdt-pg [aria-current='page']").textContent;
    const { rerender } = render(table(makeRows(30), '{"cutState":""}'));
    await act(async () => {
      fireEvent.change(q(".rcpdt-search > input"), { target: { value: "Satır" } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Sayfa 3" }));
    expect(current()).toBe("3");

    // Yeni süzgeç: farklı satırlar + farklı anahtar → sayfa 1; arama metni korunur.
    rerender(table(makeRows(40), '{"cutState":"OPEN"}'));
    expect(current()).toBe("1");
    expect(info()).toBe("Toplam 40 kayıttan 1-10 arası gösteriliyor");
    expect(q<HTMLInputElement>(".rcpdt-search > input").value).toBe("Satır");
    expect(q<HTMLSelectElement>(".rcpdt-size > select").value).toBe("10");

    // Aynı süzgeçle yeniden sorgu (kur getirme / Kes sonrası): sayfa korunur, gerekirse kırpılır.
    fireEvent.click(screen.getByRole("button", { name: "Sayfa 4" }));
    expect(current()).toBe("4");
    rerender(table(makeRows(38), '{"cutState":"OPEN"}'));
    expect(current()).toBe("4");
    rerender(table(makeRows(25), '{"cutState":"OPEN"}'));
    expect(current()).toBe("3");
    expect(info()).toBe("Toplam 25 kayıttan 21-25 arası gösteriliyor");
  });

  it("arama satır metninde (Türkçe küçük harf) ve sonrası sayfa 1", async () => {
    renderTable(makeRows(30, (i) => (i === 27 ? "İZMİR" : `Satır ${i}`)));
    fireEvent.click(screen.getByRole("button", { name: "Sayfa 3" }));
    expect(info()).toBe("Toplam 30 kayıttan 21-30 arası gösteriliyor");
    await act(async () => {
      fireEvent.change(q(".rcpdt-search > input"), { target: { value: "izmir" } });
    });
    expect(visibleRows()).toEqual(["İZMİR"]);
    expect(info()).toBe("Toplam 1 kayıttan 1-1 arası gösteriliyor");
  });

  it("boş durum: süzgeç sonrası fa-search, hiç veri yokken fa-inbox; colspan thead'den", async () => {
    renderTable(makeRows(3));
    await act(async () => {
      fireEvent.change(q(".rcpdt-search > input"), { target: { value: "yok" } });
    });
    let empty = q<HTMLTableRowElement>("tbody > tr.rcpdt-empty-row");
    expect(empty.cells[0].colSpan).toBe(3);
    expect(empty.querySelector("i.fas.fa-search")).not.toBeNull();
    expect(empty.textContent).toBe("Kayıt bulunamadıArama veya filtre ölçütlerine uyan kayıt yok.");
    expect(info()).toBe("");
    cleanup();

    renderTable([], { columnCount: 7 });
    empty = q<HTMLTableRowElement>("tbody > tr.rcpdt-empty-row");
    expect(empty.cells[0].colSpan).toBe(7);
    expect(empty.querySelector("i.fas.fa-inbox")).not.toBeNull();
    expect(empty.textContent).toContain("Henüz bu listede kayıt yok.");
    expect(info()).toBe("");
  });

  it("sayfanın kendi boş satırına dokunulmaz; özet 'Kayıt bulunamadı'", () => {
    renderTable([], {
      emptyRow: (
        <tr>
          <td colSpan={3} className="text-center text-muted">
            Vadeli kalem bulunamadı.
          </td>
        </tr>
      ),
    });
    expect(document.querySelector("tr.rcpdt-empty-row")).toBeNull();
    expect(q("tbody").textContent).toBe("Vadeli kalem bulunamadı.");
    expect(info()).toBe("Kayıt bulunamadı");
  });

  it("isteğe bağlı kaydırma bölgesi adı ve tfoot", () => {
    renderTable(makeRows(2), {
      label: "Nakit akış tablosu",
      foot: (
        <tfoot>
          <tr>
            <td colSpan={3}>Toplam</td>
          </tr>
        </tfoot>
      ),
    });
    const region = screen.getByRole("region", { name: "Nakit akış tablosu" });
    expect(region.className).toBe("table-responsive");
    expect(region.tabIndex).toBe(0);
    expect(q("table > tfoot").textContent).toBe("Toplam");
    cleanup();
    renderTable(makeRows(2));
    expect(q(".table-responsive").hasAttribute("role")).toBe(false);
    expect(q(".table-responsive").hasAttribute("tabindex")).toBe(false);
  });
});

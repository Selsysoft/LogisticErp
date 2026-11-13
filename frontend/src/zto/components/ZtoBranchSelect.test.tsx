// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { useAuthStore } from "../../auth/authStore";
import type { BranchTree } from "../branch/branchTree";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { ZtoBranchSelect, ZtoBranchSelectProps } from "./ZtoBranchSelect";

const branchTree = vi.hoisted(() => ({
  state: { data: undefined as unknown, isPending: true, isError: false },
  calls: [] as unknown[][],
}));

vi.mock("../branch/branchTree", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../branch/branchTree")>()),
  useBranchTree: (...args: unknown[]) => {
    branchTree.calls.push(args);
    return branchTree.state;
  },
}));

const b = (id: string, name: string, active = true) => ({ id, code: id, name, active });

const singleFlat: BranchTree = [
  {
    companyId: null,
    companyName: "",
    groups: [{ groupId: null, groupName: "Diğer", branches: [b("a", "Merkez"), b("c", "Depo")] }],
  },
];

const multiCompany: BranchTree = [
  {
    companyId: "c1",
    companyName: "Acme",
    groups: [{ groupId: "g1", groupName: "İzmir", branches: [b("a", "Çiğli")] }],
  },
  {
    companyId: "c2",
    companyName: "Beta",
    groups: [{ groupId: null, groupName: "Diğer", branches: [b("b", "Ostim", false)] }],
  },
];

function setTree(data: BranchTree | undefined) {
  branchTree.state = { data, isPending: data === undefined, isError: false };
}

type Props = Partial<ZtoBranchSelectProps> & { spy?: (value: string) => void };

function Harness({ spy, value: initial = "", ...rest }: Props) {
  const [value, setValue] = useState(initial);
  return (
    <ZtoFinansRoot>
      <ZtoBranchSelect
        id="filterWorkPlace"
        {...rest}
        value={value}
        onChange={(next) => {
          spy?.(next);
          setValue(next);
        }}
      />
    </ZtoFinansRoot>
  );
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) as T;
const open = () => fireEvent.mouseDown(q(".select2-selection"), { button: 0 });

beforeEach(() => {
  branchTree.calls = [];
  setTree(singleFlat);
  useAuthStore.setState({ me: null });
});

afterEach(cleanup);

describe("ZtoBranchSelect", () => {
  it("allowAll: ilk seçenek 'Tüm İş Yerleri' (boş değer), × yok, zorunluluk düşer", () => {
    render(<Harness allowAll required />);
    expect(q(".select2-selection__rendered").textContent).toBe("Tüm İş Yerleri");
    expect(document.querySelector(".select2-selection__clear")).toBeNull();
    const native = q<HTMLSelectElement>("select#filterWorkPlace");
    expect(native.required).toBe(false);
    expect(Array.from(native.options, (o) => o.textContent)).toEqual([
      "Tüm İş Yerleri",
      "Merkez",
      "Depo",
    ]);
    // ZTO grupsuz iş yerlerini "Diğer" optgroup'unda gösterir (COALESCE(şube,'Diğer')).
    const group = native.querySelector('optgroup[label="Diğer"]');
    expect(Array.from(group?.querySelectorAll("option") ?? [], (o) => o.textContent)).toEqual([
      "Merkez",
      "Depo",
    ]);
    open();
    expect(screen.getByText("Tüm İş Yerleri", { selector: "li" })).toBeTruthy();
    expect(q(".select2-results__group").textContent).toBe("Diğer");
  });

  it("allowAll yokken yer tutucu 'İş Yeri Seçiniz'; zorunlu değilse × ile temizlenir", () => {
    const spy = vi.fn();
    render(<Harness value="a" spy={spy} />);
    expect(q(".select2-selection__rendered").textContent).toBe("Merkez");
    fireEvent.mouseDown(q(".select2-selection__clear"));
    expect(spy).toHaveBeenCalledWith("");
    expect(q(".select2-selection__placeholder").textContent).toBe("İş Yeri Seçiniz");
  });

  it("required: × gösterilmez, gizli select zorunlu; placeholder ve allowClear geçersiz kılınabilir", () => {
    render(<Harness value="a" required placeholder="Şube" />);
    expect(document.querySelector(".select2-selection__clear")).toBeNull();
    expect(q<HTMLSelectElement>("select").required).toBe(true);
    cleanup();
    render(<Harness value="a" required allowClear />);
    expect(document.querySelector(".select2-selection__clear")).not.toBeNull();
  });

  it("≥2 şirkette optgroup etiketi 'Şirket › Grup'; pasif şube seçilemez", () => {
    setTree(multiCompany);
    render(<Harness includeInactive scope="all" />);
    expect(branchTree.calls.at(-1)).toEqual(["all", true]);
    open();
    const groups = document.querySelectorAll(".select2-results__group");
    expect(Array.from(groups, (g) => g.textContent)).toEqual(["Acme › İzmir", "Beta › Diğer"]);
    const inactive = screen.getByText("Ostim (Pasif)", { selector: "li" });
    expect(inactive.classList.contains("select2-results__option--disabled")).toBe(true);
  });

  it("veri yüklenirken devre dışı; varsayılan kapsam 'mine', pasifler hariç", () => {
    setTree(undefined);
    render(<Harness />);
    expect(branchTree.calls.at(-1)).toEqual(["mine", false]);
    expect(q("span.select2").classList.contains("select2-container--disabled")).toBe(true);
  });

  it("defaultToUserBranch: değer boşsa oturumdaki varsayılan şube bir kez seçilir", () => {
    useAuthStore.setState({ me: { defaultBranchId: "c" } as never });
    const spy = vi.fn();
    render(<Harness defaultToUserBranch spy={spy} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("c");
    expect(q(".select2-selection__rendered").textContent).toBe("Depo");
    // Kullanıcı temizlerse yeniden uygulanmaz.
    fireEvent.mouseDown(q(".select2-selection__clear"));
    expect(spy).toHaveBeenLastCalledWith("");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("defaultToUserBranch: değer doluysa, şube ağaçta yoksa ya da alan yoksa dokunulmaz", () => {
    const spy = vi.fn();
    useAuthStore.setState({ me: { defaultBranchId: "c" } as never });
    render(<Harness defaultToUserBranch value="a" spy={spy} />);
    cleanup();
    useAuthStore.setState({ me: { defaultBranchId: "zz" } as never });
    render(<Harness defaultToUserBranch spy={spy} />);
    cleanup();
    useAuthStore.setState({ me: null });
    render(<Harness defaultToUserBranch spy={spy} />);
    cleanup();
    useAuthStore.setState({ me: { defaultBranchId: "c" } as never });
    render(<Harness spy={spy} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("tree verilince useBranchTree çağrılmaz ve ağaç olduğu gibi kullanılır", () => {
    setTree(undefined);
    render(<Harness tree={multiCompany} />);
    expect(branchTree.calls).toEqual([]);
    expect(q("span.select2").classList.contains("select2-container--disabled")).toBe(false);
    open();
    expect(screen.getByText("Çiğli", { selector: "li" })).toBeTruthy();
  });

  it("yükleme hatası role=alert ile gösterilir, kutu kilitlenir; tree verilince uyarı yok", () => {
    branchTree.state = { data: undefined, isPending: false, isError: true };
    render(<Harness />);
    expect(screen.getByRole("alert").textContent).toBe("İş yerleri yüklenemedi.");
    expect(q("span.select2").classList.contains("select2-container--disabled")).toBe(true);
    expect(q<HTMLSelectElement>("select#filterWorkPlace").disabled).toBe(true);
    cleanup();
    render(<Harness tree={multiCompany} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("className 'no-select2' yerel select çizer", () => {
    render(<Harness className="filter-field no-select2" allowAll />);
    expect(document.querySelector("span.select2")).toBeNull();
    expect(q<HTMLSelectElement>("select.filter-field").options[0].textContent).toBe(
      "Tüm İş Yerleri",
    );
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { copyRowsAsTsv, copyText, defaultNewline, toTsv } from "./copy";

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  document.body.innerHTML = "";
});

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

function mockExecCommand(result: boolean) {
  const exec = vi.fn((command: string) => command === "copy" && result);
  Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
  return exec;
}

describe("toTsv", () => {
  it("başlık, sekmeler, tr-TR sayılar; hücre içi sekme/satır sonu boşluk olur", () => {
    const text = toTsv(
      ["Ad", "Tutar", "Not"],
      [
        ["Ali", 1234.5, "bir\tiki\nüç"],
        ["Veli", null, true],
      ],
      { newline: "\n" },
    );
    expect(text).toBe("Ad\tTutar\tNot\nAli\t1.234,5\tbir iki üç\nVeli\t\tEvet");
  });

  it("formül enjeksiyonu: =, +, -, @ ile başlayan metin ' ile kaçar; sayılar kalır", () => {
    expect(
      toTsv(
        ["A"],
        [
          ["=1+1"],
          ["@SUM(A1)"],
          ["+cmd"],
          ["-x"],
          [' =HYPERLINK("u")'],
          ["-12"],
          ["-1.234,56"],
          [-5],
        ],
        { newline: "\n" },
      ),
    ).toBe("A\n'=1+1\n'@SUM(A1)\n'+cmd\n'-x\n'=HYPERLINK(\"u\")\n-12\n-1.234,56\n-5");
    expect(toTsv(["=B"], [], { title: "=Rapor", newline: "\n" })).toBe("'=Rapor\n\n'=B");
  });

  it("başlık verilirse üstte başlık ve boş satır (Buttons)", () => {
    expect(toTsv(["A"], [["1"]], { title: "Rapor", newline: "\r\n" })).toBe("Rapor\r\n\r\nA\r\n1");
  });

  it("satır sonu platforma göre", () => {
    expect(defaultNewline("Mozilla/5.0 (Windows NT 10.0)")).toBe("\r\n");
    expect(defaultNewline("Mozilla/5.0 (X11; Linux)")).toBe("\n");
    expect(toTsv(["A"], [["b"]])).toMatch(/^A\r?\nb$/);
  });
});

describe("copyText", () => {
  it("Clipboard API varsa onu kullanır", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    mockClipboard(writeText);
    await copyRowsAsTsv(["A", "B"], [[1, 2]], { newline: "\n" });
    expect(writeText).toHaveBeenCalledWith("A\tB\n1\t2");
  });

  it("Clipboard API reddederse textarea + execCommand; odak geri verilir", async () => {
    mockClipboard(() => Promise.reject(new Error("izin yok")));
    const exec = mockExecCommand(true);
    const holder = document.createElement("div");
    const button = document.createElement("button");
    holder.appendChild(button);
    document.body.appendChild(holder);
    button.focus();
    let seen: HTMLTextAreaElement | null = null;
    exec.mockImplementation(() => {
      seen = holder.querySelector("textarea");
      return true;
    });
    await copyText("metin");
    expect(exec).toHaveBeenCalledWith("copy");
    expect(seen).not.toBeNull();
    expect(seen!.value).toBe("metin");
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("Clipboard API yoksa body'ye eklenir; execCommand başarısızsa hata", async () => {
    mockExecCommand(false);
    await expect(copyText("x")).rejects.toThrow("copy failed");
    expect(document.querySelector("textarea")).toBeNull();
  });
});

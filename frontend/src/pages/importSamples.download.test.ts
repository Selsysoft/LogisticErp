// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv } from "./importSamples";

/** jsdom'un Blob'unda arrayBuffer yoktur; FileReader vardır. */
function readBytes(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("downloadCsv", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Excel'in Türkçe karakterleri okuması için UTF-8 imiyle indirir", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((value: Blob) => {
      blob = value;
      return "blob:ornek";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const content = "Kod;Ad\nM001;Çağ Ltd\n";
    downloadCsv(content, "acilis.csv");

    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("acilis.csv");
    expect(blob?.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array(await readBytes(blob!));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(content);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:ornek");
  });
});

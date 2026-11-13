import { describe, expect, it } from "vitest";
import { isZtoCssAsset, withZtoNotice, ZTO_CSS_NOTICE, ztoLicensePlugin } from "./thirdPartyNotice";

describe("ZTO CSS lisans bildirimi", () => {
  it("tek /*! */ bloğu; tüm bileşenlerin telif ve lisansı", () => {
    expect(ZTO_CSS_NOTICE.startsWith("/*!")).toBe(true);
    expect(ZTO_CSS_NOTICE.endsWith("*/")).toBe(true);
    expect(ZTO_CSS_NOTICE.indexOf("*/")).toBe(ZTO_CSS_NOTICE.length - 2);
    for (const text of [
      "SB Admin v6.0.0",
      "Bootstrap v4.4.1",
      "SpryMedia",
      "Select2 4.1.0-rc.0",
      "Select2 Bootstrap Theme",
      "Font Awesome Free 5.15.4",
      "fontawesome.com/license/free",
      "Permission is hereby granted",
    ]) {
      expect(ZTO_CSS_NOTICE).toContain(text);
    }
  });

  it("ZTO CSS paketini adından ya da kapsam sınıfından tanır", () => {
    expect(isZtoCssAsset("assets/ZtoFinansLayout-abc.css", "")).toBe(true);
    expect(isZtoCssAsset("assets/index-abc.css", ".zto-finans .row{}")).toBe(true);
    expect(isZtoCssAsset("assets/index-abc.css", ".MuiBox{}")).toBe(false);
    expect(isZtoCssAsset("assets/ZtoFinansLayout-abc.js", ".zto-finans")).toBe(false);
  });

  it("bildirim bir kez eklenir", () => {
    const once = withZtoNotice(".zto-finans{}");
    expect(once).toBe(`${ZTO_CSS_NOTICE}\n.zto-finans{}`);
    expect(withZtoNotice(once)).toBe(once);
  });

  it("eklenti yalnız derlemede, küçültmeden sonra ZTO CSS varlıklarının başına ekler", () => {
    const plugin = ztoLicensePlugin();
    expect(plugin.apply).toBe("build");
    expect(plugin.enforce).toBe("post");
    const bundle = {
      zto: { type: "asset", fileName: "assets/ZtoFinansLayout-1.css", source: ".zto-finans .a{}" },
      bytes: {
        type: "asset",
        fileName: "assets/x-2.css",
        source: new TextEncoder().encode(".zto-finans .b{}"),
      },
      other: { type: "asset", fileName: "assets/index-3.css", source: "body{}" },
      chunk: { type: "chunk", fileName: "assets/index-4.js", code: ".zto-finans" },
    };
    const hook = plugin.generateBundle as unknown as (o: unknown, b: typeof bundle) => void;
    hook.call({}, {}, bundle);
    expect(bundle.zto.source).toBe(`${ZTO_CSS_NOTICE}\n.zto-finans .a{}`);
    expect(bundle.bytes.source).toBe(`${ZTO_CSS_NOTICE}\n.zto-finans .b{}`);
    expect(bundle.other.source).toBe("body{}");
    expect(bundle.chunk).not.toHaveProperty("source");
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ZtoFinansRoot } from "./ZtoFinansRoot";
import { useZtoPortalContainer } from "./ZtoPortalContext";

function PortalProbe() {
  const container = useZtoPortalContainer();
  return <span data-testid="probe">{container ? container.className : "yok"}</span>;
}

afterEach(cleanup);

describe("ZtoFinansRoot", () => {
  it("kapsam kökünü çizer ve portal kapsayıcısı olarak kendisini verir", () => {
    const { container } = render(
      <ZtoFinansRoot className="ekstra">
        <PortalProbe />
      </ZtoFinansRoot>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toBe("zto-finans sb-nav-fixed ekstra");
    expect(screen.getByTestId("probe").textContent).toBe("zto-finans sb-nav-fixed ekstra");
    expect(root.contains(screen.getByTestId("probe"))).toBe(true);
  });

  it("ek sınıf verilmezse yalnız kök sınıfları", () => {
    const { container } = render(
      <ZtoFinansRoot>
        <p>içerik</p>
      </ZtoFinansRoot>,
    );
    expect((container.firstElementChild as HTMLElement).className).toBe("zto-finans sb-nav-fixed");
    expect(screen.getByText("içerik")).toBeTruthy();
  });

  it("kök dışında kapsayıcı null", () => {
    render(<PortalProbe />);
    expect(screen.getByTestId("probe").textContent).toBe("yok");
  });
});

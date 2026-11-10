// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { apiRequest } from "../../api/client";
import { CountInput } from "./CountsPage";
import { CountLine } from "./types";

vi.mock("../../api/client", async (original) => ({
  ...(await original<typeof import("../../api/client")>()),
  apiRequest: vi.fn(),
}));

const request = vi.mocked(apiRequest);

// API sayıları JSON sayısı olarak gönderir.
const line = (countedQuantity: number | null): CountLine => ({
  id: "l1",
  binCode: "A-01",
  sku: "UN-50",
  itemName: "Un",
  accountName: "Alfa",
  lotNo: "",
  customsStatus: "NONE",
  systemQuantity: 12.5,
  countedQuantity,
  difference: null,
});

const errors: unknown[] = [];
const onError = (event: ErrorEvent) => errors.push(event.error);

function renderInput(countedQuantity: number | null) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CountInput line={line(countedQuantity)} onSaved={() => {}} />
    </QueryClientProvider>,
  );
  return screen.getByLabelText("A-01 UN-50") as HTMLInputElement;
}

beforeEach(() => {
  request.mockReset().mockResolvedValue(undefined);
  errors.length = 0;
  window.addEventListener("error", onError);
});

afterEach(() => {
  window.removeEventListener("error", onError);
  cleanup();
});

describe("sayım kutusu", () => {
  it("sayılmış satırdan değiştirmeden çıkınca hata vermez ve kaydetmez", () => {
    const input = renderInput(12.5);
    expect(input.value).toBe("12.5");

    fireEvent.blur(input);

    expect(errors).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("aynı miktar virgülle yazılsa da yeniden kaydetmez", () => {
    const input = renderInput(12.5);

    fireEvent.change(input, { target: { value: "12,5" } });
    fireEvent.blur(input);

    expect(request).not.toHaveBeenCalled();
  });

  it("değişen miktarı noktalı biçimde kaydeder; geçersiz girişi göndermez", async () => {
    const input = renderInput(null);
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "12,5x" } });
    fireEvent.blur(input);
    expect(request).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "13,25" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("PUT", "/warehouse/count-lines/l1", {
        countedQuantity: "13.25",
      }),
    );
  });
});

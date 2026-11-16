import { describe, expect, it } from "vitest";
import { nextStatuses } from "./instrumentsPageLogic";

describe("nextStatuses", () => {
  it("sunucunun allowedTransitions listesini kullanır; ciro ve iptal süzülür", () => {
    expect(nextStatuses({ allowedTransitions: ["AT_BANK", "COLLECTED", "RETURNED"] })).toEqual([
      "AT_BANK",
      "COLLECTED",
      "RETURNED",
    ]);
    expect(nextStatuses({ allowedTransitions: ["ENDORSED", "CANCELLED", "PAID"] })).toEqual([
      "PAID",
    ]);
    expect(nextStatuses({ allowedTransitions: [] })).toEqual([]);
  });

  it("eski yanıt (alan yok) boş liste", () => {
    expect(
      nextStatuses({ allowedTransitions: undefined as unknown as InstrumentStatusList }),
    ).toEqual([]);
  });
});

type InstrumentStatusList = Parameters<typeof nextStatuses>[0]["allowedTransitions"];

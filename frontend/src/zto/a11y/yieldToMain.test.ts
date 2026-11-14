import { afterEach, describe, expect, it, vi } from "vitest";
import { mapInChunks, TASK_BUDGET_MS, yieldToMain } from "./yieldToMain";

type WithScheduler = { scheduler?: { yield?: () => Promise<void> } };

afterEach(() => {
  delete (globalThis as WithScheduler).scheduler;
  vi.useRealTimers();
});

describe("yieldToMain", () => {
  it("scheduler.yield varsa onu çağırır", async () => {
    const yieldFn = vi.fn(() => Promise.resolve());
    (globalThis as WithScheduler).scheduler = { yield: yieldFn };
    await yieldToMain();
    expect(yieldFn).toHaveBeenCalledTimes(1);
  });

  it("yoksa setTimeout(0) geri dönüşünü kullanır", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setTimeout");
    const done = vi.fn();
    void yieldToMain().then(done);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 0);
    await vi.runAllTimersAsync();
    expect(done).toHaveBeenCalled();
  });
});

describe("mapInChunks", () => {
  it("bütçe dolunca bırakır, sonuç senkron dönüşümle aynı", async () => {
    const yieldFn = vi.fn(() => Promise.resolve());
    (globalThis as WithScheduler).scheduler = { yield: yieldFn };
    let clock = 0;
    // Her öğe 20 ms sürer: 50 ms bütçede 3 öğede bir bırakılır.
    const result = await mapInChunks(
      [1, 2, 3, 4, 5, 6, 7],
      (n) => {
        clock += 20;
        return n * 2;
      },
      { now: () => clock },
    );
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(yieldFn).toHaveBeenCalledTimes(2);
    expect(TASK_BUDGET_MS).toBe(50);
  });

  it("hızlı işte hiç bırakmaz; iptal edilince durur", async () => {
    const yieldFn = vi.fn(() => Promise.resolve());
    (globalThis as WithScheduler).scheduler = { yield: yieldFn };
    expect(await mapInChunks(["a", "b"], (s) => s.toUpperCase(), { now: () => 0 })).toEqual([
      "A",
      "B",
    ]);
    expect(yieldFn).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(mapInChunks([1], (n) => n, { signal: controller.signal })).rejects.toThrow(
      "Aborted",
    );
    expect(await mapInChunks([], (n) => n)).toEqual([]);
  });
});

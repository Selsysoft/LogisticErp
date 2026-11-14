/*
 * Uzun görevleri bölme (12.1 §5.7; MWG `break-up-long-tasks`). Büyük listelerin satır görünüm modeli
 * 50 ms bütçeli parçalarla kurulur; parça arasında ana iş parçacığı tarayıcıya bırakılır (INP).
 * `scheduler.yield()` Baseline değil (Safari yok): yoksa `setTimeout(0)` geri dönüşü zorunludur.
 */

type SchedulerLike = { yield?: () => Promise<void> };

/** Ana iş parçacığını bir kez bırakır: `scheduler.yield()` varsa o, yoksa `setTimeout(0)`. */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (scheduler && typeof scheduler.yield === "function") {
    return scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Uzun görev sınırı (ms): bu süreyi aşan iş tarayıcının girdiyi işlemesini geciktirir. */
export const TASK_BUDGET_MS = 50;

/**
 * Öğeleri sırayla dönüştürür; her `budgetMs`'de bir ana iş parçacığını bırakır. `signal` iptal
 * edilirse (ör. süzgeç değişti) `AbortError` ile durur.
 */
export async function mapInChunks<T, R>(
  items: readonly T[],
  map: (item: T, index: number) => R,
  options: { budgetMs?: number; now?: () => number; signal?: AbortSignal } = {},
): Promise<R[]> {
  const budget = options.budgetMs ?? TASK_BUDGET_MS;
  const now = options.now ?? (() => performance.now());
  const result: R[] = [];
  let deadline = now() + budget;
  for (let index = 0; index < items.length; index++) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    result.push(map(items[index], index));
    if (now() >= deadline && index < items.length - 1) {
      await yieldToMain();
      deadline = now() + budget;
    }
  }
  return result;
}

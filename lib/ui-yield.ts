/**
 * Let the browser paint (Building file… overlay) before the next sync
 * Excel chunk. Node tests resolve on the next macrotask.
 */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      return;
    }
    setTimeout(resolve, 0);
  });
}

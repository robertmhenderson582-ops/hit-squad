export const SESSION_LOAD_DEADLINE_MS = 4000;
export const AUTH_REQUEST_DEADLINE_MS = 8000;
export const AUTH_TIMEOUT_ERROR = "Sign-in timed out. Try again.";

function isDeadlineAbort(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError";
}

export async function fetchJsonWithDeadline<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ms: number,
): Promise<{ ok: boolean; status: number; data: T }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(AUTH_TIMEOUT_ERROR));
    }, ms);
  });
  try {
    const response = await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      timeout,
    ]);
    const data = (await Promise.race([response.json() as Promise<T>, timeout])) as T;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (
      isDeadlineAbort(error) ||
      controller.signal.aborted ||
      (error instanceof Error && error.message === AUTH_TIMEOUT_ERROR)
    ) {
      throw new Error(AUTH_TIMEOUT_ERROR);
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

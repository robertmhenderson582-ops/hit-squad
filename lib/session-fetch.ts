export const SESSION_LOAD_DEADLINE_MS = 4000;
export const AUTH_REQUEST_DEADLINE_MS = 8000;
export const AUTH_TIMEOUT_ERROR = "Sign-in timed out. Try again.";
/** Jobs overlay must clear even when vault / Drive list hangs. */
export const JOBS_REFRESH_DEADLINE_MS = 8000;
export const JOBS_REFRESH_TIMEOUT_ERROR = "Jobs refresh timed out.";

function isDeadlineAbort(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError";
}

export async function fetchJsonWithDeadline<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ms: number,
  timeoutMessage = AUTH_TIMEOUT_ERROR,
): Promise<{ ok: boolean; status: number; data: T }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(timeoutMessage));
    }, ms);
  });
  try {
    const response = await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      timeout,
    ]);
    const raw = (await Promise.race([response.text(), timeout])) as string;
    let data = {} as T;
    if (raw.trim()) {
      try {
        data = JSON.parse(raw) as T;
      } catch {
        data = {} as T;
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (
      isDeadlineAbort(error) ||
      controller.signal.aborted ||
      (error instanceof Error && error.message === timeoutMessage)
    ) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

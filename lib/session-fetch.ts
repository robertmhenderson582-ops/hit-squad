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
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const data = (await response.json()) as T;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (isDeadlineAbort(error) || controller.signal.aborted) {
      throw new Error(AUTH_TIMEOUT_ERROR);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

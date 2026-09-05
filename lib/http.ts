import { SESSION_COOKIE } from "@/lib/auth";

export function serverTiming(parts: Array<[name: string, ms: number]>) {
  return parts.map(([name, ms]) => `${name};dur=${Math.max(0, Math.round(ms))}`).join(", ");
}

export function cookieValue(request: Request, name = SESSION_COOKIE): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

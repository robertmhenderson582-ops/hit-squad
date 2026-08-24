import { SESSION_COOKIE } from "@/lib/auth";

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

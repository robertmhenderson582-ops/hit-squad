import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession, sessionCookieOptions } from "@/lib/auth";
import type { PublicUser } from "@/lib/types";

export async function getRequestUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

export async function writeSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

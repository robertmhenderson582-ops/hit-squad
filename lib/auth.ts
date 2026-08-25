import { SignJWT, jwtVerify } from "jose";
import { ALL_CAPABILITIES, capabilitiesFor } from "@/lib/access";
import { findSeatById, findSeatByUserId } from "@/lib/seats";
import type { PublicUser } from "@/lib/types";

export const SESSION_COOKIE = "hs_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

type SessionClaims = {
  sub: string;
  email: string;
  name: string;
  role: "owner" | "tester";
  seatId?: string;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be set to a long random string.");
  }
  return new TextEncoder().encode(secret);
}

export function cookieSecure(): boolean {
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function signSession(user: PublicUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    seatId: user.seatId,
  } satisfies Omit<SessionClaims, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

function hydrateUser(base: {
  id: string;
  email: string;
  name: string;
  role: "owner" | "tester";
  seatId?: string;
}): PublicUser {
  if (base.role === "owner") {
    return {
      ...base,
      permission: "Owner desk",
      can: { ...ALL_CAPABILITIES },
      aliasPlants: false,
    };
  }

  const seat = (base.seatId ? findSeatById(base.seatId) : undefined) ?? findSeatByUserId(base.id);
  return {
    ...base,
    seatId: seat?.id ?? base.seatId,
    permission: seat?.permission ?? "Staff/numbers",
    can: seat?.can ?? capabilitiesFor("Staff/numbers"),
    aliasPlants: Boolean(seat?.aliasPlants),
  };
}

export async function readSession(token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }
    const role = payload.role === "tester" ? "tester" : "owner";
    return hydrateUser({
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role,
      seatId: typeof payload.seatId === "string" ? payload.seatId : undefined,
    });
  } catch {
    return null;
  }
}

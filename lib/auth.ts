import { SignJWT, jwtVerify } from "jose";
import type { DeskRole, PublicUser, SeatHashClaim } from "./types.ts";

export type { SeatHashClaim };

export const SESSION_COOKIE = "hs_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/** Survives logout. Restores a tester hash after a Vercel /tmp cold start. */
export const SEAT_CLAIM_COOKIE = "hs_seat_claim";
export const SEAT_CLAIM_MAX_AGE = 60 * 60 * 24 * 365;

type SessionClaims = {
  sub: string;
  email: string;
  name: string;
  role: DeskRole;
  mustChangePassword?: boolean;
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

export function seatClaimCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SEAT_CLAIM_MAX_AGE,
  };
}

export async function signSeatClaim(claim: SeatHashClaim): Promise<string> {
  return new SignJWT({
    email: claim.email,
    passwordHash: claim.passwordHash,
    mustChangePassword: Boolean(claim.mustChangePassword),
  } satisfies SeatHashClaim)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("seat-claim")
    .setIssuedAt()
    .setExpirationTime(`${SEAT_CLAIM_MAX_AGE}s`)
    .sign(secretKey());
}

export async function readSeatClaim(token: string | undefined): Promise<SeatHashClaim | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      payload.sub !== "seat-claim" ||
      typeof payload.email !== "string" ||
      typeof payload.passwordHash !== "string"
    ) {
      return null;
    }
    return {
      email: payload.email,
      passwordHash: payload.passwordHash,
      mustChangePassword: Boolean(payload.mustChangePassword),
    };
  } catch {
    return null;
  }
}

export async function signSession(user: PublicUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
  } satisfies Omit<SessionClaims, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function readSession(token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }
    const role: DeskRole =
      payload.role === "operator" ? "operator" : payload.role === "tester" ? "tester" : "owner";
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role,
      mustChangePassword: Boolean(payload.mustChangePassword),
    };
  } catch {
    return null;
  }
}

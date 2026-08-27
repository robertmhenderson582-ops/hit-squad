import type { PublicUser } from "@/lib/types";
import { VISUAL_ROSTER } from "./owner-desk.ts";
import { isJosephEmail, testerByEmail, type TesterSeatDef } from "./tester-seats.ts";

export { OWNER_LOGIN_EMAIL, isOwnerLoginEmail } from "./owner-login.ts";

export const NOVUS_EMAIL = "robertmhenderson582+novus@gmail.com";
export const NOVUS_ID = "operator-novus";

export function isOwner(user?: { role?: string } | null): boolean {
  return user?.role === "owner";
}

export function isOperator(user?: { role?: string } | null): boolean {
  return user?.role === "operator";
}

export function isTester(user?: { role?: string } | null): boolean {
  return user?.role === "tester";
}

export function hasBuildDesk(user?: { role?: string } | null): boolean {
  return isOwner(user) || isOperator(user);
}

export function canUseRateBuilder(user?: { email?: string; role?: string } | null): boolean {
  if (!user) return false;
  if (isJosephEmail(user.email)) return false;
  if (isTester(user)) return testerByEmail(user.email || "")?.rateBuilder !== false;
  return true;
}

export function canUseViewAs(user?: { email?: string; role?: string } | null): boolean {
  return hasBuildDesk(user) || isJosephEmail(user?.email);
}

export function canUseFollow(user?: { role?: string } | null): boolean {
  return hasBuildDesk(user);
}

/** Follow and View as share the desk lens. Follow wins while a seat is watched. */
export function activeLensSeat(viewAs?: string | null, followSeat?: string | null): string | null {
  if (viewingAsOther(followSeat)) return followSeat ?? null;
  if (viewingAsOther(viewAs)) return viewAs ?? null;
  return null;
}

export function viewingAsOther(viewAs?: string | null): boolean {
  return Boolean(viewAs && viewAs !== "owner");
}

export function testerFromViewAs(viewAs?: string | null): TesterSeatDef | undefined {
  if (!viewAs || viewAs === "owner") return undefined;
  const row = VISUAL_ROSTER.find((seat) => seat.id === viewAs);
  return row ? testerByEmail(row.email) : undefined;
}

/** Chrome / Settings use this seat. Real logins still gate on the session user. */
export function lensUser(
  session?: PublicUser | null,
  viewAs?: string | null,
  followSeat?: string | null,
): PublicUser | null {
  if (!session) return null;
  if (!hasBuildDesk(session)) return session;
  const seatId = activeLensSeat(viewAs, followSeat);
  if (!seatId) return session;
  const seat = testerFromViewAs(seatId);
  if (!seat) return session;
  return { id: seat.id, email: seat.email, name: seat.name, role: "tester" };
}

/** Stable effect key. lensUser returns a new object while following/viewing as. */
export function deskLensKey(user?: { id?: string; email?: string; role?: string } | null) {
  if (!user) return "";
  return `${user.id || ""}:${(user.email || "").trim().toLowerCase()}:${user.role || ""}`;
}

export function pageAllowedForSeat(
  user: PublicUser | null | undefined,
  flags: { ownerOnly?: boolean; buildDesk?: boolean; viewAs?: boolean },
) {
  if (flags.ownerOnly) return isOwner(user);
  if (flags.viewAs) return canUseViewAs(user);
  if (flags.buildDesk) return hasBuildDesk(user);
  return true;
}

export function buildDeskChrome(
  user?: PublicUser | null,
  viewAs?: string | null,
  followSeat?: string | null,
): boolean {
  return hasBuildDesk(user) && !activeLensSeat(viewAs, followSeat);
}

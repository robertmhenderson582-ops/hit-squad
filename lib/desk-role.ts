import type { PublicUser } from "@/lib/types";
import { VISUAL_ROSTER } from "./owner-desk.ts";
import { isJosephEmail, testerByEmail, TESTER_SEATS, type TesterSeatDef } from "./tester-seats.ts";

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

/** Owner, Novus, and rates seats (Joseph’s full desk). Other testers stay off the builder. */
export function canUseRateBuilder(user?: { email?: string; role?: string } | null): boolean {
  if (!user) return false;
  if (isJosephEmail(user.email)) return true;
  if (isTester(user)) return false;
  return hasBuildDesk(user);
}

/** Nathan / John Beech roster label is "PM / estimator". Owner and Novus sit above that. */
export function isProjectManager(user?: { email?: string; role?: string } | null): boolean {
  if (!user?.email) return false;
  const email = user.email.trim().toLowerCase();
  const roster = VISUAL_ROSTER.find((row) => row.email === email);
  return Boolean(roster?.permission.includes("PM"));
}

export function isProjectManagerOrAbove(user?: { email?: string; role?: string } | null): boolean {
  if (!user) return false;
  if (hasBuildDesk(user)) return true;
  return isProjectManager(user);
}

/** Read-only wage lookup for the assigned company/site. Not the Rate builder. */
export function canLookupRates(user?: { email?: string; role?: string } | null): boolean {
  if (!user) return false;
  return isProjectManagerOrAbove(user);
}

export function canOpenRates(user?: { email?: string; role?: string } | null): boolean {
  return canLookupRates(user) || canUseRateBuilder(user);
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

export function testerFromViewAs(
  viewAs?: string | null,
  people: Array<{ id: string; email: string; name: string }> = [],
): TesterSeatDef | undefined {
  if (!viewAs || viewAs === "owner") return undefined;
  const row = VISUAL_ROSTER.find((seat) => seat.id === viewAs);
  if (row) return testerByEmail(row.email);
  const seeded = testerByEmail(people.find((person) => person.id === viewAs)?.email || "")
    || TESTER_SEATS.find((seat) => seat.id === viewAs);
  if (seeded) return seeded;
  const person = people.find((item) => item.id === viewAs || item.email === viewAs);
  if (!person) return undefined;
  const known = testerByEmail(person.email);
  if (known) return known;
  return {
    id: person.id,
    email: person.email,
    name: person.name,
    aliased: true,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
    company: "hitsquad",
  };
}

/** Chrome / Settings use this seat. Real logins still gate on the session user. */
export function lensUser(
  session?: PublicUser | null,
  viewAs?: string | null,
  followSeat?: string | null,
  people: Array<{ id: string; email: string; name: string }> = [],
): PublicUser | null {
  if (!session) return null;
  if (!hasBuildDesk(session)) return session;
  const seatId = activeLensSeat(viewAs, followSeat);
  if (!seatId) return session;
  const seat = testerFromViewAs(seatId, people);
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

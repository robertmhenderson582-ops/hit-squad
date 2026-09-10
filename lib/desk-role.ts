import type { PrivilegeId, PublicUser } from "@/lib/types";
import { hasPrivilege, type PrivilegeViewer } from "./privileges.ts";
import { VISUAL_ROSTER } from "./owner-desk.ts";
import { isJosephEmail, testerByEmail, TESTER_SEATS, type TesterSeatDef } from "./tester-seats.ts";

export { OWNER_LOGIN_EMAIL, isOwnerLoginEmail } from "./owner-login.ts";
export { hasPrivilege } from "./privileges.ts";

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

export function isPresident(user?: { role?: string } | null): boolean {
  return user?.role === "president";
}

/** Owner + Novus ship tools. President stays off unless Privileges grants designer-ship. */
export function hasBuildDesk(user?: PrivilegeViewer | null): boolean {
  return isOwner(user) || isOperator(user);
}

/** Owner, Novus, and President — Madison work modules, Activity view, presence. */
export function hasWorkingDesk(user?: PrivilegeViewer | null): boolean {
  return hasBuildDesk(user) || isPresident(user);
}

/** Job card Archive / Delete / Restore. Owner desk, or a temporary Privileges grant. */
export function canArchiveDeleteJobs(user?: PrivilegeViewer | null): boolean {
  return isOwner(user) || hasPrivilege(user, "archive-delete");
}

export function canSeeHitSquadSeats(user?: PrivilegeViewer | null): boolean {
  if (isOwner(user) || isOperator(user)) return true;
  return hasPrivilege(user, "hitsquad-seats");
}

export function canManageUsers(user?: PrivilegeViewer | null): boolean {
  return hasBuildDesk(user) || hasPrivilege(user, "manage-users");
}

/** Owner / Novus / granted Manage users, plus seeded PM seats (Nathan, John Beech, Joseph). */
export function canAddUsers(user?: (PrivilegeViewer & { email?: string; role?: string }) | null): boolean {
  return canManageUsers(user) || isProjectManager(user);
}

/** Positions live on the working desk. PM seats can assign titles at or below their rank. */
export function canManagePositions(user?: (PrivilegeViewer & { email?: string; role?: string }) | null): boolean {
  return hasWorkingDesk(user) || canAddUsers(user);
}

export function canExpandInbox(user?: PrivilegeViewer | null): boolean {
  return isOwner(user) || hasPrivilege(user, "inbox-expand");
}

export function canSeeOwnerLog(user?: PrivilegeViewer | null): boolean {
  return isOwner(user) || hasPrivilege(user, "owner-log");
}

export function canUseVaultWipe(user?: PrivilegeViewer | null): boolean {
  return hasBuildDesk(user) || hasPrivilege(user, "vault-wipe");
}

export function canConfigAliases(user?: PrivilegeViewer | null): boolean {
  return hasBuildDesk(user) || hasPrivilege(user, "alias-config");
}

export function canUnaliasedExport(user?: PrivilegeViewer | null): boolean {
  return isOwner(user) || hasPrivilege(user, "unaliased-export");
}

export function canDesignerShip(user?: PrivilegeViewer | null): boolean {
  return hasBuildDesk(user) || hasPrivilege(user, "designer-ship");
}

export function canSecurityBilling(user?: PrivilegeViewer | null): boolean {
  return isOwner(user) || hasPrivilege(user, "security-billing");
}

/** Owner-eyes-only Rate Vault workshop. Default grant is owner; Privileges can assign later. */
export function canSeeRateVault(user?: PrivilegeViewer | null): boolean {
  return hasPrivilege(user, "rate-vault");
}

/** Home door: session and lens must both hold the grant. View as a tester hides the door. */
export function canSeeRateVaultDoor(
  session?: PrivilegeViewer | null,
  lens?: PrivilegeViewer | null,
): boolean {
  return canSeeRateVault(session) && canSeeRateVault(lens ?? session);
}

/** Owner, Novus, President, and rates seats (Joseph’s full desk). Other testers stay off the builder. */
export function canUseRateBuilder(user?: { email?: string; role?: string } | null): boolean {
  if (!user) return false;
  if (isJosephEmail(user.email)) return true;
  if (isTester(user)) return false;
  return hasWorkingDesk(user);
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
  if (hasWorkingDesk(user)) return true;
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

export function canUseViewAs(user?: PrivilegeViewer & { email?: string } | null): boolean {
  if (hasPrivilege(user, "view-as")) return true;
  if (isPresident(user)) return false;
  return hasBuildDesk(user) || isJosephEmail(user?.email);
}

export function canUseFollow(user?: PrivilegeViewer | null): boolean {
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

type LensPerson = { id: string; email: string; name: string; role?: string };

export function testerFromViewAs(
  viewAs?: string | null,
  people: Array<LensPerson> = [],
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
  const president = person.role === "president";
  return {
    id: person.id,
    email: person.email,
    name: person.name,
    aliased: !president,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
    company: president ? "madison" : "hitsquad",
  };
}

function lensRoleForPerson(person?: LensPerson): PublicUser["role"] {
  return person?.role === "president" ? "president" : "tester";
}

/** Chrome / Settings use this seat. Real logins still gate on the session user. */
export function lensUser(
  session?: PublicUser | null,
  viewAs?: string | null,
  followSeat?: string | null,
  people: Array<LensPerson> = [],
): PublicUser | null {
  if (!session) return null;
  if (!hasBuildDesk(session)) return session;
  const seatId = activeLensSeat(viewAs, followSeat);
  if (!seatId) return session;
  const seat = testerFromViewAs(seatId, people);
  if (!seat) return session;
  const person = people.find((item) => item.id === seatId || item.email === seat.email || item.id === seat.id);
  return { id: seat.id, email: seat.email, name: seat.name, role: lensRoleForPerson(person) };
}

/** Stable effect key. lensUser returns a new object while following/viewing as. */
export function deskLensKey(user?: { id?: string; email?: string; role?: string } | null) {
  if (!user) return "";
  return `${user.id || ""}:${(user.email || "").trim().toLowerCase()}:${user.role || ""}`;
}

export function pageAllowedForSeat(
  user: (PrivilegeViewer & { email?: string; id?: string; name?: string }) | PublicUser | null | undefined,
  flags: {
    ownerOnly?: boolean;
    buildDesk?: boolean;
    viewAs?: boolean;
    workingDesk?: boolean;
    addUsers?: boolean;
    privilege?: PrivilegeId;
  },
) {
  if (flags.privilege) {
    return (
      hasPrivilege(user, flags.privilege) ||
      (Boolean(flags.buildDesk) && hasBuildDesk(user)) ||
      (Boolean(flags.workingDesk) && hasWorkingDesk(user)) ||
      (Boolean(flags.addUsers) && canAddUsers(user))
    );
  }
  if (flags.addUsers) {
    return canAddUsers(user) || (Boolean(flags.workingDesk) && hasWorkingDesk(user));
  }
  if (flags.ownerOnly) return isOwner(user);
  if (flags.viewAs) return canUseViewAs(user);
  if (flags.workingDesk) return hasWorkingDesk(user);
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

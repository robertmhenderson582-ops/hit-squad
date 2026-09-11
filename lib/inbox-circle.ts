import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { canExpandInbox, isPresident, NOVUS_EMAIL } from "./desk-role.ts";
import { isMadisonAssigned } from "./desk-people.ts";
import type { PrivilegeViewer } from "./privileges.ts";
import { isRateVaultJamesEmail } from "./rate-vault.ts";
import { testerByEmail, TESTER_SEATS } from "./tester-seats.ts";

export type InboxCirclePerson = {
  id: string;
  email: string;
  name: string;
  company: string;
};

/** Desk-bot Inbox identity. Not a login seat. Not the Novus operator. */
export const NOVUS_INBOX_ID = "novus";
export const NOVUS_INBOX_EMAIL = "novus@hitsquad.local";

/** In-program Inbox + Suggestion Box + Desk bot. Not the rest of the testers. */
export const INBOX_CIRCLE: InboxCirclePerson[] = [
  { id: "owner", email: OWNER_LOGIN_EMAIL, name: "Robert Henderson", company: "Hit Squad" },
  { id: "tester-nathan", email: "nathanboyte@gmail.com", name: "Nathan Boyte", company: "Madison" },
  { id: "tester-benny", email: "bccamp2@gmail.com", name: "Benny Camp", company: "Hit Squad" },
  { id: "tester-shane", email: "shane@apcontrolsllc.com", name: "Shane Smith", company: "Hit Squad" },
  { id: "tester-wendell", email: "wlanderno@yahoo.com", name: "Wendell Landerno", company: "Hit Squad" },
  { id: "tester-chance", email: "chancec318@yahoo.com", name: "Chance Middlebrooks", company: "Hit Squad" },
  { id: NOVUS_INBOX_ID, email: NOVUS_INBOX_EMAIL, name: "Novus", company: "Hit Squad" },
];

export function normalizeInboxEmail(email = "") {
  return email.trim().toLowerCase();
}

export function isInboxCircleEmail(email = "") {
  const key = normalizeInboxEmail(email);
  if (!key || key === NOVUS_EMAIL) return false;
  return INBOX_CIRCLE.some((row) => row.email === key);
}

export function inboxCirclePerson(email = "") {
  const key = normalizeInboxEmail(email);
  return INBOX_CIRCLE.find((row) => row.email === key);
}

export function inboxCircleById(id = "") {
  return INBOX_CIRCLE.find((row) => row.id === id);
}

export function isNovusInboxEmail(email = "") {
  return normalizeInboxEmail(email) === NOVUS_INBOX_EMAIL;
}

export function canUseInbox(user?: (PrivilegeViewer & { email?: string }) | null): boolean {
  const email = normalizeInboxEmail(user?.email);
  if (!email || isNovusInboxEmail(email) || email === NOVUS_EMAIL || isRateVaultJamesEmail(email)) return false;
  if (isPresident(user)) return true;
  return isInboxCircleEmail(email);
}

export function canUseSuggestionBox(user?: { email?: string } | null): boolean {
  return canUseInbox(user);
}

export function canReceiveDeskBot(user?: { email?: string } | null): boolean {
  return canUseInbox(user);
}

export function madisonInboxContacts(
  email = "",
  people: Array<{ id: string; email: string; name: string; companyId?: string }> = [],
): InboxCirclePerson[] {
  const key = normalizeInboxEmail(email);
  const rows: InboxCirclePerson[] = [];
  const seen = new Set<string>();
  function add(row: InboxCirclePerson) {
    const next = normalizeInboxEmail(row.email);
    if (
      !next ||
      next === key ||
      seen.has(next) ||
      next === NOVUS_EMAIL ||
      isNovusInboxEmail(next) ||
      isRateVaultJamesEmail(next)
    ) {
      return;
    }
    seen.add(next);
    rows.push({ ...row, email: next });
  }
  const owner = INBOX_CIRCLE.find((row) => row.id === "owner");
  if (owner) add(owner);
  for (const row of INBOX_CIRCLE) {
    if (row.company === "Madison") add(row);
  }
  for (const seat of TESTER_SEATS) {
    if (seat.company !== "madison") continue;
    add({ id: seat.id, email: seat.email, name: seat.name, company: "Madison" });
  }
  for (const person of people) {
    if (!isMadisonAssigned(person)) continue;
    add({
      id: person.id,
      email: person.email,
      name: person.name,
      company: "Madison",
    });
  }
  return rows;
}

export function inboxContactsFor(
  email = "",
  viewer?: PrivilegeViewer | null,
  people: Array<{ id: string; email: string; name: string; companyId?: string }> = [],
): InboxCirclePerson[] {
  const key = normalizeInboxEmail(email);
  if (isRateVaultJamesEmail(key)) return [];
  if (isPresident(viewer)) {
    if (canExpandInbox(viewer)) {
      return INBOX_CIRCLE.filter((row) => row.email !== key && !isRateVaultJamesEmail(row.email));
    }
    return madisonInboxContacts(key, people);
  }
  if (!isInboxCircleEmail(key)) return [];
  return INBOX_CIRCLE.filter((row) => row.email !== key && !isRateVaultJamesEmail(row.email));
}

export function inboxPeerFor(email = ""): InboxCirclePerson | undefined {
  const circle = inboxCirclePerson(email);
  if (circle) return circle;
  const tester = testerByEmail(email);
  if (!tester) return undefined;
  return {
    id: tester.id,
    email: tester.email,
    name: tester.name,
    company: tester.company === "madison" ? "Madison" : "Hit Squad",
  };
}

export function isMadisonInboxEmail(email = "") {
  const key = normalizeInboxEmail(email);
  if (!key) return false;
  if (INBOX_CIRCLE.some((row) => row.email === key && row.company === "Madison")) return true;
  return testerByEmail(key)?.company === "madison";
}

/** Persist / hydrate Inbox pairs. Circle, Madison seats, or a message that touches the circle. */
export function keepInboxPair(from = "", to = "") {
  const a = normalizeInboxEmail(from);
  const b = normalizeInboxEmail(to);
  if (!a.includes("@") || !b.includes("@")) return false;
  if (a === NOVUS_EMAIL || b === NOVUS_EMAIL) return false;
  if (isRateVaultJamesEmail(a) || isRateVaultJamesEmail(b)) return false;
  if (isInboxCircleEmail(a) || isInboxCircleEmail(b)) return true;
  if (isMadisonInboxEmail(a) || isMadisonInboxEmail(b)) return true;
  return false;
}

export function inboxThreadKey(a: string, b: string) {
  return [normalizeInboxEmail(a), normalizeInboxEmail(b)].sort().join("|");
}

export function isInboxCircleSeat(seat = "", email = "") {
  if (isInboxCircleEmail(email)) return true;
  const key = seat.trim().toLowerCase();
  if (!key) return false;
  if (INBOX_CIRCLE.some((row) => row.id === key || row.email === key)) return true;
  const tester = testerByEmail(key);
  return Boolean(tester && isInboxCircleEmail(tester.email));
}

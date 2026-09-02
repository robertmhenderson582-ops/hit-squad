import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { testerByEmail } from "./tester-seats.ts";

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

export function canUseInbox(user?: { email?: string } | null): boolean {
  const email = normalizeInboxEmail(user?.email);
  if (!email || isNovusInboxEmail(email) || email === NOVUS_EMAIL) return false;
  return isInboxCircleEmail(email);
}

export function canUseSuggestionBox(user?: { email?: string } | null): boolean {
  return canUseInbox(user);
}

export function canReceiveDeskBot(user?: { email?: string } | null): boolean {
  return canUseInbox(user);
}

export function inboxContactsFor(email = ""): InboxCirclePerson[] {
  const key = normalizeInboxEmail(email);
  if (!isInboxCircleEmail(key)) return [];
  return INBOX_CIRCLE.filter((row) => row.email !== key);
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

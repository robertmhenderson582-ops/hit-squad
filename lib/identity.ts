import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

export const OWNER_ID = "owner-robert-henderson";
export const OWNER_DISPLAY_NAME = "Robert Henderson";

export type CanonicalPerson = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "operator" | "tester";
};

function normalizeKey(value = "") {
  return value.trim().toLowerCase();
}

function localPart(value = "") {
  const key = normalizeKey(value);
  const at = key.indexOf("@");
  return at === -1 ? key : key.slice(0, at);
}

function knownPeople(): CanonicalPerson[] {
  return [
    { id: OWNER_ID, email: OWNER_LOGIN_EMAIL, name: OWNER_DISPLAY_NAME, role: "owner" },
    { id: "operator-novus", email: NOVUS_EMAIL, name: "Novus", role: "operator" },
    ...TESTER_SEATS.map((seat) => ({
      id: seat.id,
      email: seat.email,
      name: seat.name,
      role: "tester" as const,
    })),
  ];
}

function aliasesFor(person: CanonicalPerson): string[] {
  return [person.email, person.id, person.name, localPart(person.email)].map(normalizeKey).filter(Boolean);
}

/** Normalized email is the natural key. Display name and login local-part are never identities. */
export function resolveIdentity(raw?: string | null): CanonicalPerson | null {
  const key = normalizeKey(raw || "");
  if (!key) return null;
  return knownPeople().find((person) => aliasesFor(person).includes(key)) ?? null;
}

export function isOwnerIdentity(raw?: string | null) {
  return resolveIdentity(raw)?.role === "owner";
}

export function isSamePerson(left?: string | null, right?: string | null) {
  const a = resolveIdentity(left);
  const b = resolveIdentity(right);
  if (a && b) return a.email === b.email;
  const leftKey = normalizeKey(left || "");
  const rightKey = normalizeKey(right || "");
  return Boolean(leftKey && leftKey === rightKey);
}

export function canonicalEmail(raw?: string | null) {
  const person = resolveIdentity(raw);
  if (person) return person.email;
  const key = normalizeKey(raw || "");
  return key.includes("@") ? key : "";
}

export function canonicalDisplayName(raw?: string | null) {
  return resolveIdentity(raw)?.name || (raw || "").trim();
}

export function isOwnerAliasSeat(row: { id?: string; email?: string }) {
  return isOwnerIdentity(row.email) || isOwnerIdentity(row.id);
}

export function identityBucket(raw?: string | null) {
  return canonicalEmail(raw) || normalizeKey(raw || "");
}

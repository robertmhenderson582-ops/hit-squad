import bcrypt from "bcryptjs";
import { NOVUS_EMAIL, NOVUS_ID } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { EMPTY_MODULES } from "./roster.ts";
import {
  ADD_PERMISSIONS,
  extraSeatByEmail,
  listExtraSeats,
  loadSeatFile,
  resetSeatFileForTests,
  saveSeatFile,
  type AddPermission,
  type ExtraSeat,
  type SeatHash,
} from "./seat-store.ts";
import { TESTER_SEATS } from "./tester-seats.ts";
import { emailTesterInvite, inviteEmailBlocked, inviteEmailBody } from "./ticket-mail.ts";
import type { PublicUser, RosterEntry } from "./types.ts";

export { seatPasswordPath } from "./seat-store.ts";

type StoredUser = PublicUser & {
  passwordHash?: string;
};

let cachedUsers: StoredUser[] | null = null;

function persistHashes(users: StoredUser[]) {
  const hashes: Record<string, SeatHash> = {};
  for (const user of users) {
    if (!user.passwordHash || user.role === "owner") continue;
    hashes[user.email] = {
      passwordHash: user.passwordHash,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  }
  saveSeatFile({ hashes, extras: loadSeatFile().extras || [] });
}

function ownerEmail() {
  return (process.env.OWNER_EMAIL || OWNER_LOGIN_EMAIL).toLowerCase();
}

function extraUser(seat: ExtraSeat, hashes: Record<string, SeatHash>): StoredUser {
  const saved = hashes[seat.email];
  return {
    id: seat.id,
    email: seat.email,
    name: seat.name,
    role: "tester",
    mustChangePassword: saved ? Boolean(saved.mustChangePassword) : true,
    passwordHash: saved?.passwordHash,
  };
}

function seedUsers(): StoredUser[] {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error("OWNER_PASSWORD must be set at runtime.");
  }
  const file = loadSeatFile();
  const persisted = file.hashes || {};
  const owner: StoredUser = {
    id: "owner-robert-henderson",
    email: ownerEmail(),
    name: process.env.OWNER_NAME || "Robert Henderson",
    role: "owner",
    passwordHash: bcrypt.hashSync(ownerPassword, 12),
  };
  const novusSaved = persisted[NOVUS_EMAIL];
  const novus: StoredUser = {
    id: NOVUS_ID,
    email: NOVUS_EMAIL,
    name: "Novus",
    role: "operator",
    mustChangePassword: novusSaved ? Boolean(novusSaved.mustChangePassword) : true,
    passwordHash: novusSaved?.passwordHash,
  };
  const testers: StoredUser[] = TESTER_SEATS.map((seat) => {
    const saved = persisted[seat.email];
    return {
      id: seat.id,
      email: seat.email,
      name: seat.name,
      role: "tester",
      mustChangePassword: saved ? Boolean(saved.mustChangePassword) : true,
      passwordHash: saved?.passwordHash,
    };
  });
  const reserved = new Set([owner.email, NOVUS_EMAIL, ...TESTER_SEATS.map((seat) => seat.email)]);
  const extras: StoredUser[] = (file.extras || [])
    .filter((seat) => !reserved.has(seat.email))
    .map((seat) => extraUser(seat, persisted));
  return [owner, novus, ...testers, ...extras];
}

function ownerUsers(): StoredUser[] {
  if (!cachedUsers) cachedUsers = seedUsers();
  return cachedUsers;
}

function rateBuilderFor(user: StoredUser): boolean | undefined {
  if (user.role !== "tester") return undefined;
  const extra = extraSeatByEmail(user.email);
  if (extra) return extra.rateBuilder;
  const seeded = TESTER_SEATS.find((seat) => seat.email === user.email);
  return seeded ? seeded.rateBuilder : true;
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
    rateBuilder: rateBuilderFor(user),
  };
}

export function findUserByEmail(email: string): StoredUser | undefined {
  return ownerUsers().find((user) => user.email === email.trim().toLowerCase());
}

export function findUserById(id: string): StoredUser | undefined {
  return ownerUsers().find((user) => user.id === id);
}

export const GENERIC_SIGNIN_ERROR = "Sign-in failed. Check the email and password.";

export function verifyPassword(user: StoredUser, password: string): boolean {
  if (!user.passwordHash) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

export function seatNeedsPasswordCreate(email: string): boolean {
  const user = findUserByEmail(email);
  if (!user || user.role === "owner") return false;
  return !user.passwordHash;
}

export function claimFirstPassword(
  email: string,
  password: string,
  confirm: string,
): { ok: true } | { error: string; status: number } {
  const user = findUserByEmail(email);
  if (!user || user.role === "owner" || user.passwordHash) {
    return { error: GENERIC_SIGNIN_ERROR, status: 401 };
  }
  if (password.length < 8) return { error: "Password must be 8+.", status: 400 };
  if (password !== confirm) return { error: "New password and confirm did not match.", status: 400 };
  user.passwordHash = bcrypt.hashSync(password, 12);
  user.mustChangePassword = false;
  persistHashes(ownerUsers());
  return { ok: true };
}

export type LoginOutcome =
  | { status: "needsCreate" }
  | { status: "needsPassword" }
  | { status: "authenticated"; user: PublicUser }
  | { status: "error"; error: string; http: number };

export function loginOutcome(input: {
  email?: string;
  password?: string;
  newPassword?: string;
  confirmPassword?: string;
}): LoginOutcome {
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : "";

  if (!email) return { status: "error", error: GENERIC_SIGNIN_ERROR, http: 401 };

  if (newPassword || confirmPassword) {
    const claimed = claimFirstPassword(email, newPassword, confirmPassword);
    if ("error" in claimed) return { status: "error", error: claimed.error, http: claimed.status };
    const user = findUserByEmail(email);
    if (!user || user.role === "owner") {
      return { status: "error", error: GENERIC_SIGNIN_ERROR, http: 401 };
    }
    return { status: "authenticated", user: toPublicUser(user) };
  }

  if (!password) {
    return seatNeedsPasswordCreate(email)
      ? { status: "needsCreate" }
      : { status: "needsPassword" };
  }

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    return { status: "error", error: GENERIC_SIGNIN_ERROR, http: 401 };
  }
  return { status: "authenticated", user: toPublicUser(user) };
}

export function listBuildSeats(): PublicUser[] {
  return ownerUsers().map(toPublicUser);
}

function extraSeatId(email: string, used: Set<string>) {
  const local = email.split("@")[0].replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "seat";
  let id = `tester-extra-${local}`;
  let n = 2;
  while (used.has(id)) {
    id = `tester-extra-${local}-${n}`;
    n += 1;
  }
  return id;
}

export function addTesterSeat(input: {
  name?: string;
  email?: string;
  permission?: string;
  username?: string;
  expires?: string;
}): { ok: true; user: PublicUser } | { error: string; status: number } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const permission = input.permission;
  const username = typeof input.username === "string" ? input.username.trim() : "";
  const expires = typeof input.expires === "string" ? input.expires.trim() : "";

  if (!name || !email || !permission) {
    return { error: "Name, email, and permission are required.", status: 400 };
  }
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return { error: "Send a real email address.", status: 400 };
  }
  if (!ADD_PERMISSIONS.includes(permission as AddPermission)) {
    return { error: "Permission must be Trusted, Look & feel, or Staff.", status: 400 };
  }
  if (email === ownerEmail() || email === OWNER_LOGIN_EMAIL) {
    return { error: "Owner is not created from this form.", status: 400 };
  }
  if (email === NOVUS_EMAIL) {
    return { error: "Novus is not a tester and is not emailed.", status: 400 };
  }
  const blocked = inviteEmailBlocked(email);
  if (blocked) return { error: blocked, status: 400 };
  if (findUserByEmail(email)) {
    return { error: "That email is already on this desk.", status: 409 };
  }

  const file = loadSeatFile();
  const used = new Set([
    ...ownerUsers().map((user) => user.id),
    ...TESTER_SEATS.map((seat) => seat.id),
    ...(file.extras || []).map((seat) => seat.id),
  ]);
  const extra: ExtraSeat = {
    id: extraSeatId(email, used),
    email,
    name,
    username: username || email.split("@")[0],
    permission: permission as AddPermission,
    expires,
    rateBuilder: permission !== "Look & feel",
    viewAs: false,
    aliased: false,
    shop: "field",
  };
  saveSeatFile({
    hashes: file.hashes || {},
    extras: [...(file.extras || []), extra],
  });

  const user: StoredUser = extraUser(extra, file.hashes || {});
  if (cachedUsers) cachedUsers.push(user);
  else cachedUsers = seedUsers();
  return { ok: true, user: toPublicUser(user) };
}

export async function addTesterSeatWithInvite(input: {
  name?: string;
  email?: string;
  permission?: string;
  username?: string;
  expires?: string;
}): Promise<
  | { ok: true; user: PublicUser; inviteSent: boolean; inviteText: string }
  | { error: string; status: number }
> {
  const result = addTesterSeat(input);
  if ("error" in result) return result;
  const inviteText = inviteEmailBody(result.user.name);
  const inviteSent = await emailTesterInvite(result.user.email, result.user.name);
  return { ok: true, user: result.user, inviteSent, inviteText };
}

export async function resendTesterInvite(
  email: string,
): Promise<
  | { ok: true; inviteSent: boolean; inviteText: string }
  | { error: string; status: number }
> {
  const user = findUserByEmail(email);
  if (!user || user.role !== "tester") {
    return { error: "Pick a tester seat that has not created a sign-in.", status: 400 };
  }
  if (user.passwordHash) {
    return { error: "That seat already created a sign-in.", status: 400 };
  }
  const blocked = inviteEmailBlocked(user.email);
  if (blocked) return { error: blocked, status: 400 };
  const inviteText = inviteEmailBody(user.name);
  const inviteSent = await emailTesterInvite(user.email, user.name);
  return { ok: true, inviteSent, inviteText };
}

export function listAddedRoster(): RosterEntry[] {
  return listExtraSeats().map((seat) => {
    const user = findUserByEmail(seat.email);
    return {
      id: seat.id,
      name: seat.name,
      username: seat.username,
      email: seat.email,
      permission: seat.permission,
      expires: seat.expires,
      signIn: user?.passwordHash ? "Created" : "Invite — create sign-in",
      modules: EMPTY_MODULES,
      estimate: true,
      rateBuilder: seat.rateBuilder,
      passwordSet: Boolean(user?.passwordHash),
    };
  });
}

export function issueSeatPassword(email: string, password: string): { ok: true } | { error: string } {
  if (password.length < 8) return { error: "Password must be 8+." };
  const user = findUserByEmail(email);
  if (!user) return { error: "That seat is not on this desk." };
  if (user.role === "owner") return { error: "Owner password is not issued from this form." };
  user.passwordHash = bcrypt.hashSync(password, 12);
  user.mustChangePassword = true;
  persistHashes(ownerUsers());
  return { ok: true };
}

export function seatHasPassword(email: string): boolean {
  return Boolean(findUserByEmail(email)?.passwordHash);
}

export function listSeatRows(): Array<
  PublicUser & { passwordIssued: boolean; added: boolean; permission?: AddPermission }
> {
  return ownerUsers().map((user) => {
    const extra = extraSeatByEmail(user.email);
    return {
      ...toPublicUser(user),
      passwordIssued: Boolean(user.passwordHash),
      added: Boolean(extra),
      permission: extra?.permission,
    };
  });
}

export function setOwnPassword(
  email: string,
  next: string,
  current?: string,
): { ok: true } | { error: string; status: number } {
  if (next.length < 8) return { error: "New password must be 8+.", status: 400 };
  const user = findUserByEmail(email);
  if (!user) return { error: "That seat is not on this desk.", status: 404 };
  if (user.mustChangePassword) {
    user.passwordHash = bcrypt.hashSync(next, 12);
    user.mustChangePassword = false;
    persistHashes(ownerUsers());
    return { ok: true };
  }
  if (!current) return { error: "Current and new password are required.", status: 400 };
  if (!verifyPassword(user, current)) return { error: "Current password did not match.", status: 401 };
  user.passwordHash = bcrypt.hashSync(next, 12);
  persistHashes(ownerUsers());
  return { ok: true };
}

export function resetUsersForTests() {
  cachedUsers = null;
  resetSeatFileForTests();
}

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { assignedCompany } from "./companies-store.ts";
import { NOVUS_EMAIL, NOVUS_ID } from "./desk-role.ts";
import { SEATS_VAULT_KIND, SEATS_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { TESTER_SEATS } from "./tester-seats.ts";
import type { PublicUser, SeatHashClaim } from "./types.ts";

export type { SeatHashClaim };

type StoredUser = PublicUser & {
  passwordHash?: string;
};

type SeatHashRow = { passwordHash?: string; mustChangePassword?: boolean };
type SeatFile = {
  hashes?: Record<string, SeatHashRow>;
};

let cachedUsers: StoredUser[] | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;
let pendingVault: Promise<void> = Promise.resolve();

export function seatPasswordPath() {
  if (process.env.SEAT_PASSWORD_PATH) return process.env.SEAT_PASSWORD_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-seats.json";
  return join(process.cwd(), "data", "seat-passwords.json");
}

const BCRYPT_HASH = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function ownerEmail() {
  return (process.env.OWNER_EMAIL || OWNER_LOGIN_EMAIL).toLowerCase();
}

export function parseSeatHashes(raw: unknown): NonNullable<SeatFile["hashes"]> {
  const parsed = raw && typeof raw === "object" ? (raw as SeatFile) : { hashes: {} };
  const hashes: NonNullable<SeatFile["hashes"]> = {};
  for (const [email, row] of Object.entries(parsed.hashes ?? {})) {
    const key = email.trim().toLowerCase();
    if (!key || key === ownerEmail()) continue;
    if (!row || typeof row !== "object" || typeof row.passwordHash !== "string") continue;
    if (!BCRYPT_HASH.test(row.passwordHash)) continue;
    hashes[key] = {
      passwordHash: row.passwordHash,
      mustChangePassword: Boolean(row.mustChangePassword),
    };
  }
  return hashes;
}

function hasHashes(hashes: NonNullable<SeatFile["hashes"]>) {
  return Object.keys(hashes).length > 0;
}

function loadPersisted(): NonNullable<SeatFile["hashes"]> {
  try {
    return parseSeatHashes(JSON.parse(readFileSync(seatPasswordPath(), "utf8")));
  } catch {
    return {};
  }
}

function writeHashFile(hashes: NonNullable<SeatFile["hashes"]>) {
  try {
    const file = seatPasswordPath();
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ hashes }, null, 2) + "\n", "utf8");
    renameSync(tmp, file);
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function hashesFromUsers(users: StoredUser[]) {
  const hashes: NonNullable<SeatFile["hashes"]> = {};
  for (const user of users) {
    if (!user.passwordHash || user.role === "owner") continue;
    hashes[user.email] = {
      passwordHash: user.passwordHash,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  }
  return hashes;
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.SEAT_PASSWORD_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

function persistHashes(users: StoredUser[]) {
  const hashes = hashesFromUsers(users);
  writeHashFile(hashes);
  const drive = resolveAdapter();
  if (drive) {
    pendingVault = pendingVault
      .then(() => writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, { hashes }))
      .then(() => undefined)
      .catch(() => undefined);
  }
}

export async function hydrateSeatStore() {
  if (hydrated) return;
  const cached = loadPersisted();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = parseSeatHashes(await readVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND));
      if (hasHashes(vault)) writeHashFile(vault);
      else if (hasHashes(cached)) {
        await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, { hashes: cached });
      }
    } catch {
      // Keep the local cache. Cookie restoreSeatHash remains a fallback.
    }
  }
  cachedUsers = null;
  hydrated = true;
}

export async function flushSeatVault() {
  await pendingVault;
}

function seedUsers(): StoredUser[] {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error("OWNER_PASSWORD must be set at runtime.");
  }
  const persisted = loadPersisted();
  const owner: StoredUser = {
    id: "owner-robert-henderson",
    email: (process.env.OWNER_EMAIL || OWNER_LOGIN_EMAIL).toLowerCase(),
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
  return [owner, novus, ...testers];
}

function ownerUsers(): StoredUser[] {
  if (!cachedUsers) cachedUsers = seedUsers();
  return cachedUsers;
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
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

export function seatHashClaimFor(email: string): SeatHashClaim | null {
  const user = findUserByEmail(email);
  if (!user || user.role === "owner" || !user.passwordHash) return null;
  return {
    email: user.email,
    passwordHash: user.passwordHash,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

/** Rehydrate a tester hash after /tmp (or the in-memory cache) is empty. File wins if present. */
export function restoreSeatHash(email: string, claim: SeatHashClaim | null | undefined): boolean {
  if (!claim) return false;
  const wanted = email.trim().toLowerCase();
  if (!wanted || claim.email.trim().toLowerCase() !== wanted) return false;
  if (!BCRYPT_HASH.test(claim.passwordHash)) return false;
  const user = findUserByEmail(wanted);
  if (!user || user.role === "owner" || user.passwordHash) return false;
  user.passwordHash = claim.passwordHash;
  user.mustChangePassword = Boolean(claim.mustChangePassword);
  persistHashes(ownerUsers());
  return true;
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

export async function listSeatRows(): Promise<Array<PublicUser & { passwordIssued: boolean; companyId: string }>> {
  await hydrateSeatStore();
  const rows = ownerUsers();
  return Promise.all(
    rows.map(async (user) => ({
      ...toPublicUser(user),
      passwordIssued: Boolean(user.passwordHash),
      companyId: await assignedCompany(user.email),
    })),
  );
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
  hydrated = false;
  injectedAdapter = undefined;
  pendingVault = Promise.resolve();
}

export function forgetSeatCacheForTests() {
  cachedUsers = null;
  hydrated = false;
  const file = seatPasswordPath();
  if (existsSync(file)) unlinkSync(file);
}

export function useSeatVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  cachedUsers = null;
}

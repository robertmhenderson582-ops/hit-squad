import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { assignedCompany, isKnownCompany, setAssignedCompany } from "./companies-store.ts";
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

export type ExtraSeat = {
  id: string;
  email: string;
  name: string;
};

type SeatHashRow = { passwordHash?: string; mustChangePassword?: boolean };
type SeatFile = {
  hashes?: Record<string, SeatHashRow>;
  extras?: ExtraSeat[];
};
type SeatStoreFile = { hashes: NonNullable<SeatFile["hashes"]>; extras: ExtraSeat[] };

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
    if (!key) continue;
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

function hasSeatData(file: SeatStoreFile) {
  return hasHashes(file.hashes) || file.extras.length > 0;
}

/** Vault overlays local, but an owner hash on disk is never dropped if the vault omitted it. */
function mergeSeatFiles(local: SeatStoreFile, vault: SeatStoreFile): SeatStoreFile {
  const hashes = { ...local.hashes, ...vault.hashes };
  const owner = ownerEmail();
  if (local.hashes[owner] && !vault.hashes[owner]) {
    hashes[owner] = local.hashes[owner];
  }
  const extrasByEmail = new Map<string, ExtraSeat>();
  for (const extra of local.extras) extrasByEmail.set(extra.email, extra);
  for (const extra of vault.extras) extrasByEmail.set(extra.email, extra);
  return { hashes, extras: [...extrasByEmail.values()] };
}

function seatFileHasLocalOnly(merged: SeatStoreFile, vault: SeatStoreFile) {
  if (Object.keys(merged.hashes).some((email) => !vault.hashes[email])) return true;
  return merged.extras.some((extra) => !vault.extras.some((row) => row.email === extra.email));
}

export function parseExtraSeats(raw: unknown): ExtraSeat[] {
  const parsed = raw && typeof raw === "object" ? (raw as SeatFile) : { extras: [] };
  const extras: ExtraSeat[] = [];
  const seen = new Set<string>();
  const reserved = reservedEmails();
  for (const row of parsed.extras ?? []) {
    if (!row || typeof row !== "object") continue;
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    const name = typeof row.name === "string" ? row.name.trim().replace(/\s+/g, " ") : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!email || !name || !id) continue;
    if (!email.includes("@") || reserved.has(email) || seen.has(email) || seen.has(id)) continue;
    if (name.length < 2 || name.length > 80) continue;
    extras.push({ id, email, name });
    seen.add(email);
    seen.add(id);
  }
  return extras;
}

function reservedEmails() {
  return new Set<string>([ownerEmail(), NOVUS_EMAIL, ...TESTER_SEATS.map((seat) => seat.email)]);
}

function loadSeatFile(): SeatStoreFile {
  try {
    const raw = JSON.parse(readFileSync(seatPasswordPath(), "utf8"));
    return { hashes: parseSeatHashes(raw), extras: parseExtraSeats(raw) };
  } catch {
    return { hashes: {}, extras: [] };
  }
}

function loadPersisted(): NonNullable<SeatFile["hashes"]> {
  return loadSeatFile().hashes;
}

function extrasFromUsers(users: StoredUser[]): ExtraSeat[] {
  const reserved = reservedEmails();
  const extras: ExtraSeat[] = [];
  const seen = new Set<string>();
  for (const user of users) {
    if (user.role !== "tester" || reserved.has(user.email) || seen.has(user.email)) continue;
    extras.push({ id: user.id, email: user.email, name: user.name });
    seen.add(user.email);
  }
  return extras;
}

function writeSeatFile(file: SeatStoreFile) {
  try {
    const path = seatPasswordPath();
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ hashes: file.hashes, extras: file.extras }, null, 2) + "\n", "utf8");
    renameSync(tmp, path);
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function hashesFromUsers(users: StoredUser[]) {
  const hashes: NonNullable<SeatFile["hashes"]> = {};
  for (const user of users) {
    if (!user.passwordHash) continue;
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
  const extras = extrasFromUsers(users);
  writeSeatFile({ hashes, extras });
  const drive = resolveAdapter();
  if (drive) {
    pendingVault = pendingVault
      .then(() => writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, { hashes, extras }))
      .then(() => undefined)
      .catch(() => undefined);
  }
}

export async function hydrateSeatStore() {
  if (hydrated) return;
  const cached = loadSeatFile();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
      const vault = { hashes: parseSeatHashes(raw), extras: parseExtraSeats(raw) };
      if (hasSeatData(vault) || hasSeatData(cached)) {
        const merged = mergeSeatFiles(cached, vault);
        writeSeatFile(merged);
        if (hasSeatData(vault) && seatFileHasLocalOnly(merged, vault)) {
          await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, merged);
        } else if (!hasSeatData(vault) && hasSeatData(cached)) {
          await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, cached);
        }
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

function ownerPasswordHash(persisted: NonNullable<SeatFile["hashes"]>, email: string) {
  const saved = persisted[email]?.passwordHash;
  if (saved) return saved;
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error("OWNER_PASSWORD must be set at runtime.");
  }
  return bcrypt.hashSync(ownerPassword, 12);
}

function seedUsers(): StoredUser[] {
  const persisted = loadPersisted();
  const email = (process.env.OWNER_EMAIL || OWNER_LOGIN_EMAIL).toLowerCase();
  const owner: StoredUser = {
    id: "owner-robert-henderson",
    email,
    name: process.env.OWNER_NAME || "Robert Henderson",
    role: "owner",
    passwordHash: ownerPasswordHash(persisted, email),
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
  const known = new Set<string>([owner.email, novus.email, ...testers.map((seat) => seat.email)]);
  const extras: StoredUser[] = loadSeatFile().extras
    .filter((seat) => !known.has(seat.email))
    .map((seat) => {
      const saved = persisted[seat.email];
      known.add(seat.email);
      return {
        id: seat.id,
        email: seat.email,
        name: seat.name,
        role: "tester" as const,
        mustChangePassword: saved ? Boolean(saved.mustChangePassword) : true,
        passwordHash: saved?.passwordHash,
      };
    });
  return [owner, novus, ...testers, ...extras];
}

function ownerUsers(): StoredUser[] {
  if (!cachedUsers) {
    cachedUsers = seedUsers();
    persistHashes(cachedUsers);
  }
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extraSeatId(email: string, taken: Set<string>): string {
  const slug = email
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  let id = `custom-${slug || "seat"}`;
  let n = 2;
  while (taken.has(id)) {
    id = `custom-${slug || "seat"}-${n}`;
    n += 1;
  }
  return id;
}

/** Owner-created tester login. Persists in the same seats vault as hashes. */
export async function createSeat(input: {
  name?: string;
  email?: string;
  password?: string;
  companyId?: string;
}): Promise<{ ok: true; user: PublicUser } | { error: string }> {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const companyId = typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : "hitsquad";

  if (name.length < 2) return { error: "Type a name." };
  if (name.length > 80) return { error: "That name is too long." };
  if (!EMAIL_RE.test(email)) return { error: "Type a real email." };
  if (password.length < 8) return { error: "Password must be 8+." };
  if (email === ownerEmail()) return { error: "Owner stays the only owner." };
  if (email === NOVUS_EMAIL) return { error: "Novus is not added from this form." };
  // Git-seed forbids (peffley, etc.) apply to TESTER_SEATS only — not this vault path.
  if (!(await isKnownCompany(companyId))) return { error: "Pick a company on this desk." };

  await hydrateSeatStore();
  const users = ownerUsers();
  if (users.some((user) => user.email === email)) return { error: "That email already has a seat." };

  const user: StoredUser = {
    id: extraSeatId(email, new Set(users.map((row) => row.id))),
    email,
    name,
    role: "tester",
    passwordHash: bcrypt.hashSync(password, 12),
    mustChangePassword: true,
  };
  users.push(user);
  persistHashes(users);
  await setAssignedCompany(email, companyId);
  return { ok: true, user: toPublicUser(user) };
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

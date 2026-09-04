import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { assignedCompany, isKnownCompany, setAssignedCompany } from "./companies-store.ts";
import { NOVUS_EMAIL, NOVUS_ID } from "./desk-role.ts";
import {
  SEATS_VAULT_KIND,
  SEATS_VAULT_NAME,
  readVaultJson,
  resetVaultFileIdsForTests,
  writeVaultJson,
} from "./drive-data.ts";
import { DriveApiError, SEATS_SA_OPEN_ERROR, isSeatsOpenDenied, vaultDriveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import { canonicalEmail, identityBucket, isOwnerAliasSeat, isOwnerIdentity, resolveIdentity } from "./identity.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { TESTER_SEATS } from "./tester-seats.ts";
import type { PublicUser, SeatHashClaim } from "./types.ts";

export type { SeatHashClaim };

type StoredUser = PublicUser & {
  passwordHash?: string;
  previousHashes?: string[];
  recoveryHash?: string;
  recoveryConsumed?: boolean;
};

export type ExtraSeat = {
  id: string;
  email: string;
  name: string;
};

type SeatHashRow = {
  passwordHash?: string;
  mustChangePassword?: boolean;
  previousHashes?: string[];
  recoveryHash?: string;
  recoveryConsumed?: boolean;
};
type SeatFile = {
  hashes?: Record<string, SeatHashRow>;
  extras?: ExtraSeat[];
};
type SeatStoreFile = { hashes: NonNullable<SeatFile["hashes"]>; extras: ExtraSeat[] };

let cachedUsers: StoredUser[] | null = null;
let injectedAdapter: DriveAdapter | null | undefined;
let pendingVault: Promise<void> = Promise.resolve();
/** Emails whose latest writeVaultJson in this isolate resolved. Stale Drive reads must not undo that. */
const confirmedVaultWrites = new Set<string>();

function markVaultWriteConfirmed(email: string) {
  const key = canonicalEmail(email) || email.trim().toLowerCase();
  if (key) confirmedVaultWrites.add(key);
  const bucket = identityBucket(key);
  if (bucket) confirmedVaultWrites.add(bucket);
}

function vaultWriteConfirmed(email: string) {
  const key = canonicalEmail(email) || email.trim().toLowerCase();
  return confirmedVaultWrites.has(key) || confirmedVaultWrites.has(identityBucket(key));
}

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
    if (!row || typeof row !== "object") continue;
    const passwordHash =
      typeof row.passwordHash === "string" && BCRYPT_HASH.test(row.passwordHash) ? row.passwordHash : undefined;
    const recoveryHash =
      typeof row.recoveryHash === "string" && BCRYPT_HASH.test(row.recoveryHash) ? row.recoveryHash : undefined;
    if (!passwordHash && !recoveryHash) continue;
    const previous = Array.isArray(row.previousHashes)
      ? row.previousHashes.filter((hash): hash is string => typeof hash === "string" && BCRYPT_HASH.test(hash))
      : [];
    hashes[key] = {
      passwordHash,
      mustChangePassword: Boolean(row.mustChangePassword),
      previousHashes: uniqueHashes(previous, passwordHash),
      recoveryHash,
      recoveryConsumed: Boolean(row.recoveryConsumed),
    };
  }
  return collapseSeatHashes(hashes);
}

function uniqueHashes(hashes: string[], skip?: string) {
  return [...new Set(hashes.filter((hash) => hash && hash !== skip))];
}

function hashRowCandidates(row?: SeatHashRow | null) {
  const hashes = [row?.passwordHash, ...(row?.previousHashes ?? [])].filter((hash): hash is string => Boolean(hash));
  return hashes.filter((hash) => BCRYPT_HASH.test(hash));
}

/** One key per person. Alias keys (local-part, display name) fold onto normalized email. */
export function collapseSeatHashes(hashes: NonNullable<SeatFile["hashes"]>): NonNullable<SeatFile["hashes"]> {
  const groups = new Map<string, { key: string; entries: { key: string; row: SeatHashRow }[] }>();
  for (const [key, row] of Object.entries(hashes)) {
    const bucket = identityBucket(key) || key;
    const destKey = canonicalEmail(key) || key;
    const current = groups.get(bucket);
    if (!current) groups.set(bucket, { key: destKey, entries: [{ key, row }] });
    else {
      if (canonicalEmail(key)) current.key = destKey;
      current.entries.push({ key, row });
    }
  }
  const next: NonNullable<SeatFile["hashes"]> = {};
  for (const { key, entries } of groups.values()) {
    const candidates = uniqueHashes(entries.flatMap((entry) => hashRowCandidates(entry.row)));
    const preferred = entries.find((entry) => canonicalEmail(entry.key) === key || entry.key === key) ?? entries[0];
    const recoveryHash = entries.map((entry) => entry.row.recoveryHash).find((hash) => hash && BCRYPT_HASH.test(hash));
    const primary = preferred?.row.passwordHash || candidates[0];
    if (!primary && !recoveryHash) continue;
    next[key] = {
      passwordHash: primary,
      // Canonical/preferred row wins. OR-ing aliases re-sticks FIRST SIGN-IN after a password set.
      mustChangePassword: Boolean(preferred?.row.mustChangePassword),
      previousHashes: uniqueHashes(candidates, primary),
      recoveryHash,
      recoveryConsumed: entries.some((entry) => entry.row.recoveryConsumed),
    };
  }
  return next;
}

function hasHashes(hashes: NonNullable<SeatFile["hashes"]>) {
  return Object.keys(hashes).length > 0;
}

function hasSeatData(file: SeatStoreFile) {
  return hasHashes(file.hashes) || file.extras.length > 0;
}

export function mergeHashRows(left?: SeatHashRow, right?: SeatHashRow): SeatHashRow | undefined {
  if (!left) return right;
  if (!right) return left;
  const candidates = uniqueHashes([...hashRowCandidates(left), ...hashRowCandidates(right)]);
  const primary = left.passwordHash || right.passwordHash || candidates[0];
  const recoveryHash = left.recoveryHash || right.recoveryHash;
  if (!primary && !recoveryHash) return undefined;
  return {
    passwordHash: primary,
    // False wins. OR-ing re-sticks mustChange after Settings / Continue / a manual vault clear.
    mustChangePassword: Boolean(left.mustChangePassword && right.mustChangePassword),
    previousHashes: uniqueHashes(candidates, primary),
    recoveryHash,
    recoveryConsumed: Boolean(left.recoveryConsumed || right.recoveryConsumed),
  };
}

/** Vault overlays local keys, but every owner/alias credential is kept as a login candidate. */
function mergeSeatFiles(local: SeatStoreFile, vault: SeatStoreFile): SeatStoreFile {
  const hashes: NonNullable<SeatFile["hashes"]> = { ...local.hashes };
  for (const [key, vaultRow] of Object.entries(vault.hashes)) {
    const merged = mergeHashRows(hashes[key], vaultRow);
    if (merged) hashes[key] = merged;
  }
  const extrasByEmail = new Map<string, ExtraSeat>();
  for (const extra of [...local.extras, ...vault.extras]) {
    if (isOwnerAliasSeat(extra) || resolveIdentity(extra.email) || resolveIdentity(extra.id)) continue;
    extrasByEmail.set(identityBucket(extra.email) || extra.email, extra);
  }
  return { hashes: collapseSeatHashes(hashes), extras: [...extrasByEmail.values()] };
}

function seatFileHasLocalOnly(merged: SeatStoreFile, vault: SeatStoreFile) {
  if (Object.keys(merged.hashes).some((email) => !vault.hashes[email])) return true;
  return merged.extras.some((extra) => !vault.extras.some((row) => row.email === extra.email));
}

function ownerHashNeedsVaultSync(local: SeatStoreFile, vault: SeatStoreFile, email: string) {
  const localRow = ownerHashRow(local.hashes, email);
  const vaultRow = ownerHashRow(vault.hashes, email);
  if (!localRow?.passwordHash) return false;
  if (!vaultRow?.passwordHash) return true;
  if (localRow.passwordHash !== vaultRow.passwordHash && !localRow.mustChangePassword) return true;
  if (vaultRow.mustChangePassword && !localRow.mustChangePassword) return true;
  return false;
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
    const bucket = identityBucket(email);
    if (
      !email.includes("@") ||
      reserved.has(email) ||
      isOwnerAliasSeat({ id, email }) ||
      resolveIdentity(email) ||
      resolveIdentity(id) ||
      seen.has(email) ||
      seen.has(id) ||
      seen.has(bucket)
    ) {
      continue;
    }
    if (name.length < 2 || name.length > 80) continue;
    extras.push({ id, email, name });
    seen.add(email);
    seen.add(id);
    seen.add(bucket);
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

function writeSeatFile(file: SeatStoreFile, opts?: { required?: boolean }) {
  try {
    const path = seatPasswordPath();
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ hashes: file.hashes, extras: file.extras }, null, 2) + "\n", "utf8");
    renameSync(tmp, path);
  } catch (error) {
    if (opts?.required) throw error;
  }
}

function hashesFromUsers(users: StoredUser[]) {
  const hashes: NonNullable<SeatFile["hashes"]> = {};
  for (const user of users) {
    if (!user.passwordHash && !user.recoveryHash) continue;
    hashes[user.email] = {
      passwordHash: user.passwordHash,
      mustChangePassword: Boolean(user.mustChangePassword),
      previousHashes: uniqueHashes(user.previousHashes || [], user.passwordHash),
      recoveryHash: user.recoveryHash,
      recoveryConsumed: user.recoveryConsumed,
    };
  }
  return hashes;
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.SEAT_PASSWORD_PATH) return null;
  const drive = vaultDriveAdapter();
  return drive.configured ? drive : null;
}

/** Production and injected vaults must confirm seats.json. Local SEAT_PASSWORD_PATH tests do not. */
function expectVaultConfirm() {
  if (injectedAdapter !== undefined) return true;
  return !process.env.SEAT_PASSWORD_PATH;
}

function persistHashes(users: StoredUser[], opts?: { replaceEmails?: string[]; confirm?: boolean }) {
  const extras = extrasFromUsers(users);
  const hashes = collapseSeatHashes(hashesFromUsers(users));
  writeSeatFile({ hashes, extras }, { required: Boolean(opts?.confirm) });
  applyHashesToUsers(users, hashes);
  const replace = new Set(
    (opts?.replaceEmails ?? [])
      .map((email) => canonicalEmail(email) || email.trim().toLowerCase())
      .filter(Boolean),
  );
  const drive = resolveAdapter();
  if (opts?.confirm && expectVaultConfirm() && !drive) {
    throw new Error("Password was not saved");
  }
  if (drive) {
    const write = pendingVault
      .then(async () => {
        let raw: unknown = null;
        try {
          raw = await readVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
        } catch {
          // Known seats.json id is still updated when GET media throws. Merge from local so testers are not wiped.
          raw = null;
        }
        const localFallback = raw == null ? loadSeatFile() : null;
        const vaultHashes = raw == null ? localFallback!.hashes : parseSeatHashes(raw);
        const vaultExtras = raw == null ? localFallback!.extras : parseExtraSeats(raw);
        const combined: NonNullable<SeatFile["hashes"]> = { ...vaultHashes };
        for (const key of Object.keys(combined)) {
          const email = canonicalEmail(key);
          if (email && email !== key) {
            const folded = mergeHashRows(combined[email], combined[key]);
            if (folded) combined[email] = folded;
            delete combined[key];
          }
        }
        for (const [email, row] of Object.entries(hashes)) {
          if (replace.has(email)) {
            combined[email] = row;
            for (const key of Object.keys(combined)) {
              if (key !== email && identityBucket(key) === identityBucket(email)) delete combined[key];
            }
          } else {
            const merged = mergeHashRows(combined[email], row);
            if (merged) combined[email] = merged;
          }
        }
        const collapsed = collapseSeatHashes(combined);
        for (const email of replace) {
          const row = hashes[email];
          if (!row) continue;
          collapsed[email] = row;
          for (const key of Object.keys(collapsed)) {
            if (key !== email && identityBucket(key) === identityBucket(email)) delete collapsed[key];
          }
        }
        const extrasByEmail = new Map<string, ExtraSeat>();
        for (const extra of [...vaultExtras, ...extras]) {
          if (isOwnerAliasSeat(extra) || resolveIdentity(extra.email) || resolveIdentity(extra.id)) continue;
          extrasByEmail.set(identityBucket(extra.email) || extra.email, extra);
        }
        const next = { hashes: collapsed, extras: [...extrasByEmail.values()] };
        await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, next);
        for (const email of replace) markVaultWriteConfirmed(email);
        writeSeatFile(next, { required: Boolean(opts?.confirm) });
        applyHashesToUsers(users, collapsed);
      });
    pendingVault = opts?.confirm ? write : write.catch(() => undefined);
  }
}

function applyHashesToUsers(users: StoredUser[], hashes: NonNullable<SeatFile["hashes"]>) {
  for (const user of users) {
    const row = hashes[user.email] || hashes[identityBucket(user.email)];
    if (!row) continue;
    if (row.passwordHash) {
      user.passwordHash = row.passwordHash;
      user.previousHashes = row.previousHashes;
      user.mustChangePassword = Boolean(row.mustChangePassword);
    }
    user.recoveryHash = row.recoveryHash;
    user.recoveryConsumed = row.recoveryConsumed;
  }
}

export async function hydrateSeatStore() {
  const cached = loadSeatFile();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
      const vault = { hashes: parseSeatHashes(raw), extras: parseExtraSeats(raw) };
      if (hasSeatData(vault) || hasSeatData(cached)) {
        const merged = mergeSeatFiles(cached, vault);
        writeSeatFile(merged);
        const ownerNeedsSync = ownerHashNeedsVaultSync(cached, vault, ownerEmail());
        if (hasSeatData(vault) && (seatFileHasLocalOnly(merged, vault) || ownerNeedsSync)) {
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
}

const SEATS_WRITE_ATTEMPTS = 4;

async function ownerHashLandedInVault(): Promise<boolean> {
  const drive = resolveAdapter();
  if (!drive) return !expectVaultConfirm();
  const local = ownerHashRow(loadPersisted(), ownerEmail());
  if (!local?.passwordHash) return false;
  // Read seats.json and compare the owner hash. Do not md5 the local snapshot —
  // that file can differ from the merged vault payload (testers / extras).
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const raw = await readVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
      const vault = ownerHashRow(parseSeatHashes(raw), ownerEmail());
      if (
        vault?.passwordHash === local.passwordHash &&
        Boolean(vault.mustChangePassword) === Boolean(local.mustChangePassword)
      ) {
        return true;
      }
    } catch {
      // Eventual-consistency or a transient Drive read — retry before failing closed.
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
  }
  return false;
}

/**
 * Push the owner hash already on /tmp or hs_seat_claim into seats.json.
 * Retries until md5 / modifiedTime confirms. Does not invent a password.
 * Does not overwrite tester hashes.
 */
export async function persistExistingOwnerHash(input?: {
  claim?: SeatHashClaim | null;
  email?: string;
}): Promise<boolean> {
  const wanted = canonicalEmail(input?.email || "") || ownerEmail();
  if (!isOwnerIdentity(wanted) && wanted !== ownerEmail()) return false;
  const hadLocalHash = Boolean(ownerHashRow(loadPersisted(), ownerEmail())?.passwordHash);
  const claim = input?.claim;
  const ownerClaim = Boolean(
    claim &&
      BCRYPT_HASH.test(claim.passwordHash) &&
      (canonicalEmail(claim.email) === ownerEmail() || isOwnerIdentity(claim.email)),
  );
  const persisted = ownerHashRow(loadPersisted(), ownerEmail());
  const alreadyCleared = seatPasswordAlreadyCleared(ownerEmail());
  if (ownerClaim && claim) {
    restoreSeatHash(ownerEmail(), {
      ...claim,
      email: ownerEmail(),
      // Stale hs_seat_claim mustChange:true must not overwrite a cleared Settings / Continue row.
      mustChangePassword: alreadyCleared ? false : Boolean(claim.mustChangePassword),
      passwordHash: alreadyCleared && persisted?.passwordHash ? persisted.passwordHash : claim.passwordHash,
    });
  }
  if (!ownerClaim && !hadLocalHash) return false;
  const user = findUserByEmail(ownerEmail());
  if (!user?.passwordHash || !BCRYPT_HASH.test(user.passwordHash)) return false;
  const envPassword = process.env.OWNER_PASSWORD;
  if (
    !ownerClaim &&
    envPassword &&
    BCRYPT_HASH.test(user.passwordHash) &&
    bcrypt.compareSync(envPassword, user.passwordHash)
  ) {
    return false;
  }
  if (alreadyCleared || !user.mustChangePassword) {
    user.mustChangePassword = false;
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < SEATS_WRITE_ATTEMPTS; attempt++) {
    persistHashes(ownerUsers(), { replaceEmails: [ownerEmail()], confirm: true });
    try {
      await flushSeatVault();
      if (await ownerHashLandedInVault()) return true;
    } catch (error) {
      lastError = error;
    }
    pendingVault = Promise.resolve();
  }
  if (lastError) throw lastError;
  throw new Error("seats vault write not confirmed");
}

export async function flushSeatVault() {
  await pendingVault;
}

function ownerHashRow(persisted: NonNullable<SeatFile["hashes"]>, email: string) {
  const direct = persisted[email];
  if (direct?.passwordHash) return direct;
  const bucket = identityBucket(email);
  for (const [key, row] of Object.entries(persisted)) {
    if (identityBucket(key) === bucket && row.passwordHash) return row;
  }
  return undefined;
}

function isEnvOwnerPasswordHash(hash?: string) {
  const envPassword = process.env.OWNER_PASSWORD;
  return Boolean(
    hash && envPassword && BCRYPT_HASH.test(hash) && bcrypt.compareSync(envPassword, hash),
  );
}

/** True when a real (non-env-seed) password is already on file and FIRST SIGN-IN is cleared. */
function seatPasswordAlreadyCleared(email: string, user?: StoredUser) {
  const persisted = ownerHashRow(loadPersisted(), email);
  const persistedCleared =
    Boolean(persisted?.passwordHash) &&
    !persisted.mustChangePassword &&
    !isEnvOwnerPasswordHash(persisted.passwordHash);
  const memoryCleared =
    Boolean(user?.passwordHash) && !user.mustChangePassword && !isEnvOwnerPasswordHash(user.passwordHash);
  return persistedCleared || memoryCleared;
}

function ownerPasswordHash(persisted: NonNullable<SeatFile["hashes"]>, email: string) {
  const saved = ownerHashRow(persisted, email)?.passwordHash;
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
  const ownerRow = ownerHashRow(persisted, email);
  const owner: StoredUser = {
    id: "owner-robert-henderson",
    email,
    name: process.env.OWNER_NAME || "Robert Henderson",
    role: "owner",
    passwordHash: ownerPasswordHash(persisted, email),
    mustChangePassword: Boolean(ownerRow?.mustChangePassword),
    previousHashes: ownerRow?.previousHashes,
    recoveryHash: ownerRow?.recoveryHash,
    recoveryConsumed: ownerRow?.recoveryConsumed,
  };
  const novusSaved = persisted[NOVUS_EMAIL];
  const novus: StoredUser = {
    id: NOVUS_ID,
    email: NOVUS_EMAIL,
    name: "Novus",
    role: "operator",
    mustChangePassword: novusSaved ? Boolean(novusSaved.mustChangePassword) : true,
    passwordHash: novusSaved?.passwordHash,
    previousHashes: novusSaved?.previousHashes,
    recoveryHash: novusSaved?.recoveryHash,
    recoveryConsumed: novusSaved?.recoveryConsumed,
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
      previousHashes: saved?.previousHashes,
      recoveryHash: saved?.recoveryHash,
      recoveryConsumed: saved?.recoveryConsumed,
    };
  });
  const known = new Set<string>([owner.email, novus.email, ...testers.map((seat) => seat.email)]);
  const extras: StoredUser[] = loadSeatFile().extras
    .filter((seat) => !known.has(seat.email) && !isOwnerAliasSeat(seat) && !resolveIdentity(seat.email) && !resolveIdentity(seat.id))
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
        previousHashes: saved?.previousHashes,
        recoveryHash: saved?.recoveryHash,
        recoveryConsumed: saved?.recoveryConsumed,
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

/** Seat store wins over a stale session / hs_seat_claim cookie for FIRST SIGN-IN. */
export function liveSessionUser(session: PublicUser): PublicUser {
  const seat = findSeatForSession(session);
  return seat ? toPublicUser(seat) : session;
}

export function findUserByEmail(email: string): StoredUser | undefined {
  const wanted = (canonicalEmail(email) || email.trim().toLowerCase()).trim();
  if (!wanted) return undefined;
  const person = resolveIdentity(email);
  return ownerUsers().find((user) => {
    if (user.email === wanted || user.id === wanted) return true;
    if (person && (user.email === person.email || user.id === person.id)) return true;
    return identityBucket(user.email) === identityBucket(email);
  });
}

export function findUserById(id: string): StoredUser | undefined {
  return ownerUsers().find((user) => user.id === id);
}

export function findSeatForSession(session: { id?: string; email?: string }) {
  return findUserByEmail(session.email || "") || (session.id ? findUserById(session.id) : undefined);
}

export const GENERIC_SIGNIN_ERROR = "Sign-in failed. Check the email and password.";

export function verifyPassword(user: StoredUser, password: string): boolean {
  if (!password) return false;
  const hashes = [user.passwordHash, ...(user.previousHashes ?? [])].filter((hash): hash is string => Boolean(hash));
  for (const hash of hashes) {
    if (!BCRYPT_HASH.test(hash)) continue;
    if (bcrypt.compareSync(password, hash)) {
      if (hash !== user.passwordHash) {
        user.previousHashes = uniqueHashes(hashes, hash);
        user.passwordHash = hash;
        persistHashes(ownerUsers());
      }
      return true;
    }
  }
  if (user.recoveryHash && BCRYPT_HASH.test(user.recoveryHash) && bcrypt.compareSync(password, user.recoveryHash)) {
    user.recoveryHash = undefined;
    user.recoveryConsumed = true;
    user.mustChangePassword = true;
    try {
      persistHashes(ownerUsers(), { replaceEmails: [user.email], confirm: true });
    } catch {
      persistSeatFileLocal(ownerUsers());
    }
    return true;
  }
  if (user.role === "owner" && process.env.OWNER_RECOVERY_PASSWORD && password === process.env.OWNER_RECOVERY_PASSWORD) {
    user.mustChangePassword = true;
    try {
      persistHashes(ownerUsers(), { replaceEmails: [user.email], confirm: true });
    } catch {
      persistSeatFileLocal(ownerUsers());
    }
    return true;
  }
  return false;
}

function rowAcceptsPassword(row: SeatHashRow | undefined, password: string) {
  return Boolean(row?.passwordHash && BCRYPT_HASH.test(row.passwordHash) && bcrypt.compareSync(password, row.passwordHash));
}

async function driveRowAcceptsPassword(drive: DriveAdapter, key: string, password: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await readVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
      if (rowAcceptsPassword(ownerHashRow(parseSeatHashes(raw), key), password)) return true;
    } catch {
      // Eventual-consistency or a transient Drive read — retry before 503.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
  }
  return false;
}

export async function passwordWriteLanded(email: string, password: string) {
  const key = canonicalEmail(email) || email.trim().toLowerCase();
  if (!rowAcceptsPassword(ownerHashRow(loadPersisted(), key), password)) return false;
  const drive = resolveAdapter();
  if (!drive) return !expectVaultConfirm();
  // writeVaultJson already resolved in this request. One stale Drive read is not a failed write.
  if (vaultWriteConfirmed(key)) return true;
  return driveRowAcceptsPassword(drive, key, password);
}

export function seatNeedsPasswordCreate(email: string): boolean {
  const user = findUserByEmail(email);
  if (!user || user.role === "owner") return false;
  return !user.passwordHash;
}

export function seatHashClaimFor(email: string): SeatHashClaim | null {
  const user = findUserByEmail(email);
  if (!user || !user.passwordHash) return null;
  return {
    email: user.email,
    passwordHash: user.passwordHash,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

/**
 * Rehydrate a seat hash after /tmp (or the in-memory cache) is empty.
 * Tester file hash wins if present. Owner cookie can replace the env-seeded hash
 * so a Vercel isolate restart does not imprison first-sign-in.
 */
export function restoreSeatHash(email: string, claim: SeatHashClaim | null | undefined): boolean {
  if (!claim) return false;
  const wanted = email.trim().toLowerCase();
  if (!wanted || claim.email.trim().toLowerCase() !== wanted) return false;
  if (!BCRYPT_HASH.test(claim.passwordHash)) return false;
  const user = findUserByEmail(wanted);
  if (!user) return false;
  if (user.role !== "owner" && user.passwordHash) return false;
  const alreadyCleared = seatPasswordAlreadyCleared(user.email, user);
  user.passwordHash = alreadyCleared && user.passwordHash ? user.passwordHash : claim.passwordHash;
  // Do not re-apply mustChange:true from an old claim over a row that already has a password and is cleared.
  user.mustChangePassword = alreadyCleared ? false : Boolean(claim.mustChangePassword);
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
  try {
    persistHashes(ownerUsers(), { replaceEmails: [user.email], confirm: true });
  } catch {
    return { error: "Password was not saved. Try again.", status: 503 };
  }
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
  try {
    persistHashes(ownerUsers(), { replaceEmails: [user.email], confirm: true });
  } catch {
    return { error: "Password was not saved. Try again." };
  }
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
  const named = resolveIdentity(name);
  if (email === ownerEmail() || isOwnerIdentity(email) || named?.role === "owner") return { error: "Owner stays the only owner." };
  if (email === NOVUS_EMAIL || named?.role === "operator" || resolveIdentity(email)?.role === "operator") {
    return { error: "Novus is not added from this form." };
  }
  if (named || resolveIdentity(email)) return { error: "That email already has a seat." };
  // Git-seed forbids (peffley, etc.) apply to TESTER_SEATS only — not this vault path.
  if (!(await isKnownCompany(companyId))) return { error: "Pick a company on this desk." };

  await hydrateSeatStore();
  const users = ownerUsers();
  if (users.some((user) => user.email === email || identityBucket(user.email) === identityBucket(email))) {
    return { error: "That email already has a seat." };
  }

  const user: StoredUser = {
    id: extraSeatId(email, new Set(users.map((row) => row.id))),
    email,
    name,
    role: "tester",
    passwordHash: bcrypt.hashSync(password, 12),
    mustChangePassword: true,
  };
  users.push(user);
  persistHashes(users, { replaceEmails: [user.email], confirm: true });
  try {
    await flushSeatVault();
  } catch {
    pendingVault = Promise.resolve();
    return { error: "Password was not saved. Try again." };
  }
  if (!(await passwordWriteLanded(email, password))) {
    return { error: "Password was not saved. Try again." };
  }
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

export type PasswordWriteOk = { ok: true; email: string; vaultPersisted: true };
export type PasswordWriteFail = { error: string; status: number; vaultPersisted?: false };

export async function setOwnPassword(
  email: string,
  next: string,
  current?: string,
  forcedChange?: boolean,
): Promise<PasswordWriteOk | PasswordWriteFail> {
  if (next.length < 8) return { error: "New password must be 8+.", status: 400 };
  const user = findUserByEmail(email);
  if (!user) return { error: "That seat is not on this desk.", status: 404 };
  if (user.mustChangePassword || forcedChange) {
    return confirmOwnPasswordWrite(user, next, true);
  }
  if (!current) return { error: "Current and new password are required.", status: 400 };
  if (!currentPasswordAccepted(user, current)) return { error: "Current password did not match.", status: 401 };
  return confirmOwnPasswordWrite(user, next, false);
}

function currentPasswordAccepted(user: StoredUser, password: string) {
  if (!password) return false;
  const hashes = [user.passwordHash, ...(user.previousHashes ?? [])].filter((hash): hash is string => Boolean(hash));
  for (const hash of hashes) {
    if (BCRYPT_HASH.test(hash) && bcrypt.compareSync(password, hash)) return true;
  }
  if (user.recoveryHash && BCRYPT_HASH.test(user.recoveryHash) && bcrypt.compareSync(password, user.recoveryHash)) {
    return true;
  }
  return Boolean(
    user.role === "owner" && process.env.OWNER_RECOVERY_PASSWORD && password === process.env.OWNER_RECOVERY_PASSWORD,
  );
}

function persistSeatFileLocal(users: StoredUser[]) {
  const extras = extrasFromUsers(users);
  const hashes = collapseSeatHashes(hashesFromUsers(users));
  writeSeatFile({ hashes, extras });
  applyHashesToUsers(users, hashes);
}

function passwordVaultError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes(SEATS_SA_OPEN_ERROR) || isSeatsOpenDenied(error)) {
    return "Password was not saved. Service account cannot open seats.json.";
  }
  if (error instanceof DriveApiError && error.status) {
    return "Password was not saved. Try again.";
  }
  return "Password was not saved. Try again.";
}

async function confirmOwnPasswordWrite(
  user: StoredUser,
  next: string,
  forced: boolean,
): Promise<PasswordWriteOk | PasswordWriteFail> {
  user.passwordHash = bcrypt.hashSync(next, 12);
  user.previousHashes = [];
  user.recoveryHash = undefined;
  user.recoveryConsumed = false;
  user.mustChangePassword = false;
  const notSaved = (error?: unknown): PasswordWriteFail => {
    pendingVault = Promise.resolve();
    if (forced) persistSeatFileLocal(ownerUsers());
    return { error: passwordVaultError(error), status: 503, vaultPersisted: false };
  };
  try {
    persistHashes(ownerUsers(), { replaceEmails: [user.email], confirm: true });
    await flushSeatVault();
    user.mustChangePassword = false;
    user.previousHashes = [];
  } catch (error) {
    if (forced) {
      try {
        await persistExistingOwnerHash({ email: user.email });
        if (await passwordWriteLanded(user.email, next)) {
          return { ok: true, email: user.email, vaultPersisted: true };
        }
      } catch (retryError) {
        pendingVault = Promise.resolve();
        return notSaved(retryError);
      }
    }
    return notSaved(error);
  }
  if (!(await passwordWriteLanded(user.email, next))) {
    return notSaved();
  }
  return { ok: true, email: user.email, vaultPersisted: true };
}

function newRecoverySecret() {
  return randomBytes(18).toString("base64url");
}

/** One-time recovery login. Plaintext is returned only to the issuing session — never log it. */
export async function issueRecoveryPassword(
  email: string,
): Promise<{ ok: true; email: string; password: string } | { error: string }> {
  const user = findUserByEmail(email);
  if (!user) return { error: "That seat is not on this desk." };
  const password = newRecoverySecret();
  user.recoveryHash = bcrypt.hashSync(password, 12);
  user.recoveryConsumed = false;
  persistHashes(ownerUsers(), { replaceEmails: [user.email], confirm: true });
  await flushSeatVault();
  const persisted = ownerHashRow(loadPersisted(), user.email);
  if (!persisted?.recoveryHash || !bcrypt.compareSync(password, persisted.recoveryHash)) {
    return { error: "Recovery was not saved. Try again." };
  }
  return { ok: true, email: user.email, password };
}

export function ownerSeatCount() {
  return ownerUsers().filter((user) => user.role === "owner" || isOwnerIdentity(user.email) || isOwnerIdentity(user.id)).length;
}

export function resetUsersForTests() {
  cachedUsers = null;
  injectedAdapter = undefined;
  pendingVault = Promise.resolve();
  confirmedVaultWrites.clear();
  resetVaultFileIdsForTests();
}

export function forgetSeatCacheForTests() {
  cachedUsers = null;
  const file = seatPasswordPath();
  if (existsSync(file)) unlinkSync(file);
}

export function useSeatVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  cachedUsers = null;
}

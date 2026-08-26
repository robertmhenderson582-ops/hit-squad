import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { NOVUS_EMAIL, NOVUS_ID } from "@/lib/desk-role";
import { TESTER_SEATS } from "@/lib/tester-seats";
import type { PublicUser } from "@/lib/types";

type StoredUser = PublicUser & {
  passwordHash?: string;
};

type SeatFile = {
  hashes?: Record<string, { passwordHash?: string; mustChangePassword?: boolean }>;
};

let cachedUsers: StoredUser[] | null = null;

export function seatPasswordPath() {
  if (process.env.SEAT_PASSWORD_PATH) return process.env.SEAT_PASSWORD_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-seats.json";
  return join(process.cwd(), "data", "seat-passwords.json");
}

function loadPersisted(): NonNullable<SeatFile["hashes"]> {
  try {
    const parsed = JSON.parse(readFileSync(seatPasswordPath(), "utf8")) as SeatFile;
    return parsed.hashes && typeof parsed.hashes === "object" ? parsed.hashes : {};
  } catch {
    return {};
  }
}

function persistHashes(users: StoredUser[]) {
  const hashes: NonNullable<SeatFile["hashes"]> = {};
  for (const user of users) {
    if (!user.passwordHash || user.role === "owner") continue;
    hashes[user.email] = {
      passwordHash: user.passwordHash,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  }
  try {
    const file = seatPasswordPath();
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ hashes }, null, 2), "utf8");
    renameSync(tmp, file);
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function seedUsers(): StoredUser[] {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error("OWNER_PASSWORD must be set at runtime.");
  }
  const persisted = loadPersisted();
  const owner: StoredUser = {
    id: "owner-robert-henderson",
    email: (process.env.OWNER_EMAIL || "robertmhenderson582@gmail.com").toLowerCase(),
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

export function verifyPassword(user: StoredUser, password: string): boolean {
  if (!user.passwordHash) return false;
  return bcrypt.compareSync(password, user.passwordHash);
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

export function listSeatRows(): Array<PublicUser & { passwordIssued: boolean }> {
  return ownerUsers().map((user) => ({
    ...toPublicUser(user),
    passwordIssued: Boolean(user.passwordHash),
  }));
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
}

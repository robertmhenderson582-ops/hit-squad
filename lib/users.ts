import bcrypt from "bcryptjs";
import { ALL_CAPABILITIES } from "@/lib/access";
import { findSeatByEmail, findSeatByUserId } from "@/lib/seats";
import { getSeatSecret } from "@/lib/seat-store";
import type { PublicUser } from "@/lib/types";

export type StoredUser = PublicUser & {
  passwordHash: string;
};

let cachedOwner: StoredUser | null = null;

function ownerUser(): StoredUser {
  if (cachedOwner) return cachedOwner;

  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error("OWNER_PASSWORD must be set at runtime.");
  }

  cachedOwner = {
    id: "owner-robert-henderson",
    email: (process.env.OWNER_EMAIL || "robertmhenderson582@gmail.com").toLowerCase(),
    name: process.env.OWNER_NAME || "Robert Henderson",
    role: "owner",
    permission: "Owner desk",
    can: { ...ALL_CAPABILITIES },
    aliasPlants: false,
    passwordHash: bcrypt.hashSync(ownerPassword, 12),
  };
  return cachedOwner;
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    seatId: user.seatId,
    permission: user.permission,
    can: user.can,
    aliasPlants: user.aliasPlants,
  };
}

export async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
  const normalized = email.trim().toLowerCase();
  const owner = ownerUser();
  if (owner.email === normalized) return owner;

  const seat = findSeatByEmail(normalized);
  if (!seat) return undefined;
  const secret = await getSeatSecret(seat.email);
  return {
    id: seat.userId,
    email: seat.email,
    name: seat.name,
    role: "tester",
    seatId: seat.id,
    permission: seat.permission,
    can: seat.can,
    aliasPlants: seat.aliasPlants,
    passwordHash: secret?.passwordHash || "",
  };
}

export async function findUserById(id: string): Promise<StoredUser | undefined> {
  const owner = ownerUser();
  if (owner.id === id) return owner;
  const seat = findSeatByUserId(id);
  if (!seat) return undefined;
  return findUserByEmail(seat.email);
}

export function verifyPassword(user: StoredUser, password: string): boolean {
  if (!user.passwordHash) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

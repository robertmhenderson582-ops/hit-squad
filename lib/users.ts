import bcrypt from "bcryptjs";
import { NOVUS_EMAIL, NOVUS_ID } from "@/lib/desk-role";
import type { PublicUser } from "@/lib/types";

type StoredUser = PublicUser & {
  passwordHash?: string;
};

let cachedUsers: StoredUser[] | null = null;

function ownerUsers(): StoredUser[] {
  if (cachedUsers) return cachedUsers;

  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error("OWNER_PASSWORD must be set at runtime.");
  }

  cachedUsers = [
    {
      id: "owner-robert-henderson",
      email: (process.env.OWNER_EMAIL || "robertmhenderson582@gmail.com").toLowerCase(),
      name: process.env.OWNER_NAME || "Robert Henderson",
      role: "owner",
      passwordHash: bcrypt.hashSync(ownerPassword, 12),
    },
    {
      id: NOVUS_ID,
      email: NOVUS_EMAIL,
      name: "Novus",
      role: "operator",
      mustChangePassword: true,
    },
  ];
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
    return { ok: true };
  }
  if (!current) return { error: "Current and new password are required.", status: 400 };
  if (!verifyPassword(user, current)) return { error: "Current password did not match.", status: 401 };
  user.passwordHash = bcrypt.hashSync(next, 12);
  return { ok: true };
}

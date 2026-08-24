import bcrypt from "bcryptjs";
import type { PublicUser } from "@/lib/types";

type StoredUser = PublicUser & {
  passwordHash: string;
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
  ];
  return cachedUsers;
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export function findUserByEmail(email: string): StoredUser | undefined {
  return ownerUsers().find((user) => user.email === email.trim().toLowerCase());
}

export function findUserById(id: string): StoredUser | undefined {
  return ownerUsers().find((user) => user.id === id);
}

export function verifyPassword(user: StoredUser, password: string): boolean {
  return bcrypt.compareSync(password, user.passwordHash);
}

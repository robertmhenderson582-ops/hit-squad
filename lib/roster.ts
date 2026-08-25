import type { SeatPermission } from "@/lib/access";
import { SEEDED_SEATS } from "@/lib/seats";
import { clearAllSeatPasswords, clearSeatPassword, loadSeatSecrets } from "@/lib/seat-store";
import type { RosterEntry } from "@/lib/types";

export const PERMISSIONS: SeatPermission[] = [
  "Trusted/HSE",
  "Trusted/Quality",
  "PM/estimator",
  "Look & feel",
  "Staff/numbers",
  "Owner desk",
];

export async function listRoster(): Promise<RosterEntry[]> {
  const secrets = await loadSeatSecrets();
  return SEEDED_SEATS.map((seat) => {
    const secret = secrets[seat.email];
    return {
      id: seat.userId,
      name: seat.name,
      username: seat.username,
      email: seat.email,
      permission: seat.permission,
      expires: "",
      signIn: secret?.signInAt ? new Date(secret.signInAt).toLocaleString() : secret?.passwordHash ? "Password set" : "Invite open",
    };
  });
}

export async function resetInvite(email: string): Promise<void> {
  await clearSeatPassword(email);
}

export async function resetAllInvites(): Promise<void> {
  await clearAllSeatPasswords();
}

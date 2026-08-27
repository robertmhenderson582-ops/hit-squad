import { NOVUS_EMAIL } from "./desk-role.ts";
import { ownerVaultEmail, type ScopeUser } from "./estimate-scope.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

export type HandoffSeat = {
  name: string;
  email: string;
};

export const TRANSFER_WRITE_ERROR = "Could not turn that job over. The job is still on your desk.";
export const UPSERT_WRITE_ERROR = "Could not save that job. It is still on this desk. Try again.";

export function handoffSeats(): HandoffSeat[] {
  const ownerEmail = ownerVaultEmail();
  const owner: HandoffSeat = { name: "Robert Henderson", email: ownerEmail };
  const testers = TESTER_SEATS.map((seat) => ({ name: seat.name, email: seat.email }));
  return [owner, ...testers].filter((seat) => seat.email !== NOVUS_EMAIL);
}

export function handoffTargetsFor(user: ScopeUser): HandoffSeat[] {
  const email = user.email.trim().toLowerCase();
  return handoffSeats().filter((seat) => seat.email !== email);
}

export function findHandoffSeat(email: string): HandoffSeat | undefined {
  const needle = email.trim().toLowerCase();
  return handoffSeats().find((seat) => seat.email === needle);
}

export function isHandoffEmail(email: string) {
  return Boolean(findHandoffSeat(email));
}

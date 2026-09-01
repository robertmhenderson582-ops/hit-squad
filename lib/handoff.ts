import { NOVUS_EMAIL } from "./desk-role.ts";
import { normalizeEmails, ownerVaultEmail, type ScopeUser } from "./estimate-scope.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

export type HandoffSeat = {
  name: string;
  email: string;
};

export const TRANSFER_WRITE_ERROR = "Could not turn that job over. The job is still on your desk.";
export const SHARE_WRITE_ERROR = "Could not share that job. You still own it.";
export const RETURN_WRITE_ERROR = "Could not return that job. It is still on your desk.";

export function transferredFromLabel(pack: { transferredFrom?: string; transferredFromName?: string }) {
  return pack.transferredFromName || findHandoffSeat(pack.transferredFrom || "")?.name || "the previous owner";
}

export function sharedWithNames(emails: string[]) {
  return normalizeEmails(emails)
    .map((email) => findHandoffSeat(email)?.name || email)
    .filter(Boolean);
}

export function packTransferredToYou(
  pack: { ownerEmail?: string; transferredFrom?: string; transferredTo?: string },
  email = "",
) {
  const me = email.trim().toLowerCase();
  const owner = (pack.ownerEmail || "").trim().toLowerCase();
  const to = (pack.transferredTo || "").trim().toLowerCase();
  return Boolean(me && pack.transferredFrom && owner === me && (to === me || !to));
}

export function packSharedWithYou(pack: { ownerEmail?: string; sharedWith?: string[] }, email = "") {
  const me = email.trim().toLowerCase();
  const owner = (pack.ownerEmail || "").trim().toLowerCase();
  return Boolean(me && owner && owner !== me && normalizeEmails(pack.sharedWith).includes(me));
}

export function handoffMarkText(
  pack: {
    ownerEmail?: string;
    sharedWith?: string[];
    transferredFrom?: string;
    transferredTo?: string;
    transferredFromName?: string;
  },
  email = "",
) {
  const names = sharedWithNames(normalizeEmails(pack.sharedWith));
  if (packSharedWithYou(pack, email)) {
    const from = findHandoffSeat(pack.ownerEmail || "")?.name || "the owner";
    return `Shared / from ${from}.`;
  }
  if (names.length && pack.ownerEmail?.trim().toLowerCase() === email.trim().toLowerCase()) {
    return `Shared with ${names.join(", ")}.`;
  }
  if (packTransferredToYou(pack, email)) {
    return `Transferred to you from ${transferredFromLabel(pack)}.`;
  }
  return null;
}

export function handoffSeats(extras: HandoffSeat[] = []): HandoffSeat[] {
  const ownerEmail = ownerVaultEmail();
  const owner: HandoffSeat = { name: "Robert Henderson", email: ownerEmail };
  const testers = TESTER_SEATS.map((seat) => ({ name: seat.name, email: seat.email }));
  const seen = new Set<string>();
  const rows: HandoffSeat[] = [];
  for (const seat of [owner, ...testers, ...extras]) {
    const email = seat.email.trim().toLowerCase();
    if (!email || email === NOVUS_EMAIL || seen.has(email)) continue;
    seen.add(email);
    rows.push({ name: seat.name, email });
  }
  return rows;
}

export function handoffTargetsFor(user: ScopeUser, extras: HandoffSeat[] = []): HandoffSeat[] {
  const email = user.email.trim().toLowerCase();
  return handoffSeats(extras).filter((seat) => seat.email !== email);
}

export function findHandoffSeat(email: string, extras: HandoffSeat[] = []): HandoffSeat | undefined {
  const needle = email.trim().toLowerCase();
  return handoffSeats(extras).find((seat) => seat.email === needle);
}

export function isHandoffEmail(email: string, extras: HandoffSeat[] = []) {
  return Boolean(findHandoffSeat(email, extras));
}

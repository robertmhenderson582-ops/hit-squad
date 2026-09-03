import { companyIdForEmail, peopleLane, type CompanyId } from "./companies.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { normalizeEmails, ownerVaultEmail, type ScopeUser } from "./estimate-scope.ts";
import { canonicalEmail, isSamePerson } from "./identity.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

export type HandoffSeat = {
  name: string;
  email: string;
  companyId?: CompanyId;
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

function personKey(value = "") {
  return canonicalEmail(value) || value.trim().toLowerCase();
}

export function packTransferredToYou(
  pack: { ownerEmail?: string; transferredFrom?: string; transferredTo?: string },
  email = "",
) {
  const me = personKey(email);
  const owner = personKey(pack.ownerEmail);
  const to = personKey(pack.transferredTo);
  return Boolean(me && pack.transferredFrom && owner === me && (to === me || !to));
}

export function packSharedWithYou(pack: { ownerEmail?: string; sharedWith?: string[] }, email = "") {
  const me = personKey(email);
  const owner = personKey(pack.ownerEmail);
  return Boolean(me && owner && owner !== me && normalizeEmails(pack.sharedWith).some((row) => personKey(row) === me));
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
  if (names.length && isSamePerson(pack.ownerEmail, email)) {
    return `Shared with ${names.join(", ")}.`;
  }
  if (packTransferredToYou(pack, email)) {
    return `Transferred to you from ${transferredFromLabel(pack)}.`;
  }
  const ownerEmail = personKey(pack.ownerEmail);
  const me = personKey(email);
  if (ownerEmail && me && ownerEmail !== me) {
    const desk = findHandoffSeat(pack.ownerEmail || "")?.name;
    if (desk) return `${desk}'s desk.`;
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

function assignmentMap(extras: HandoffSeat[] = []): Record<string, string> {
  const next: Record<string, string> = {};
  for (const seat of TESTER_SEATS) next[seat.email] = seat.company;
  for (const seat of extras) {
    const email = seat.email.trim().toLowerCase();
    if (email && seat.companyId) next[email] = seat.companyId;
  }
  return next;
}

export function handoffTargetsFor(
  user: ScopeUser,
  extras: HandoffSeat[] = [],
  assignments?: Record<string, string>,
): HandoffSeat[] {
  const email = user.email.trim().toLowerCase();
  const map = { ...assignmentMap(extras), ...(assignments ?? {}) };
  const lane = peopleLane(companyIdForEmail(email, map));
  const owner = ownerVaultEmail();
  return handoffSeats(extras).filter((seat) => {
    if (seat.email === email) return false;
    if (user.role === "owner") return true;
    if (seat.email === owner) return true;
    return peopleLane(companyIdForEmail(seat.email, map)) === lane;
  });
}

export function findHandoffSeat(email: string, extras: HandoffSeat[] = []): HandoffSeat | undefined {
  const needle = personKey(email);
  if (!needle) return undefined;
  return handoffSeats(extras).find((seat) => personKey(seat.email) === needle || isSamePerson(seat.email, email));
}

export function isHandoffEmail(email: string, extras: HandoffSeat[] = []) {
  return Boolean(findHandoffSeat(email, extras));
}

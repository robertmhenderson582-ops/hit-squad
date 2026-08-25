import type { InboxMessage, InboxThread } from "./inbox";

export const DESK_VERSION = "1.1";
export const DESK_VERSION_LABEL = "Hit Squad Project Controls V1.1";
export const WHATS_NEW_MARK_PREFIX = "hs_whats_new:";
export const DESK_THREAD_ID = "th-desk-v1.1";
export const DESK_PERSON_ID = "desk";

export const TESTER_WHATS_NEW = [
  "Hit Squad Project Controls V1.1",
  "• Capture screen now grabs the desk (popup hides first)",
  "• Tickets stay after a republish",
  "• Crew cards and Job setup phases match the desk",
  "• Estimate type is T&M (Outage is the job, not the type)",
  "• Empty travel row hidden until there is a mileage rate",
].join("\n");

export const OWNER_WHATS_NEW = [
  "Hit Squad Project Controls V1.1",
  "• Capture screen now grabs the desk (popup hides first)",
  "• Tickets stay after a republish — file store + owner email copy, not a paid database",
  "• Owner and Novus see every ticket; testers see only their own",
  "• Joseph Submit still conceptually emails robertmhenderson582@gmail.com",
  "• Crew is five cards; phases live on Job setup",
  "• Estimate type is T&M / Lump sum / CR/FF / Hybrid — never Outage",
  "• Empty travel row hidden until a mileage rate exists",
  "• Inbox what’s-new is per seat. Tickets stay off Inbox.",
].join("\n");

const FORBIDDEN_TESTER =
  /\b(password|passwords|auth|authentication|cookie|session secret|security|novus|vault|drive|other users?|other testers?|seats?|owner tools?|deploy internals?|anyone else.?s tickets)\b/i;

export function whatsNewCopy(ownerChrome: boolean) {
  return ownerChrome ? OWNER_WHATS_NEW : TESTER_WHATS_NEW;
}

export function testerCopyIsSafe(text: string) {
  return !FORBIDDEN_TESTER.test(text);
}

export function seenKey(seat: string, version = DESK_VERSION) {
  return `${WHATS_NEW_MARK_PREFIX}${version}:${seat}`;
}

export function hasSeenWhatsNew(seat: string, version = DESK_VERSION) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(seenKey(seat, version)) === "1";
  } catch {
    return false;
  }
}

export function markWhatsNewSeen(seat: string, version = DESK_VERSION) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(seenKey(seat, version), "1");
}

function deskMessage(text: string): InboxMessage {
  return {
    id: `im-desk-${DESK_VERSION}`,
    from: "them",
    author: "Desk",
    text,
    photo: null,
    sentAt: new Date().toLocaleString("en-GB", { hour12: false }),
    readAt: null,
  };
}

export function deskWhatsNewThread(ownerChrome: boolean): InboxThread {
  return {
    id: DESK_THREAD_ID,
    personId: DESK_PERSON_ID,
    name: "Hit Squad",
    company: "Project Controls",
    unread: 1,
    messages: [deskMessage(whatsNewCopy(ownerChrome))],
  };
}

export function applyWhatsNew(
  threads: InboxThread[],
  seat: string,
  ownerChrome: boolean,
): InboxThread[] {
  if (!seat || hasSeenWhatsNew(seat)) return threads;
  markWhatsNewSeen(seat);
  if (threads.some((thread) => thread.id === DESK_THREAD_ID || thread.personId === DESK_PERSON_ID)) {
    return threads;
  }
  return [deskWhatsNewThread(ownerChrome), ...threads];
}

import { canReceiveDeskBot } from "./inbox-circle.ts";
import type { InboxMessage, InboxThread } from "./inbox.ts";

export const DESK_VERSION = "1.44.0";
export const DESK_VERSION_LABEL = "Hit Squad Project Controls V1.44";
export const WHATS_NEW_MARK_PREFIX = "hs_whats_new:";
export const DESK_THREAD_ID = "th-desk-v1.44";
export const DESK_PERSON_ID = "desk";

export const TESTER_WHATS_NEW = [
  "Hit Squad Project Controls V1.44",
  "• Rate builder looks like the labor rate sheet — craft, base wage, billed ST / OT / DT, and PD.",
  "• New Estimate tells you if the company has no rates. You can upload billing rates or build them in Rate builder.",
].join("\n");

export const OWNER_WHATS_NEW = [
  "Hit Squad Project Controls V1.44",
  "• Rate builder labor table matches the Yates-style sheet: craft/position, COMP BW, billed ST / OT / DT, and the Shahan PD fringe. Billed ST stays the crew-costing dollar. East Coast stays OT 1.5, not DT after 12.",
  "• Joseph Henderson can open Rate builder. Owner stays the only owner.",
  "• New Estimate tells a company with no saved rates they can upload billing rates or use Rate builder. Madison books already on the desk do not lock the owner out.",
].join("\n");

/** Same as the live V1.44 note. Kept so older imports still resolve. */
export const NEXT_SHIP_VERSION = DESK_VERSION;
export const NEXT_SHIP_VERSION_LABEL = DESK_VERSION_LABEL;
export const TESTER_NEXT_SHIP_DRAFT = TESTER_WHATS_NEW;
export const OWNER_NEXT_SHIP_DRAFT = OWNER_WHATS_NEW;

const FORBIDDEN_TESTER =
  /\b(password|passwords|auth|authentication|cookie|session(?: secret)?|security|novus|vault|drive|smtp|\/tmp|tmp file|other users?|other testers?|seats?|owner tools?|view as|aliases?|deploy(?: internals?)?|anyone else(?:.?s tickets)?)\b/i;

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
  email?: string,
): InboxThread[] {
  if (email !== undefined && !canReceiveDeskBot({ email })) return threads;
  if (!seat || hasSeenWhatsNew(seat)) return threads;
  markWhatsNewSeen(seat);
  const text = whatsNewCopy(ownerChrome);
  const messageId = `im-desk-${DESK_VERSION}`;
  const existing = threads.find((thread) => thread.personId === DESK_PERSON_ID);
  if (existing) {
    if (existing.messages.some((message) => message.id === messageId)) return threads;
    return threads.map((thread) =>
      thread.personId === DESK_PERSON_ID
        ? {
            ...thread,
            unread: thread.unread + 1,
            messages: [...thread.messages, deskMessage(text)],
          }
        : thread,
    );
  }
  return [deskWhatsNewThread(ownerChrome), ...threads];
}

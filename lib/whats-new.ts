import { canReceiveDeskBot } from "./inbox-circle.ts";
import type { InboxMessage, InboxThread } from "./inbox.ts";

export const DESK_VERSION = "1.40.0";
export const DESK_VERSION_LABEL = "Hit Squad Project Controls V1.40";
export const WHATS_NEW_MARK_PREFIX = "hs_whats_new:";
export const DESK_THREAD_ID = "th-desk-v1.40";
export const DESK_PERSON_ID = "desk";

export const TESTER_WHATS_NEW = [
  "Hit Squad Project Controls V1.40",
  "• Wage lookup now shows COMP/C-1 Base wage. Crew dollars still billed ST/OT/DT.",
].join("\n");

export const OWNER_WHATS_NEW = [
  "Hit Squad Project Controls V1.40",
  "• Wage lookup is a tab on the estimate. It shows COMP/C-1 Base wage, not billed rate.",
  "• Wood River and Bayway use East Coast Comp Amendment 11 PCA0001103. Rodeo and Ferndale use West Coast Comp Amendment 8 PCA0001100 samples until the unique TSV lands.",
  "• Monroe Energy uses CW35353 Exhibit C-1. Yates uses Rate builder Base Rate, not Comp.",
  "• Crew costing still uses billed ST / OT / DT. Billings is still No book yet.",
].join("\n");

/** Same as the live V1.40 note. Kept so older imports still resolve. */
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

import { canReceiveDeskBot } from "./inbox-circle.ts";
import type { InboxMessage, InboxThread } from "./inbox.ts";

export const DESK_VERSION = "1.31.0";
export const DESK_VERSION_LABEL = "Hit Squad Project Controls V1.31";
export const WHATS_NEW_MARK_PREFIX = "hs_whats_new:";
export const DESK_THREAD_ID = "th-desk-v1.31";
export const DESK_PERSON_ID = "desk";

export const TESTER_WHATS_NEW = [
  "Hit Squad Project Controls V1.31",
  "• Extra Crew date ranges can be labeled (hiring progression, training, onboarding, or your own words). Hours do not change. Extra dates stay inside the first stretch on that phase.",
  "• You can turn off a phase on one Crew position. Job setup stays on. Hours are saved; Restore brings them back.",
].join("\n");

export const OWNER_WHATS_NEW = [
  "Hit Squad Project Controls V1.31",
  "• Extra Crew date ranges have a Description field: Hiring progression, Training, Onboarding/Learning, or Other free text. Description does not change ST / OT / DT / PD / hours / cost. Extra Start/End clamp to the first range on that phase (intersection with Job setup phase dates when the card is bound).",
  "• Per-position phase Off preserves dates and hours (off flag). Job setup stays on. Restore returns the same ST / OT / DT / PD. Confirm when that phase has hours.",
].join("\n");

/** Same as the live V1.31 note. Kept so older imports still resolve. */
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

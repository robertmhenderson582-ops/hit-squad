import type { InboxMessage, InboxThread } from "./inbox";

export const DESK_VERSION = "1.16.0";
export const DESK_VERSION_LABEL = "Hit Squad Project Controls V1.16";
export const WHATS_NEW_MARK_PREFIX = "hs_whats_new:";
export const DESK_THREAD_ID = "th-desk-v1.16";
export const DESK_PERSON_ID = "desk";

export const TESTER_WHATS_NEW = [
  "Hit Squad Project Controls V1.16",
  "• Short update is live. Save your work, then hard-refresh.",
  "• Sign-in now sticks after you leave. If the desk asked you to create a sign-in again after you already did, create it one more time on this computer. After that, leaving and coming back will not send you to first-time.",
].join("\n");

export const OWNER_WHATS_NEW = [
  "Hit Squad Project Controls V1.16",
  "• Short update is live. Testers who already saw V1.15 get this note (versioned seen key).",
  "• Sign-in hashes lived in Vercel /tmp and vanished on cold start. A signed claim cookie now keeps that browser’s tester hash. Logout leaves the claim cookie; owner login is unchanged.",
  "• Wendell will create one more time on the live desk. After that, leave and return on the same computer will not send him to first-time.",
].join("\n");

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
): InboxThread[] {
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

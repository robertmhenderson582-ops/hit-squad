import type { InboxMessage, InboxThread } from "./inbox";

export const DESK_VERSION = "1.4.1";
export const DESK_VERSION_LABEL = "Hit Squad Project Controls V1.4";
export const WHATS_NEW_MARK_PREFIX = "hs_whats_new:";
export const DESK_THREAD_ID = "th-desk-v1.4";
export const DESK_PERSON_ID = "desk";

export const TESTER_WHATS_NEW = [
  "Hit Squad Project Controls V1.4",
  "• Click a card opens that estimate",
  "• Crew shows a phase card in each window",
  "• Add activity on Work Activities",
  "• Capture keeps the popup you had open",
  "• P66 start-job says Turnaround not Outage",
].join("\n");

export const OWNER_WHATS_NEW = [
  "Hit Squad Project Controls V1.4",
  "• Estimate cards on Home, the plant Estimates tab, and the Estimates list open the package — icon clicks stay on the icon",
  "• Crew is calendar-only: one craft row, five locked phase cards left to right. OFF phases keep their name and stay off",
  "• Dates, days/wk, and hrs/day inherit from Job setup Phases & work schedule — do not retype the window",
  "• Shift is per phase. Days & nights is dual count (Days/Nights headcount and Per-diem Headcount), not doubled",
  "• Work Activities: Add activity (Activity no., WBS, Unit, name, Resource, Phase). Activities do not bill. Hours sit next to crew hours",
  "• Capture keeps the open New estimate popup, other dialogs, and the ticket drawer so markup can land on them",
  "• P66 / refinery start-job size says Turnaround; powerhouse and shop keep Outage. Estimate type stays T&M / contract types",
].join("\n");

const FORBIDDEN_TESTER =
  /\b(password|passwords|auth|authentication|cookie|session secret|security|novus|vault|drive|smtp|\/tmp|tmp file|other users?|other testers?|seats?|owner tools?|deploy internals?|anyone else.?s tickets)\b/i;

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

import type { InboxMessage, InboxThread } from "./inbox";

export const DESK_VERSION = "1.3.1";
export const DESK_VERSION_LABEL = "Hit Squad Project Controls V1.3";
export const WHATS_NEW_MARK_PREFIX = "hs_whats_new:";
export const DESK_THREAD_ID = "th-desk-v1.3";
export const DESK_PERSON_ID = "desk";

export const TESTER_WHATS_NEW = [
  "Hit Squad Project Controls V1.3",
  "• Staffing tab is back after Crew on an estimate",
  "• It fills from this estimate’s Crew and Phases (Day / Night by date and craft)",
  "• Export P66 staffing plan downloads the client sheet",
  "• Phases & work schedule now sets the job (dates cascade, off slides, OT pickers)",
  "• Crew picks up those windows",
  "• Capture grabs the whole desk",
  "• Opening an estimate from a site no longer asks New/Potential client",
].join("\n");

export const OWNER_WHATS_NEW = [
  "Hit Squad Project Controls V1.3",
  "• Staffing is generated from this estimate’s crew + phase calendar — Nathan does not re-type the P66 sheet",
  "• Wood River / East Coast list (Nathan). Rodeo / Ferndale / West Coast list (John: ironworkers, operator groups)",
  "• Empty P66 crafts stay blank, not zero. Hide empty crafts unless Show full P66 template",
  "• Days & nights is dual count (headcount + night headcount), not doubled",
  "• Export contractor is MADISON INDUSTRIAL SVCS TEAM LLC (50413486); totals are SUM formulas",
  "• Phases & work schedule persists on the estimate and cascades: later ON phases start the day after the previous stop and keep their length",
  "• Turning a phase OFF locks its dates and slides later ON phases into the gap; Total days is worked days",
  "• Pre / Post OT pickers set days, hours, and the OT-after-8 split; OT after 8 is on staff and craft headers",
  "• Crew calendars inherit those windows, left to right by phase, with shift per phase",
  "• Capture grabs the whole visible desk, not one card",
  "• Existing-site estimates show Existing customer only — New / potential client is for a true new-client start",
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

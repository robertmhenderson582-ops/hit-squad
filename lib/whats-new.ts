import type { InboxMessage, InboxThread } from "./inbox";

export const DESK_VERSION = "1.14.0";
export const DESK_VERSION_LABEL = "Hit Squad Project Controls V1.14";
export const WHATS_NEW_MARK_PREFIX = "hs_whats_new:";
export const DESK_THREAD_ID = "th-desk-v1.14";
export const DESK_PERSON_ID = "desk";

export const TESTER_WHATS_NEW = [
  "Hit Squad Project Controls V1.14",
  "• Equipment: listed large tools plus typed third-party rental at cost + 6%",
  "• Other Cost is reimbursables, travel, and CAT 2 misc — Home Cost stays Cost/PPR",
  "• Empty Craft travel / Mileage Rate stays hidden until a mileage rate is entered",
  "• Change Order FCR packet is on the estimate: log, estimate, and SCR. Mileage Yes is $2,500",
  "• Staffing follows Crew calendars and Job setup phases",
  "• Multiple units is a larger Job setup control; default stays off",
  "• Crew Start and End calendars no longer overlap",
  "• Estimate total is a floating right-side breakdown; $0 lines stay hidden",
  "• Estimate desk uses instrument chrome (HUD), not paper cards",
  "• Crew starts empty — hours wait until you pick a position",
  "• Opening a job keeps its ID, window, and working figure on Wood River",
  "• Sites lists 4 Wood River jobs (3 open, 1 hold) and 3 estimates — HSE is a job, not an estimate",
  "• New estimate asks for the job / event, not a size. The name follows Turnaround or Outage. Overtime is a locked readout. Escape and × close it",
  "• Cost EST hours follow Crew calendars. Hours earned stays 0. Rate burdened figures are field-trial, not computed from the columns",
].join("\n");

export const OWNER_WHATS_NEW = [
  "Hit Squad Project Controls V1.14",
  "• Equipment, Other Cost, Change Order FCR, and Staffing are locked for the morning ship",
  "• Tester seats / View as stay as V1.13",
  "• Empty Craft travel / Mileage Rate hides until a mileage rate exists",
  "• Change Order Mileage Yes is a flat $2,500, never times headcount",
  "• Multiple units is a larger Job setup control; default off",
  "• Crew Start/End calendars stack so they do not overlap",
  "• Estimate total is the old right-side HUD rail; no header dollars; margin stays off it",
  "• Night estimate desk uses instrument chrome (HUD), not paper cards",
  "• Crew starts empty — hours wait until you pick a position",
  "• Opening a job keeps its ID, window, and working figure on Wood River",
  "• Sites lists 4 Wood River jobs (3 open, 1 hold) and 3 estimates — HSE is a job, not an estimate",
  "• New estimate asks for the job / event, not a size. The name follows Turnaround or Outage. Escape and × close it",
  "• Don’t lock on the owner seat is real. Testers still lock at 15 minutes",
  "• Cost EST hours follow Crew calendars. Hours earned stays 0. Rate burdened figures stay stored field-trial numbers",
].join("\n");

const FORBIDDEN_TESTER =
  /\b(password|passwords|auth|authentication|cookie|session secret|security|novus|vault|drive|smtp|\/tmp|tmp file|other users?|other testers?|seats?|owner tools?|view as|aliases?|deploy internals?|anyone else.?s tickets)\b/i;

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

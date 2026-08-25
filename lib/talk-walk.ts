export const TALK_WALK_VERSION = 3;
export const TALK_WALK_KEY = "hs_talk_walk";

export const TALK_STEPS = [
  {
    title: "Email is out",
    body: "Messages, tickets, and screenshots stay in Inbox and Tickets. Nothing is emailed from this desk.",
  },
  {
    title: "Inbox FAB",
    body: "Inbox sits above Ticket. New message, Enter to send, Shift+Enter for a newline. Double-check when it is read.",
  },
  {
    title: "Ticket beacon",
    body: "Ticket kinds are Broke / doesn’t make sense / missing / better way / other.",
  },
  {
    title: "Attach a screen",
    body: "Capture the screen with the note. Open dialogs, the New estimate popup, and the ticket stay on screen. Replay lives in Settings → How we talk.",
  },
] as const;

export type TalkWalkState = {
  version: number;
  skipped: boolean;
};

export function readTalkWalk(): TalkWalkState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TALK_WALK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TalkWalkState;
  } catch {
    return null;
  }
}

export function writeTalkWalk(next: TalkWalkState) {
  window.localStorage.setItem(TALK_WALK_KEY, JSON.stringify(next));
}

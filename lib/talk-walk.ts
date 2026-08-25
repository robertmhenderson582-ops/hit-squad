export const TALK_WALK_VERSION = 1;
export const TALK_WALK_KEY = "hs_talk_walk";

export const TALK_STEPS = [
  {
    title: "How we talk",
    body: "This desk is confidential. Do not share, copy, or discuss it outside the people Robert invited.",
  },
  {
    title: "The home",
    body: "Home stays four tiles: Jobs, Estimates, Cost, and HSE. New estimate is not a fifth tile.",
  },
  {
    title: "Short words",
    body: "This job · People · Daily count · Extra work · Letter to the client. Easy Mode stays off unless you turn it on in Settings → Copy.",
  },
  {
    title: "Ticket and Inbox",
    body: "Inbox sits above Ticket at the bottom-right. Tickets do not copy into Inbox.",
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

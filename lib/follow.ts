import type { FollowSeat, ViewAsSeat } from "./owner-desk.ts";

export type FollowApply = {
  followSeat: FollowSeat;
  viewAs: ViewAsSeat;
  path: string;
  watching: boolean;
};

export function followLandingPath(seat: FollowSeat, livePath = "") {
  if (seat === "owner") return "/settings/follow";
  const path = livePath.trim();
  if (!path || path.startsWith("/settings") || path.startsWith("/login")) return "/";
  if (path.startsWith("/estimates")) return path === "/estimates" || path.startsWith("/estimates/") ? path : "/estimates";
  if (path === "/" || path.startsWith("/jobs") || path.startsWith("/cost") || path.startsWith("/hse")) return path;
  return "/";
}

/** Follow is a click-toggle. Watching the same seat again stops. */
export function applyFollow(current: FollowSeat, clicked: FollowSeat, livePath = ""): FollowApply {
  const next = clicked === "owner" || clicked === current ? "owner" : clicked;
  return {
    followSeat: next,
    viewAs: next,
    path: followLandingPath(next, livePath),
    watching: next !== "owner",
  };
}

export function liveRowChrome(live: boolean) {
  return {
    rowClass: live ? "follow-live" : "follow-idle",
    dotClass: live ? "follow-dot follow-dot-live" : "follow-dot",
    tag: live ? "Live" : "",
    greenClass: live ? "follow-dot-live" : "",
  };
}

export function liveRowCaptureHtml(row: { name: string; live: boolean }) {
  const chrome = liveRowChrome(row.live);
  const tag = chrome.tag ? `<span class="live-tag">${chrome.tag}</span>` : "";
  return `<article class="${chrome.rowClass}"><span class="${chrome.dotClass}" aria-hidden="true"></span>${row.name}${tag}</article>`;
}

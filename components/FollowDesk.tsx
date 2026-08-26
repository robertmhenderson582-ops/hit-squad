"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { applyFollow, liveRowChrome } from "@/lib/follow";
import { NOVUS_EMAIL } from "@/lib/desk-role";
import { VISUAL_ROSTER, type FollowSeat } from "@/lib/owner-desk";

type LiveSeat = {
  email: string;
  name: string;
  path: string;
  lastAt: number;
  live: boolean;
};

function screenOf(path: string) {
  if (path === "/") return "Home";
  if (path.startsWith("/estimates")) return "Estimates";
  if (path.startsWith("/jobs")) return "Jobs";
  if (path.startsWith("/settings")) return "Settings";
  return path.replace(/^\//, "") || "Home";
}

function lastSeen(at: number) {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 2) return "just now";
  if (mins < 120) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
}

export function FollowDesk() {
  const desk = useOwnerDesk();
  const router = useRouter();
  const [seats, setSeats] = useState<LiveSeat[]>([]);

  useEffect(() => {
    function load() {
      fetch("/api/desk/presence", { credentials: "include", cache: "no-store" })
        .then((response) => response.json())
        .then((data) => setSeats(data.seats ?? []))
        .catch(() => undefined);
    }
    load();
    const id = window.setInterval(load, 8000);
    return () => window.clearInterval(id);
  }, []);

  if (!desk) return <p className="mt-4 text-[#5b6f73]">Owner desk only.</p>;

  const watching = desk.followSeat !== "owner";
  const subject = VISUAL_ROSTER.find((row) => row.id === desk.followSeat);

  const known = new Set(VISUAL_ROSTER.map((row) => row.email.toLowerCase()));
  const extras = seats.filter(
    (seat) => !known.has(seat.email.toLowerCase()) && seat.email.toLowerCase() !== NOVUS_EMAIL,
  );
  const people = [
    ...VISUAL_ROSTER.map((row) => {
      const ping = seats.find((seat) => seat.email.toLowerCase() === row.email.toLowerCase());
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        live: Boolean(ping?.live),
        path: ping?.path ?? "",
        lastAt: ping?.lastAt ?? 0,
        followable: true as const,
      };
    }),
    ...extras.map((seat) => ({
      id: seat.email,
      name: seat.name,
      email: seat.email,
      live: seat.live,
      path: seat.path,
      lastAt: seat.lastAt,
      followable: false as const,
    })),
  ].sort((a, b) => Number(b.live) - Number(a.live) || b.lastAt - a.lastAt);

  function watch(seat: FollowSeat, livePath = "") {
    const next = applyFollow(desk!.followSeat, seat, livePath);
    desk!.setFollowSeat(next.followSeat);
    router.push(next.path);
  }

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Follow</h2>
        <p className="mt-1 text-sm leading-6 text-[#163038]">
          Follow opens that seat’s desk — same lens as View as. Green dot and Live tag while they are
          on the desk. Grey and no pulse after about 90 seconds. Last seen stays a day after idle.
          You do not show in your own list. Password fields stay blank. Testers never see that they
          are watched. This is not remote-desktop capture.
        </p>
      </section>

      <section className="plant-card px-5 py-5">
        <div className="space-y-2">
          {people.map((row) => {
            const chrome = liveRowChrome(row.live);
            return (
              <article
                key={row.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${chrome.rowClass}`}
              >
                <div className="flex items-center gap-3">
                  <span className={chrome.dotClass} aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-[#163038]">
                      {row.name}
                      {chrome.tag ? <span className="live-tag">{chrome.tag}</span> : null}
                    </p>
                    <p className="text-xs text-[#5b6f73]">
                      {row.live
                        ? screenOf(row.path)
                        : row.lastAt
                          ? `Last seen ${lastSeen(row.lastAt)}`
                          : "Idle"}
                    </p>
                    <input type="password" readOnly value="" autoComplete="off" placeholder="Password" className="follow-pw mt-2" />
                  </div>
                </div>
                {row.followable ? (
                  <button
                    type="button"
                    onClick={() => watch(row.id as FollowSeat, row.path)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      desk.followSeat === row.id ? "bg-steel text-white" : "border border-steel text-steel"
                    }`}
                  >
                    {desk.followSeat === row.id ? "Watching" : "Follow"}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => watch("owner")}
            className={`rounded-lg px-4 py-2 text-sm ${
              desk.followSeat === "owner" ? "bg-steel text-white" : "border border-steel text-steel"
            }`}
          >
            Stop following
          </button>
        </div>
        <p className="mt-3 text-sm text-[#5b6f73]">
          {watching
            ? `Watching ${subject?.name ?? desk.followSeat}. Password fields stay blank. ${
                desk.followSeat === "nathan" ||
                desk.followSeat === "john" ||
                desk.followSeat === "wendell" ||
                desk.followSeat === "benny" ||
                desk.followSeat === "chance"
                  ? "Real client and plant names."
                  : "Whole-catalog aliases stay on."
              }`
            : desk.aliasesOn
              ? "Owner tester view — Ironwood / Midwest names. Follow an aliased seat to check that lens."
              : "Owner view — real names. Turn aliases on to preview tester view."}
        </p>
      </section>
    </div>
  );
}

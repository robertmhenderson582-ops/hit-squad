"use client";

import { useEffect, useState } from "react";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { NOVUS_EMAIL } from "@/lib/desk-role";
import { peopleByLane, personFromLensId } from "@/lib/desk-people";
import { canFollowSeatId, followSeatFromEmail } from "@/lib/follow";
import { type FollowSeat } from "@/lib/owner-desk";

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
  if (path.startsWith("/jobs") || path.startsWith("/sites")) return "Jobs";
  if (path.startsWith("/standalone")) return "Standalone";
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

  if (!desk) return <p className="mt-4 text-[#5b6f73]">Owner and Operator desk only.</p>;

  const catalog = desk.people;
  const watching = desk.followSeat !== "owner";
  const subject = personFromLensId(desk.followSeat, catalog);
  const applyFollow = desk.setFollowSeat;
  function startFollow(id: FollowSeat, path: string) {
    if (!canFollowSeatId(id)) return;
    applyFollow(id, path);
  }

  const known = new Set(catalog.map((row) => row.email.toLowerCase()));
  const extras = seats.filter(
    (seat) => !known.has(seat.email.toLowerCase()) && seat.email.toLowerCase() !== NOVUS_EMAIL,
  );
  const people = [
    ...catalog.map((row) => {
      const ping = seats.find((seat) => seat.email.toLowerCase() === row.email.toLowerCase());
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        companyId: row.companyId,
        live: Boolean(ping?.live),
        path: ping?.path ?? "",
        lastAt: ping?.lastAt ?? 0,
        followable: canFollowSeatId(row.id),
      };
    }),
    ...extras.map((seat) => {
      const id = followSeatFromEmail(seat.email, catalog) || seat.email;
      return {
        id,
        name: seat.name,
        email: seat.email,
        live: seat.live,
        path: seat.path,
        lastAt: seat.lastAt,
        followable: canFollowSeatId(id),
      };
    }),
  ].sort((a, b) => Number(b.live) - Number(a.live) || b.lastAt - a.lastAt);

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Follow</h2>
        <p className="mt-1 text-sm leading-6 text-[#163038]">
          Follow opens that person&apos;s desk — the same view they see — not a remote desktop and
          not a fake plant wall. Live people jump to the top. Green pulse and Live tag while they
          are on the desk. Grey and no pulse after about 90 seconds. Last seen stays a day after
          idle. You do not show in your own list. Password fields stay blank. Testers never see this
          list or that they are watched.
        </p>
      </section>

      <section className="plant-card px-5 py-5">
        <div className="space-y-5">
          {(["company", "standalone"] as const).map((lane) => {
            const rows = peopleByLane(people)[lane];
            if (!rows.length) return null;
            return (
              <div key={lane} className="space-y-2">
                <p className="font-mono text-[10px] tracking-[0.2em] text-steel">
                  {lane === "company" ? "COMPANY" : "STANDALONE"}
                </p>
                {rows.map((row) => (
            <article
              key={row.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${
                row.live ? "follow-live" : "follow-idle"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`follow-dot ${row.live ? "follow-dot-live" : ""}`} aria-hidden="true" />
                <div>
                  <p className="font-semibold text-[#163038]">
                    {row.name}
                    {row.live ? <span className="live-tag">Live</span> : null}
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
                  onClick={() => startFollow(row.id as FollowSeat, row.path)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    desk.followSeat === row.id ? "bg-steel text-white" : "border border-steel text-steel"
                  }`}
                >
                  {desk.followSeat === row.id ? "Watching" : "Follow"}
                </button>
              ) : null}
            </article>
                ))}
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => desk.setFollowSeat("owner")}
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

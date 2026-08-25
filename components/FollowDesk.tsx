"use client";

import { useEffect, useState } from "react";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { VISUAL_ROSTER, type FollowSeat } from "@/lib/owner-desk";

const PREVIEW = [
  { family: "Georgia Power", name: "Yates", city: "Newnan, GA" },
  { family: "Phillips 66", name: "Wood River", city: "Roxana, IL" },
  { family: "Phillips 66", name: "Rodeo", city: "Rodeo, CA" },
  { family: "Phillips 66", name: "Bayway", city: "Linden, NJ" },
  { family: "Phillips 66", name: "Ferndale", city: "Ferndale, WA" },
  { family: "Phillips 66", name: "Billings", city: "Billings, MT" },
  { family: "Monroe Energy", name: "Trainer", city: "Trainer, PA" },
  { family: "Chevron", name: "Richmond", city: "Richmond, CA" },
  { family: "Kinder Morgan", name: "Wood River terminal", city: "Roxana, IL" },
];

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
  const alias = useAlias();
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
  const extras = seats.filter((seat) => !known.has(seat.email.toLowerCase()));
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

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Follow</h2>
        <p className="mt-1 text-sm leading-6 text-[#163038]">
          Live people jump to the top. Green pulse and Live tag while they are on the desk. Grey and
          no pulse after about 90 seconds. Last seen stays a day after idle. You do not show in your
          own list. Password fields stay blank. Testers never see that they are watched. This is not
          remote-desktop capture — list chrome only.
        </p>
      </section>

      <section className="plant-card px-5 py-5">
        <div className="space-y-2">
          {people.map((row) => (
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
                  onClick={() => desk.setFollowSeat(row.id as FollowSeat)}
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
                desk.followSeat === "nathan"
                  ? "Madison seat — real client and plant names."
                  : "Field seat — whole-catalog aliases stay on. Benny never sees real client names."
              }`
            : desk.aliasesOn
              ? "Owner tester view — Ironwood / Midwest names. Follow Benny to check his lens."
              : "Owner view — real names. Turn aliases on to preview tester view."}
        </p>
      </section>

      <section className="follow-screen px-5 py-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">
          {watching ? `${(subject?.name ?? "TESTER").toUpperCase()}’S SCREEN` : "OWNER SCREEN"}
        </p>
        <h3 className="mt-2 font-display text-3xl text-[#163038]">{alias("Madison")}</h3>
        <label className="mt-4 block text-sm text-[#5b6f73]">
          Password
          <input type="password" readOnly value="" autoComplete="off" className="paper-field mt-1" />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PREVIEW.map((plant) => (
            <article key={plant.name} className="plant-card px-4 py-4">
              <p className="text-xs tracking-[0.16em] text-[#5b6f73]">{alias(plant.family).toUpperCase()}</p>
              <p className="mt-1 text-xl font-semibold text-[#163038]">{alias(plant.name)}</p>
              <p className="text-sm text-[#5b6f73]">{alias(plant.city)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

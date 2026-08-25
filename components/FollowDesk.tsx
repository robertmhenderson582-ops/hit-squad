"use client";

import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { VISUAL_ROSTER, type FollowSeat } from "@/lib/owner-desk";

const PREVIEW = [
  { family: "Georgia Power", name: "Yates", city: "Newnan, GA" },
  { family: "Phillips 66", name: "Wood River", city: "Roxana, IL" },
  { family: "Phillips 66", name: "Rodeo", city: "Rodeo, CA" },
  { family: "Phillips 66", name: "Bayway", city: "Linden, NJ" },
  { family: "Phillips 66", name: "Ferndale", city: "Ferndale, WA" },
  { family: "Phillips 66", name: "Billings", city: "Billings, MT" },
];

export function FollowDesk() {
  const desk = useOwnerDesk();
  const alias = useAlias();
  if (!desk) return <p className="mt-4 text-[#5b6f73]">Owner desk only.</p>;

  const watching = desk.followSeat !== "owner";
  const subject = VISUAL_ROSTER.find((row) => row.id === desk.followSeat);

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Follow</h2>
        <p className="mt-1 text-sm leading-6 text-[#163038]">
          Watch a tester’s screen. Password fields stay blank on Follow. Sign-in, Users, Follow, and
          Activity stay yours. Joseph cannot use Follow. This is not View as.
        </p>
      </section>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => desk.setFollowSeat("owner")}
            className={`rounded-lg px-4 py-2 text-sm ${
              desk.followSeat === "owner" ? "bg-steel text-white" : "border border-steel text-steel"
            }`}
          >
            Stop following
          </button>
          {VISUAL_ROSTER.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => desk.setFollowSeat(row.id as FollowSeat)}
              className={`rounded-lg px-4 py-2 text-sm ${
                desk.followSeat === row.id ? "bg-steel text-white" : "border border-steel text-steel"
              }`}
            >
              {row.name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-[#5b6f73]">
          {watching
            ? `Watching ${subject?.name ?? desk.followSeat}. ${
                desk.followSeat === "nathan"
                  ? "Madison seat — real Phillips 66 / Georgia Power names."
                  : desk.aliasesOn
                    ? "Field seat — catalog aliases are on."
                    : "Field seat — aliases are off, so real names show."
              }`
            : "Owner view — real client names. Pick Benny to verify the alias lens."}
        </p>
      </section>

      <section className="follow-screen px-5 py-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">
          {watching ? `${(subject?.name ?? "TESTER").toUpperCase()}’S SCREEN` : "OWNER SCREEN"}
        </p>
        <h3 className="mt-2 font-display text-3xl text-[#163038]">{alias("Madison")}</h3>
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

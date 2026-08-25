"use client";

import { useEffect, useState } from "react";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { hasBuildDesk } from "@/lib/desk-role";

type Seat = { name: string; path: string; lastAt: number; live: boolean };

function screenOf(path: string) {
  if (path === "/") return "Home";
  if (path.startsWith("/estimates")) return "Estimates";
  if (path.startsWith("/jobs")) return "Jobs";
  if (path.startsWith("/settings")) return "Settings";
  return path.replace(/^\//, "") || "Home";
}

export function PresencePulse() {
  const { user } = useSession();
  const desk = useOwnerDesk();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [index, setIndex] = useState(0);
  const hidden = Boolean(desk?.viewAs && desk.viewAs !== "owner");

  useEffect(() => {
    if (!hasBuildDesk(user) || hidden) return;
    function load() {
      fetch("/api/desk/presence", { credentials: "include", cache: "no-store" })
        .then((response) => response.json())
        .then((data) => setSeats(data.seats ?? []))
        .catch(() => undefined);
    }
    load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, [hidden, user]);

  useEffect(() => {
    if (seats.length < 2) return;
    const id = window.setInterval(() => setIndex((n) => n + 1), 20_000);
    return () => window.clearInterval(id);
  }, [seats.length]);

  if (!hasBuildDesk(user) || hidden) return null;
  const row = seats[index % Math.max(seats.length, 1)];
  if (!row) return null;

  return (
    <p className="presence-pulse">
      <span className={`follow-dot ${row.live ? "follow-dot-live" : ""}`} aria-hidden="true" />
      {row.name}
      <span className="mx-2 text-[#5b6f73]">·</span>
      {row.live ? screenOf(row.path) : `Last seen ${new Date(row.lastAt).toLocaleTimeString()}`}
    </p>
  );
}

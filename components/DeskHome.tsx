"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeskBoard } from "@/lib/types";

const TILES = [
  { href: "/jobs", key: "jobs", label: "Jobs", note: "Open outage board" },
  { href: "/estimates", key: "estimates", label: "Estimates", note: "Working figures" },
  { href: "/cost", key: "cost", label: "Cost", note: "T&M tickets" },
  { href: "/hse", key: "hse", label: "HSE", note: "Permits & actions" },
] as const;

export function DeskHome() {
  const [desk, setDesk] = useState<DeskBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/desk/jobs", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Desk records could not be loaded.");
        return;
      }
      setDesk(data.desk as DeskBoard);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = {
    jobs: desk?.jobs.filter((job) => job.status === "OPEN").length ?? "—",
    estimates: desk?.estimatesOpen ?? "—",
    cost: desk?.costTickets ?? "—",
    hse: desk?.hseOpen ?? "—",
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="desk-grid">
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="steel-plate paper-grain block px-4 py-5 hover:border-steel-glow"
          >
            <p className="font-mono text-[10px] tracking-[0.28em] text-steel-glow">{tile.note.toUpperCase()}</p>
            <p className="mt-2 font-display text-3xl tracking-[0.16em] text-paper-cream">{tile.label.toUpperCase()}</p>
            <p className="mt-3 font-mono text-2xl text-amber-label">{counts[tile.key]}</p>
          </Link>
        ))}
      </div>

      <section className="steel-plate paper-grain overflow-hidden">
        <div className="border-b border-steel-rim/30 px-4 py-3 font-mono text-[11px] tracking-[0.22em] text-steel-glow">
          OPEN JOBS — THIS DESK ONLY
        </div>
        {error ? <p className="px-4 py-4 text-amber-label">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="font-mono text-[10px] tracking-[0.18em] text-paper-cream/60">
              <tr>
                <th className="px-4 py-3">CODE</th>
                <th className="px-4 py-3">JOB</th>
                <th className="px-4 py-3">CLIENT</th>
                <th className="px-4 py-3">WINDOW</th>
                <th className="px-4 py-3">FIGURE</th>
                <th className="px-4 py-3">HSE</th>
              </tr>
            </thead>
            <tbody>
              {(desk?.jobs ?? []).map((job) => (
                <tr key={job.id} className="border-t border-steel-rim/20">
                  <td className="px-4 py-3 font-mono text-amber-label">{job.code}</td>
                  <td className="px-4 py-3">{job.title}</td>
                  <td className="px-4 py-3">{job.client}</td>
                  <td className="px-4 py-3 font-mono text-xs">{job.window}</td>
                  <td className="px-4 py-3 font-mono text-xs">{job.workingFigure}</td>
                  <td className="px-4 py-3 font-mono text-xs text-steel-glow">{job.hseNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useLensUser } from "@/components/OwnerDeskContext";
import { canOpenRates } from "@/lib/desk-role";
import { jobScopedTiles } from "@/lib/desk-home";

export function JobScopedTools() {
  const lens = useLensUser();
  const tiles = jobScopedTiles(canOpenRates(lens));

  return (
    <nav className="job-scoped-tools" aria-label="Job tools">
      {tiles.map((tile) => (
        <Link key={tile.key} href={tile.href} className="job-action" title={tile.note}>
          {tile.label}
        </Link>
      ))}
    </nav>
  );
}

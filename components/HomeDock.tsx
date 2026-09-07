"use client";

import Link from "next/link";
import { useLensUser } from "@/components/OwnerDeskContext";
import { canOpenRates } from "@/lib/desk-role";
import { homeDockTiles } from "@/lib/desk-home";

export function HomeDock() {
  const lens = useLensUser();
  const tiles = homeDockTiles(canOpenRates(lens));

  return (
    <nav className="home-dock" aria-label="Desk modules">
      <div className="home-dock-row">
        {tiles.map((tile) => (
          <Link key={tile.key} href={tile.href} className="home-dock-tile">
            <span className="home-dock-label">{tile.label}</span>
            <span className="home-dock-note">{tile.note}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { homeDockTiles } from "@/lib/desk-home";

export function HomeDock() {
  const tiles = homeDockTiles();

  return (
    <nav className="home-dock" aria-label="Desk modules">
      <div className="home-dock-row">
        {tiles.map((tile) => (
          <Link key={tile.key} href={tile.href} className="home-dock-tile" title={tile.note} aria-label={`${tile.label}. ${tile.note}`}>
            <span className="home-dock-label">{tile.label}</span>
            <span className="home-dock-note">{tile.note}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

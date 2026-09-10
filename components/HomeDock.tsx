"use client";

import Link from "next/link";
import { useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { RATE_VAULT_DOOR, homeDockTilesForViewer } from "@/lib/desk-home";

export function HomeDock() {
  const { user } = useSession();
  const lens = useLensUser();
  const visible = homeDockTilesForViewer(user, lens);
  const tiles = visible.filter((tile) => tile.key !== RATE_VAULT_DOOR.key);
  const ownerTiles = visible.filter((tile) => tile.key === RATE_VAULT_DOOR.key);

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
      {ownerTiles.length ? (
        <div className="home-dock-owner-row" role="radiogroup" aria-label="Owner workshop">
          {ownerTiles.map((tile) => (
            <Link
              key={tile.key}
              href={tile.href}
              className="home-dock-tile"
              title={tile.note}
              role="radio"
              aria-checked="false"
              aria-label={`${tile.label}. ${tile.note}`}
            >
              <span className="home-dock-label">{tile.label}</span>
              <span className="home-dock-note">{tile.note}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}

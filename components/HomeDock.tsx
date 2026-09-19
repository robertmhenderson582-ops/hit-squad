"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import type { Company } from "@/lib/companies";
import { RATE_VAULT_DOOR, homeDockTilesForViewer } from "@/lib/desk-home";
import { viewAsInit } from "@/lib/desk-scope";

export function HomeDock() {
  const { user } = useSession();
  const lens = useLensUser();
  const desk = useOwnerDesk();
  const [company, setCompany] = useState<Company | null>(null);
  const visible = homeDockTilesForViewer(user, lens, true, company);
  const tiles = visible.filter((tile) => tile.key !== RATE_VAULT_DOOR.key);
  const ownerTiles = visible.filter((tile) => tile.key === RATE_VAULT_DOOR.key);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/desk/companies", viewAsInit(desk?.viewAs))
      .then((response) => response.json())
      .then((data: { company?: Company | null; companies?: Company[]; companyId?: string }) => {
        if (cancelled) return;
        const listed = Array.isArray(data.companies) ? data.companies : [];
        const row =
          data.company ||
          listed.find((item) => item.id === data.companyId) ||
          null;
        setCompany(row);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [desk?.viewAs, lens?.email]);

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

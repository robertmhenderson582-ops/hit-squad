"use client";

import { useEffect, useState } from "react";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { hseDropLeaks, hseVaultStored, type HseVaultTreeRow } from "@/lib/hse-vault-shared";
import { filterVaultTreeForViewer, vaultListViewerForSeat } from "@/lib/vault-list-filter";

export function HseVaultOwnerTree({ refresh = 0 }: { refresh?: number }) {
  const { user } = useSession();
  const owner = useOwnerDesk();
  const viewer = vaultListViewerForSeat(user, owner?.viewAs);
  const [rows, setRows] = useState<HseVaultTreeRow[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/desk/briefs?kind=hse&tree=1", { credentials: "include" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          tree?: HseVaultTreeRow[];
          store?: string;
          stored?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !hseVaultStored(data.store, data.stored) || !Array.isArray(data.tree) || hseDropLeaks(data)) {
          setRows([]);
          setNote(typeof data.error === "string" ? data.error : null);
          return;
        }
        setRows(
          filterVaultTreeForViewer(
            data.tree.filter((row) => Array.isArray(row.path) && Array.isArray(row.files)),
            viewer,
          ),
        );
        setNote(null);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, viewer]);

  return (
    <section className="plant-card px-4 py-4">
      <h2 className="font-display text-xl">HSE vault</h2>
      <p className="mt-2 text-sm">
        HSE room listing (names only). Job picker uses Madison jobs, not email dumps. Testers never see this tree. Owner can inspect site JSON here.
      </p>
      {rows.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.path.join(" / ") || "hse"}>
              <p className="font-semibold">{row.path.join(" / ")}</p>
              <p className="text-[#5b6f73]">{row.files.join(" · ") || "Empty folder"}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#5b6f73]">{note || "No vaulted HSE files yet."}</p>
      )}
    </section>
  );
}

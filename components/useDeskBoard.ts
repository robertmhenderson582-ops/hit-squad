"use client";

import { useEffect, useState } from "react";
import { useDeskLens } from "@/components/OwnerDeskContext";
import { localPacksForUser } from "@/lib/estimate-scope";
import { deskFetch, flushLocalPacksToVault, hydrateFromVault } from "@/lib/estimate-vault-client";
import { listLocalPacks, mergeLocalBoard } from "@/lib/local-estimates";
import type { ForgebookBoard } from "@/lib/types";

export function useDeskBoard() {
  const { lens, seat, viewingAs, lensReady, lensKey } = useDeskLens();
  const [board, setBoard] = useState<ForgebookBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lensReady || !lens) return;
    let cancelled = false;
    (async () => {
      await hydrateFromVault(undefined, { viewAs: seat });
      await flushLocalPacksToVault();
      const response = await deskFetch("/api/desk/board");
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Desk records stayed on this board.");
        return;
      }
      const packs = localPacksForUser(lens, listLocalPacks()).filter((pack) => !viewingAs || !pack.archived);
      setBoard(mergeLocalBoard(data.board as ForgebookBoard, packs));
    })();
    return () => {
      cancelled = true;
    };
  }, [lensKey, lensReady, seat, viewingAs]);

  return { board, error };
}

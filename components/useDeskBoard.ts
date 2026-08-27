"use client";

import { useEffect, useRef, useState } from "react";
import { useDeskLens } from "@/components/OwnerDeskContext";
import { ensureCbiDummyPack, shouldSeedCbiDummy } from "@/lib/cbi-dummy";
import { companyScopeFor, type CompanyId } from "@/lib/companies";
import { viewAsInit } from "@/lib/desk-scope";
import { visibleDeskPacks } from "@/lib/estimate-scope";
import { deskFetch, flushLocalPacksToVault, hydrateFromVault } from "@/lib/estimate-vault-client";
import { mergeLocalBoard } from "@/lib/local-estimates";
import type { ForgebookBoard } from "@/lib/types";

export function useDeskBoard() {
  const { lens, seat, viewingAs, lensReady, lensKey } = useDeskLens();
  const [board, setBoard] = useState<ForgebookBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<CompanyId | undefined>();
  const lensRef = useRef(lens);
  lensRef.current = lens;

  useEffect(() => {
    if (!lensReady) return;
    let cancelled = false;
    (async () => {
      const current = lensRef.current;
      if (!current) return;
      await hydrateFromVault(undefined, { viewAs: seat });
      if (cancelled) return;
      await flushLocalPacksToVault(undefined, { viewAs: seat });
      if (cancelled) return;
      const response = await deskFetch("/api/desk/board", viewAsInit(seat));
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Desk records stayed on this board.");
        return;
      }
      const nextCompany = typeof data.companyId === "string" ? data.companyId : undefined;
      if (nextCompany) setCompanyId(nextCompany as CompanyId);
      const scope = companyScopeFor(current, nextCompany as CompanyId | undefined);
      if (shouldSeedCbiDummy(scope)) ensureCbiDummyPack();
      const packs = visibleDeskPacks(current, viewingAs, undefined, scope);
      setBoard(mergeLocalBoard(data.board as ForgebookBoard, packs));
    })();
    return () => {
      cancelled = true;
    };
  }, [lensKey, lensReady, seat, viewingAs]);

  return { board, error, companyId };
}

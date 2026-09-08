"use client";

import { useEffect, useState } from "react";
import { useDeskBoard } from "@/components/useDeskBoard";
import { useDeskLens } from "@/components/OwnerDeskContext";
import { companyScopeFor } from "@/lib/companies";
import { catalogSites } from "@/lib/desk-data";
import { viewAsInit } from "@/lib/desk-scope";
import { deskFetch } from "@/lib/estimate-vault-client";
import { catalogSeedsAllowedOnDesk, omitCatalogSeedJobs, omitCatalogSeedPacks } from "@/lib/jobs";
import { menuForViewedDesk } from "@/lib/job-menu";
import { packsForViewedDesk } from "@/lib/lens-packs";
import { qualityHseJobTree } from "@/lib/quality-hse-scope";
import type { JobRecord } from "@/lib/types";

export function useQualityHseJobTree() {
  const { lens, seat, viewingAs, lensReady, lensKey } = useDeskLens();
  const { board, companyId } = useDeskBoard();
  const [serverJobs, setServerJobs] = useState<JobRecord[]>([]);

  useEffect(() => {
    if (!lensReady) return;
    let cancelled = false;
    (async () => {
      const response = await deskFetch("/api/desk/jobs", viewAsInit(seat));
      const data = (await response.json().catch(() => ({}))) as { desk?: { jobs?: JobRecord[] }; companyId?: string };
      if (cancelled || !response.ok) return;
      const incoming = data.desk?.jobs ?? [];
      const nextScope = companyScopeFor(lens, typeof data.companyId === "string" ? data.companyId : companyId);
      setServerJobs(catalogSeedsAllowedOnDesk(nextScope, seat) ? incoming : omitCatalogSeedJobs(incoming));
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, lens, lensKey, lensReady, seat, viewingAs]);

  const scope = companyScopeFor(lens, companyId);
  const packs = omitCatalogSeedPacks(packsForViewedDesk(lens, viewingAs, seat));
  const tree = qualityHseJobTree({
    scope,
    serverJobs,
    packs,
    sites: board?.sites?.length ? board.sites : catalogSites(),
    viewingAs,
    seat,
    menu: menuForViewedDesk(viewingAs, undefined, seat),
  });

  return { tree, ready: Boolean(lensReady && board) };
}

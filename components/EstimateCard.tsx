"use client";

import Link from "next/link";
import { JobHandoffMark } from "@/components/JobHandoffMark";
import { JobMenuActions } from "@/components/JobMenuActions";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { findLocalPack } from "@/lib/local-estimates";
import { StatusStamp } from "@/components/StatusStamp";
import { estimateHref } from "@/lib/estimate-open";
import type { EstimateRecord } from "@/lib/types";

export function EstimateCard({
  estimate,
  action,
  archived = false,
  onMenuChange,
}: {
  estimate: EstimateRecord;
  action?: React.ReactNode;
  archived?: boolean;
  onMenuChange?: () => void;
}) {
  const alias = useAlias();
  const { lens } = useDeskLens();
  const pack = findLocalPack(estimate.id);

  return (
    <article className="estimate-card plant-card relative z-[1] px-5 py-5" data-estimate-id={estimate.id}>
      <Link href={estimateHref(estimate.id)} className="block cursor-pointer" title={`Open ${estimate.code}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-mono text-xs text-steel">{estimate.code}</p>
          <div className="flex items-center gap-2">
            <StatusStamp value={archived ? "ARCHIVED" : estimate.status} />
            {action ? <span onClick={(event) => event.preventDefault()}>{action}</span> : null}
          </div>
        </div>
        <h3 className="mt-2 font-display text-2xl font-semibold text-[#163038]">{estimate.title}</h3>
        <JobHandoffMark pack={pack} email={lens?.email} />
        <p className="mt-1 text-sm text-[#5b6f73]">
          {alias(estimate.client)} · {alias(estimate.unit)} · {estimate.type}
        </p>
        <p className="mt-3 font-mono text-xs text-[#5b6f73]">
          {estimate.window} · {estimate.total} · Rev {estimate.revision}
        </p>
      </Link>
      <div className="mt-4">
        <JobMenuActions
          id={estimate.id}
          title={estimate.title}
          packId={estimate.id}
          archived={archived}
          onChange={onMenuChange}
        />
      </div>
    </article>
  );
}

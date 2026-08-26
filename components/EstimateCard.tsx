"use client";

import Link from "next/link";
import { useAlias } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { estimateHref } from "@/lib/estimate-open";
import type { EstimateRecord } from "@/lib/types";

export function EstimateCard({
  estimate,
  action,
}: {
  estimate: EstimateRecord;
  action?: React.ReactNode;
}) {
  const alias = useAlias();

  return (
    <Link
      href={estimateHref(estimate.id)}
      className="estimate-card plant-card relative z-[1] block cursor-pointer px-5 py-5"
      data-estimate-id={estimate.id}
      title={`Open ${estimate.code}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-mono text-xs text-steel">{estimate.code}</p>
        <div className="flex items-center gap-2">
          <StatusStamp value={estimate.status} />
          {action ? <span onClick={(event) => event.preventDefault()}>{action}</span> : null}
        </div>
      </div>
      <h3 className="mt-2 font-display text-2xl font-semibold text-[#163038]">{estimate.title}</h3>
      <p className="mt-1 text-sm text-[#5b6f73]">
        {alias(estimate.client)} · {alias(estimate.unit)} · {estimate.type}
      </p>
      <p className="mt-3 font-mono text-xs text-[#5b6f73]">
        {estimate.window} · {estimate.total} · Rev {estimate.revision}
      </p>
    </Link>
  );
}

"use client";

import { useState } from "react";
import type { ControlCenterBrand as Brand } from "@/lib/onboard-brand";

export function ControlCenterBrandMark({
  brand,
  className = "",
}: {
  brand: Brand;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? brand.logo : null;

  if (src) {
    return (
      <h1 className={`control-center-brand ${className}`.trim()}>
        {/* Live catalog / public tenant mark — not next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${brand.name} logo`}
          className="control-center-brand-logo"
          onError={() => setFailed(true)}
        />
      </h1>
    );
  }

  return (
    <h1 className={`control-center-brand-fallback mt-1 font-display text-3xl tracking-[0.12em] ${className}`.trim()}>
      {brand.fallbackLabel}
    </h1>
  );
}

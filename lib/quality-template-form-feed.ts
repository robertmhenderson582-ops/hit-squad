import type { QualityTemplateFillDest } from "./quality-template-form.ts";
import {
  QUALITY_TEMPLATE_FILL_RIPPLE_SURFACES,
  QUALITY_TEMPLATE_FILL_RIPPLE_NEVER,
} from "./quality-template-form-ripple.ts";

/**
 * Standing feed-in / feed-out bar (Robert 2026-09-12).
 * Every always-displayed Quality form — and every new Hit Squad idea — must
 * design both directions. One-way-only is a fail.
 */
export const QUALITY_TEMPLATE_FEED_RULE =
  "Always-displayed Quality forms feed in (open → fill → save to job/prepackage) and feed out (list → retrieve → re-open → edit → re-save → download). One-way-only is a fail.";

export const QUALITY_TEMPLATE_FEED_IN = ["open-blank", "fill", "save-job", "save-prepackage"] as const;
export const QUALITY_TEMPLATE_FEED_OUT = [
  "list-job-folder",
  "list-job-package",
  "list-prepackage-shelf",
  "list-vault-tree",
  "retrieve",
  "reopen",
  "edit-resave",
  "download",
  "parse-download",
] as const;

export type QualityTemplateFeedIn = (typeof QUALITY_TEMPLATE_FEED_IN)[number];
export type QualityTemplateFeedOut = (typeof QUALITY_TEMPLATE_FEED_OUT)[number];

export function qualityTemplateFeedSurfaces(dest: QualityTemplateFillDest) {
  if (dest === "prepackage") {
    return {
      in: ["open-blank", "fill", "save-prepackage"] as QualityTemplateFeedIn[],
      out: [
        "list-prepackage-shelf",
        "list-vault-tree",
        "retrieve",
        "reopen",
        "edit-resave",
        "download",
        "parse-download",
      ] as QualityTemplateFeedOut[],
      list: ["prepackage-shelf", "vault-tree", "briefs-index"] as const,
      never: QUALITY_TEMPLATE_FILL_RIPPLE_NEVER,
    };
  }
  return {
    in: ["open-blank", "fill", "save-job"] as QualityTemplateFeedIn[],
    out: [
      "list-job-folder",
      "list-job-package",
      "list-vault-tree",
      "retrieve",
      "reopen",
      "edit-resave",
      "download",
      "parse-download",
    ] as QualityTemplateFeedOut[],
    list: ["job-folder", "job-package", "vault-tree", "briefs-index"] as const,
    never: QUALITY_TEMPLATE_FILL_RIPPLE_NEVER,
  };
}

export function qualityTemplateFeedComplete(hits: {
  in: readonly QualityTemplateFeedIn[];
  out: readonly QualityTemplateFeedOut[];
  dest: QualityTemplateFillDest;
}) {
  const need = qualityTemplateFeedSurfaces(hits.dest);
  const missingIn = need.in.filter((step) => !hits.in.includes(step));
  const missingOut = need.out.filter((step) => !hits.out.includes(step));
  return {
    ok: missingIn.length === 0 && missingOut.length === 0,
    missingIn,
    missingOut,
    surfaces: QUALITY_TEMPLATE_FILL_RIPPLE_SURFACES,
  };
}

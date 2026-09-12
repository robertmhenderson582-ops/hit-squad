import type { HseTemplateFillDest } from "./hse-template-form.ts";
import {
  HSE_TEMPLATE_FILL_RIPPLE_SURFACES,
  HSE_TEMPLATE_FILL_RIPPLE_NEVER,
} from "./hse-template-form-ripple.ts";

/**
 * Standing feed-in / feed-out bar.
 * Every always-displayed HSE form must design both directions. One-way-only is a fail.
 */
export const HSE_TEMPLATE_FEED_RULE =
  "Always-displayed HSE forms feed in (open → fill → save to job/prepackage) and feed out (list → retrieve → re-open → edit → re-save → download). One-way-only is a fail.";

export const HSE_TEMPLATE_FEED_IN = ["open-blank", "fill", "save-job", "save-prepackage"] as const;
export const HSE_TEMPLATE_FEED_OUT = [
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

export type HseTemplateFeedIn = (typeof HSE_TEMPLATE_FEED_IN)[number];
export type HseTemplateFeedOut = (typeof HSE_TEMPLATE_FEED_OUT)[number];

export function hseTemplateFeedSurfaces(dest: HseTemplateFillDest) {
  if (dest === "prepackage") {
    return {
      in: ["open-blank", "fill", "save-prepackage"] as HseTemplateFeedIn[],
      out: [
        "list-prepackage-shelf",
        "list-vault-tree",
        "retrieve",
        "reopen",
        "edit-resave",
        "download",
        "parse-download",
      ] as HseTemplateFeedOut[],
      list: ["prepackage-shelf", "vault-tree", "briefs-index"] as const,
      never: HSE_TEMPLATE_FILL_RIPPLE_NEVER,
    };
  }
  return {
    in: ["open-blank", "fill", "save-job"] as HseTemplateFeedIn[],
    out: [
      "list-job-folder",
      "list-job-package",
      "list-vault-tree",
      "retrieve",
      "reopen",
      "edit-resave",
      "download",
      "parse-download",
    ] as HseTemplateFeedOut[],
    list: ["job-folder", "job-package", "vault-tree", "briefs-index"] as const,
    never: HSE_TEMPLATE_FILL_RIPPLE_NEVER,
  };
}

export function hseTemplateFeedComplete(hits: {
  in: readonly HseTemplateFeedIn[];
  out: readonly HseTemplateFeedOut[];
  dest: HseTemplateFillDest;
}) {
  const need = hseTemplateFeedSurfaces(hits.dest);
  const missingIn = need.in.filter((step) => !hits.in.includes(step));
  const missingOut = need.out.filter((step) => !hits.out.includes(step));
  return {
    ok: missingIn.length === 0 && missingOut.length === 0,
    missingIn,
    missingOut,
    surfaces: HSE_TEMPLATE_FILL_RIPPLE_SURFACES,
  };
}

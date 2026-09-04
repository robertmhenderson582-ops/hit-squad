/**
 * Estimate pack JSON (vault / desk snapshot) → client workbook.
 * Same builder path as the live Export button. Does not invent numbers.
 * Empty categories are omitted (no blank Crane / OM Crane / unused labor tabs).
 *
 *   node --experimental-strip-types scripts/estimate-json-to-xlsx.ts <estimate.json> [out.xlsx]
 *   npm run estimate:xlsx -- path/to/pack.json look-samples/v151_real_cat2.xlsx
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { estimateJsonToXlsx, estimateJsonToXlsxInput, estimateWorkbookSummaryTotal } from "../lib/estimate-pack-xlsx.ts";
import { estimateXlsxFilename } from "../lib/estimate-xlsx.ts";

function usage() {
  process.stderr.write(
    "Usage: node --experimental-strip-types scripts/estimate-json-to-xlsx.ts <estimate.json> [out.xlsx]\n",
  );
}

const args = process.argv.slice(2).filter((arg) => arg !== "--report");
const report = process.argv.includes("--report") || true;
const src = args[0];
if (!src || src === "-h" || src === "--help") {
  usage();
  process.exit(src ? 0 : 1);
}

const raw = JSON.parse(readFileSync(resolve(src), "utf8"));
const { pack, input } = estimateJsonToXlsxInput(raw);
const out = resolve(args[1] || estimateXlsxFilename({ site: pack.site, title: pack.title }));
mkdirSync(dirname(out), { recursive: true });
const bytes = await estimateJsonToXlsx(raw);
writeFileSync(out, bytes);
const total = estimateWorkbookSummaryTotal(input);
const summary = {
  packId: pack.packId,
  title: pack.title,
  client: pack.client,
  site: pack.site,
  source: resolve(src),
  out,
  bytes: bytes.byteLength,
  estimateTotal: total,
};
if (report) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

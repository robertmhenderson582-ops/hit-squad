/**
 * Write the synthetic Cost report Look sample.
 *   npm run cost-report:xlsx
 * Output is invented SAMPLE dollars only — never Mike / P66 source books.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sampleCostReportInput } from "../lib/cost-report-sample.ts";
import { costReportToXlsx, costReportXlsxFilename } from "../lib/cost-report-xlsx.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out =
  process.argv[2] ||
  resolve(here, "..", "look-samples", costReportXlsxFilename({
    site: "wood-river",
    title: "sample-boiler-outage",
    statusDate: "2026-09-03",
  }));

const bytes = await costReportToXlsx(sampleCostReportInput());
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(out);
console.log(bytes.byteLength);

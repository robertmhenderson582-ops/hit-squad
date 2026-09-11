/**
 * Derive the checked-in T&M preview fixture from the Union_TM extract.
 * Does not read or commit the official xlsx / xlsm.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildWoodRiverTmB1PreviewSource } from "../lib/rate-vault-wood-river-tm-b1.ts";

const out = fileURLToPath(new URL("../lib/rate-vault/wood-river-tm-b1-preview-fixture.json", import.meta.url));
writeFileSync(out, `${JSON.stringify(buildWoodRiverTmB1PreviewSource(), null, 2)}\n`);
console.log(`wrote ${out}`);

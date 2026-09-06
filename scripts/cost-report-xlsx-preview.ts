/**
 * HTML preview of the SAMPLE PPR workbook for Look screenshots.
 * Reads the generated .xlsx — does not invent a second layout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "look-samples", "hit-squad-wood-river-sample-boiler-outage-ppr-2026-09-03.xlsx");
const out = process.argv[2] || resolve("/opt/cursor/artifacts", "cost_report_ppr_preview.html");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(src);

function argb(cell: ExcelJS.Cell) {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  const raw = String(fill?.fgColor?.argb ?? "FFFFFFFF");
  return `#${raw.replace(/^FF/i, "")}`;
}

function ink(cell: ExcelJS.Cell) {
  const color = String(cell.font?.color?.argb ?? "FF102226");
  return `#${color.replace(/^FF/i, "")}`;
}

function shown(cell: ExcelJS.Cell) {
  const raw = cell.value as { formula?: string; result?: unknown } | string | number | null;
  let value: unknown = raw;
  if (raw && typeof raw === "object" && "result" in raw) value = raw.result;
  else if (raw && typeof raw === "object" && "formula" in raw) value = raw.result ?? `=${raw.formula}`;
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const fmt = String(cell.numFmt || "");
    if (/\$/.test(fmt)) {
      return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
    }
    if (/%/.test(fmt)) return `${(value * 100).toFixed(1)}%`;
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return String(value);
}

function table(ws: ExcelJS.Worksheet, maxRow: number, maxCol: number) {
  const rows: string[] = [];
  for (let r = 1; r <= maxRow; r += 1) {
    const cols: string[] = [];
    for (let c = 1; c <= maxCol; c += 1) {
      const cell = ws.getCell(r, c);
      const text = shown(cell)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      cols.push(
        `<td style="background:${argb(cell)};color:${ink(cell)};font-weight:${cell.font?.bold ? 700 : 400};padding:3px 5px;border:1px solid #c5d0ce;font-size:10px;white-space:nowrap;max-width:140px;overflow:hidden">${text}</td>`,
      );
    }
    rows.push(`<tr>${cols.join("")}</tr>`);
  }
  return `<table cellspacing="0">${rows.join("")}</table>`;
}

const cover = wb.getWorksheet("Cover")!;
const ppr = wb.getWorksheet("Total Project PPR")!;
const t15 = wb.getWorksheet("T3 Export 15")!;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>SAMPLE Cost PPR preview</title>
<style>
  body { margin: 0; background: #e8eeed; font-family: Calibri, Arial, sans-serif; }
  section { margin: 20px; background: #fff; padding: 12px; box-shadow: 0 1px 6px rgba(0,0,0,.12); overflow: auto; }
  h1 { color: #0F5F6D; margin: 0 0 10px; font-size: 18px; }
  .sheet table { border-collapse: collapse; }
</style></head><body>
<section id="cover"><h1>Cover</h1><div class="sheet">${table(cover, 18, 5)}</div></section>
<section id="ppr"><h1>Total Project PPR</h1><div class="sheet">${table(ppr, 32, 20)}</div></section>
<section id="t15"><h1>T3 Export 15 header</h1><div class="sheet">${table(t15, 10, 7)}</div></section>
</body></html>`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out);

/**
 * HTML preview of the SAMPLE PPR workbook for Look screenshots.
 * Reads the generated .xlsx — does not invent a second layout.
 * Excel charts are native OOXML; this page draws SVG from _ChartData so
 * Robert can see the subcontractor pie without opening Excel.
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

const STEEL = "#0F5F6D";
const AMBER = "#E38B2A";
const TEAL = "#1A7A88";
const DEEP = "#083943";
const CYAN = "#00B0F0";
const GOLD = "#C4922A";
const SLATE = "#5B6F73";
const MINT = "#8AA3A1";
const SLICES = [STEEL, AMBER, TEAL, DEEP, CYAN, GOLD, SLATE, MINT];

function argb(cell: ExcelJS.Cell) {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  const raw = String(fill?.fgColor?.argb ?? "FFFFFFFF");
  return `#${raw.replace(/^FF/i, "")}`;
}

function ink(cell: ExcelJS.Cell) {
  const color = String(cell.font?.color?.argb ?? "FF102226");
  return `#${color.replace(/^FF/i, "")}`;
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const raw = cell.value as { formula?: string; result?: unknown } | string | number | null;
  if (raw && typeof raw === "object" && "result" in raw) return raw.result;
  if (raw && typeof raw === "object" && "formula" in raw) return raw.result ?? 0;
  return raw;
}

function shown(cell: ExcelJS.Cell) {
  const value = cellValue(cell);
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

function pairs(ws: ExcelJS.Worksheet, labelCol: string, valueCol: string, start = 7, end = 18) {
  const out: Array<{ label: string; value: number }> = [];
  for (let row = start; row <= end; row += 1) {
    const label = String(cellValue(ws.getCell(`${labelCol}${row}`)) ?? "").trim();
    const value = Number(cellValue(ws.getCell(`${valueCol}${row}`)) ?? 0);
    if (!label) continue;
    out.push({ label, value: Number.isFinite(value) ? value : 0 });
  }
  return out;
}

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function doughnutSvg(items: Array<{ label: string; value: number }>, title: string) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const cx = 160;
  const cy = 150;
  const r = 92;
  const r0 = 52;
  let angle = -Math.PI / 2;
  const slices = items.map((item, idx) => {
    const sweep = (item.value / total) * Math.PI * 2;
    const a1 = angle;
    const a2 = angle + sweep;
    angle = a2;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const ix1 = cx + r0 * Math.cos(a1);
    const iy1 = cy + r0 * Math.sin(a1);
    const ix2 = cx + r0 * Math.cos(a2);
    const iy2 = cy + r0 * Math.sin(a2);
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r0} ${r0} 0 ${large} 0 ${ix1} ${iy1} Z`;
    return `<path d="${d}" fill="${SLICES[idx % SLICES.length]}"/>`;
  });
  const legend = items
    .map(
      (item, idx) =>
        `<div class="leg"><span class="sw" style="background:${SLICES[idx % SLICES.length]}"></span>${item.label}<b>${money(item.value)}</b></div>`,
    )
    .join("");
  return `<figure class="tile"><h2>${title}</h2><svg viewBox="0 0 320 300" width="320" height="300">${slices.join("")}</svg><div class="legend">${legend}</div></figure>`;
}

function barSvg(
  cats: string[],
  series: Array<{ name: string; values: number[]; color: string }>,
  title: string,
  moneyAxis = true,
) {
  const width = 420;
  const height = 260;
  const pad = { l: 48, r: 12, t: 10, b: 58 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  const groupW = innerW / Math.max(1, cats.length);
  const barW = (groupW * 0.7) / Math.max(1, series.length);
  const bars: string[] = [];
  cats.forEach((cat, i) => {
    series.forEach((ser, s) => {
      const value = ser.values[i] ?? 0;
      const h = (value / max) * innerH;
      const x = pad.l + i * groupW + groupW * 0.15 + s * barW;
      const y = pad.t + innerH - h;
      bars.push(`<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${ser.color}"/>`);
    });
  });
  const labels = cats
    .map((cat, i) => {
      const x = pad.l + i * groupW + groupW / 2;
      return `<text x="${x}" y="${height - 8}" text-anchor="middle" font-size="9" fill="#102226">${cat.replaceAll("&", "&amp;")}</text>`;
    })
    .join("");
  const fmt = (n: number) => (moneyAxis ? money(n) : n.toLocaleString("en-US", { maximumFractionDigits: 0 }));
  const legend = series.map((ser) => `<div class="leg"><span class="sw" style="background:${ser.color}"></span>${ser.name}</div>`).join("");
  return `<figure class="tile"><h2>${title}</h2><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <line x1="${pad.l}" y1="${pad.t + innerH}" x2="${width - pad.r}" y2="${pad.t + innerH}" stroke="#8AA3A1"/>
    ${bars.join("")}${labels}
    <text x="${pad.l}" y="${pad.t + 8}" font-size="9" fill="#5B6F73">${fmt(max)}</text>
  </svg><div class="legend">${legend}</div></figure>`;
}

const charts = wb.getWorksheet("Charts")!;
const cover = wb.getWorksheet("Cover")!;
const ppr = wb.getWorksheet("Total Project PPR")!;
const t15 = wb.getWorksheet("T3 Export 15")!;
const data = wb.getWorksheet("_ChartData")!;

const vendors = pairs(data, "A", "B");
const mixLabels = pairs(data, "D", "E").map((item) => item.label);
const mixBudget = pairs(data, "D", "E").map((item) => item.value);
const mixActual = pairs(data, "D", "F").map((item) => item.value);
const expended = pairs(data, "H", "I");
const crafts = pairs(data, "K", "L");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>SAMPLE Cost PPR preview</title>
<style>
  body { margin: 0; background: #e8eeed; font-family: Calibri, Arial, sans-serif; color: #102226; }
  header.dash { background: ${STEEL}; color: #fff; padding: 18px 22px; }
  header.dash h1 { margin: 0 0 6px; font-size: 28px; }
  header.dash p { margin: 0; opacity: .9; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
  .tile { background: #fff; margin: 0; padding: 10px 12px 14px; box-shadow: 0 1px 6px rgba(0,0,0,.12); }
  .tile h2 { color: ${STEEL}; font-size: 15px; margin: 0 0 8px; }
  .legend { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .leg { display: flex; align-items: center; gap: 8px; }
  .leg b { margin-left: auto; }
  .sw { width: 12px; height: 12px; display: inline-block; border-radius: 2px; }
  section { margin: 20px; background: #fff; padding: 12px; box-shadow: 0 1px 6px rgba(0,0,0,.12); overflow: auto; }
  h1.sheet { color: ${STEEL}; margin: 0 0 10px; font-size: 18px; }
  .sheet table { border-collapse: collapse; }
</style></head><body>
<header class="dash">
  <h1>HIT SQUAD</h1>
  <p>${shown(charts.getCell("A2"))}</p>
  <p>${shown(charts.getCell("A3"))} · ${shown(charts.getCell("A5"))}</p>
</header>
<div class="grid" id="charts">
  ${doughnutSvg(vendors, "Subcontractor costs — live pack by vendor")}
  ${barSvg(mixLabels, [
    { name: "Current Forecast $", values: mixBudget, color: STEEL },
    { name: "Expended $", values: mixActual, color: AMBER },
  ], "Cost element mix — Current Forecast vs Expended")}
  ${barSvg(
    expended.map((item) => item.label),
    [{ name: "Expended $", values: expended.map((item) => item.value), color: STEEL }],
    "Dollars expended to date — major PPR rows",
  )}
  ${barSvg(
    crafts.map((item) => item.label),
    [{ name: "Hours", values: crafts.map((item) => item.value), color: AMBER }],
    "Hours by craft — T3 Export 16 Units",
    false,
  )}
</div>
<section id="cover"><h1 class="sheet">Cover</h1><div class="sheet">${table(cover, 18, 5)}</div></section>
<section id="ppr"><h1 class="sheet">Total Project PPR</h1><div class="sheet">${table(ppr, 32, 20)}</div></section>
<section id="t15"><h1 class="sheet">T3 Export 15 header</h1><div class="sheet">${table(t15, 12, 7)}</div></section>
</body></html>`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out);

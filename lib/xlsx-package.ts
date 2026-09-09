/**
 * OOXML / Excel-open sanity for estimate (and other) .xlsx bytes.
 * ExcelJS can load files Excel desktop refuses — this checks the zip,
 * worksheet XML, style count, VML comment idmap, defined names, and
 * the worksheet child order Excel Desktop repairs (picture / legacyDrawing).
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { REQUIRED_XLSX_PARTS } from "./xlsx-minimal.ts";

/** Excel workbook style xf ceiling (~64,490). Past this, Excel calls the file corrupt. */
export const EXCEL_CELL_XF_LIMIT = 64_000;
/**
 * ExcelJS writes `o:idmap data="1"` and ids `_x0000_s${1025+index}`.
 * Block 1 is shape ids 1024–2047 — about 1023 comments per sheet.
 */
export const EXCELJS_VML_IDMAP_CAPACITY = 1023;
/** Leave headroom under the idmap so logo / drawing rIds cannot collide. */
export const EXCELJS_VML_COMMENT_SAFE = 800;
/** Writer (`xlsx-exceljs`) keeps a local copy of this number — do not import this file from the writer. */
/** Excel drops / repair-strips a formula past ~8192 chars. Keep well under. */
export const EXCEL_FORMULA_CHAR_LIMIT = 4096;

/**
 * ECMA-376 CT_Worksheet sequence (subset we emit). Excel repairs inversions.
 * drawing → legacyDrawing → picture is the logo+comments case.
 */
export const WORKSHEET_CHILD_ORDER = [
  "sheetPr",
  "dimension",
  "sheetViews",
  "sheetFormatPr",
  "cols",
  "sheetData",
  "sheetCalcPr",
  "sheetProtection",
  "autoFilter",
  "mergeCells",
  "conditionalFormatting",
  "dataValidations",
  "hyperlinks",
  "printOptions",
  "pageMargins",
  "pageSetup",
  "headerFooter",
  "rowBreaks",
  "colBreaks",
  "drawing",
  "legacyDrawing",
  "picture",
  "tableParts",
  "extLst",
] as const;

export type XlsxPackageReport = {
  bytes: number;
  parts: string[];
  sheets: string[];
  cellXfs: number;
  commentsByPart: Record<string, number>;
  vmlShapesByPart: Record<string, number>;
  printAreas: string[];
};

function zipPartNames(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
}

function countXmlTags(xml: string, tag: string): number {
  const re = new RegExp(`<${tag}\\b`, "g");
  return xml.match(re)?.length ?? 0;
}

function vmlShapeIds(xml: string): number[] {
  const ids: number[] = [];
  for (const match of xml.matchAll(/id="_x0000_s(\d+)"/g)) {
    ids.push(Number(match[1]));
  }
  return ids;
}

export function worksheetTopLevelTags(xml: string): string[] {
  const start = xml.search(/<worksheet\b[^>]*>/);
  if (start < 0) return [];
  const openEnd = xml.indexOf(">", start);
  const close = xml.lastIndexOf("</worksheet>");
  if (openEnd < 0 || close < 0) return [];
  const inner = xml.slice(openEnd + 1, close);
  const tags: string[] = [];
  let depth = 0;
  for (const match of inner.matchAll(/<\/?([A-Za-z][\w:]*)\b[^>]*\/?>/g)) {
    const token = match[0];
    const name = match[1];
    if (token.startsWith("</")) {
      depth -= 1;
      continue;
    }
    if (depth === 0) tags.push(name);
    if (!token.endsWith("/>")) depth += 1;
  }
  return tags;
}

function assertWorksheetChildOrder(name: string, xml: string) {
  const tags = worksheetTopLevelTags(xml);
  const rank = new Map(WORKSHEET_CHILD_ORDER.map((tag, index) => [tag, index]));
  let last = -1;
  for (const tag of tags) {
    const index = rank.get(tag as (typeof WORKSHEET_CHILD_ORDER)[number]);
    if (index == null) continue;
    if (index < last) throw new Error(`xlsx-sheet-order:${name}:${tag}`);
    last = index;
  }
}

function assertSheetPrOrder(name: string, xml: string) {
  const block = xml.match(/<sheetPr\b[\s\S]*?(?:\/>|<\/sheetPr>)/)?.[0] ?? "";
  if (!block.includes("<")) return;
  const kids = [...block.matchAll(/<(tabColor|outlinePr|pageSetUpPr)\b/g)].map((match) => match[1]);
  const order = ["tabColor", "outlinePr", "pageSetUpPr"];
  let last = -1;
  for (const kid of kids) {
    const index = order.indexOf(kid);
    if (index < last) throw new Error(`xlsx-sheetpr-order:${name}:${kid}`);
    last = index;
  }
}

function a1ToRC(a1: string): { r: number; c: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(a1);
  if (!match) return null;
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(match[2]), c: col };
}

function parseMergeRange(ref: string): { r1: number; r2: number; c1: number; c2: number } | null {
  const [start, end] = ref.split(":");
  const a = a1ToRC(start ?? "");
  const b = a1ToRC(end ?? start ?? "");
  if (!a || !b) return null;
  return { r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) };
}

function assertMergeOverlap(name: string, xml: string) {
  const ranges = [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)]
    .map((match) => ({ ref: match[1], box: parseMergeRange(match[1]) }))
    .filter((row): row is { ref: string; box: NonNullable<ReturnType<typeof parseMergeRange>> } => Boolean(row.box));
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i].box;
      const b = ranges[j].box;
      if (a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2) {
        throw new Error(`xlsx-merge-overlap:${name}:${ranges[i].ref}x${ranges[j].ref}`);
      }
    }
  }
}

function assertPrintAreaNames(workbookXml: string): string[] {
  const areas: string[] = [];
  for (const match of workbookXml.matchAll(/<definedName name="_xlnm\.Print_Area"[^>]*>([^<]+)<\/definedName>/g)) {
    const body = match[1]
      .replaceAll("&apos;", "'")
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&");
    areas.push(body);
    // Excel repairs `'Sheet'!$A1:$C15` (row not absolute). Whole-row/col titles are fine.
    if (/!\$[A-Z]+\d+:\$[A-Z]+\d+/.test(body)) {
      throw new Error(`xlsx-print-area-rel:${body}`);
    }
    if (!/!\$[A-Z]+\$\d+:\$[A-Z]+\$\d+/.test(body) && !/!\$[A-Z]+:\$[A-Z]+/.test(body) && !/!\$\d+:\$\d+/.test(body)) {
      throw new Error(`xlsx-print-area:${body}`);
    }
  }
  return areas;
}

function relTargets(relsXml: string): Array<{ id: string; type: string; target: string }> {
  return [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    return {
      id: /Id="([^"]+)"/.exec(tag)?.[1] ?? "",
      type: /Type="([^"]+)"/.exec(tag)?.[1] ?? "",
      target: /Target="([^"]+)"/.exec(tag)?.[1] ?? "",
    };
  });
}

function resolveRelTarget(sheetPath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const dir = sheetPath.replace(/\/[^/]+$/, "/");
  const parts = `${dir}${target}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

export async function inspectEstimateXlsx(bytes: Uint8Array): Promise<XlsxPackageReport> {
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("xlsx-not-zip");
  }
  const zip = await JSZip.loadAsync(bytes);
  const parts = zipPartNames(zip);
  for (const part of REQUIRED_XLSX_PARTS) {
    if (!parts.includes(part) && !parts.some((item) => item.endsWith(part))) {
      throw new Error(`xlsx-missing-part:${part}`);
    }
  }

  const workbookXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const sheets = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((match) => match[1]);
  const seen = new Set<string>();
  for (const name of sheets) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`xlsx-duplicate-sheet:${name}`);
    seen.add(key);
  }

  const printAreas = assertPrintAreaNames(workbookXml);

  const commentsByPart: Record<string, number> = {};
  const vmlShapesByPart: Record<string, number> = {};
  const partSet = new Set(parts);
  for (const name of parts) {
    if (!/\.(xml|vml|rels)$/i.test(name)) continue;
    const xml = (await zip.file(name)?.async("string")) ?? "";
    if (!xml) continue;
    if (/<v>NaN<\/v>|<v>-?Infinity<\/v>/i.test(xml)) {
      throw new Error(`xlsx-nonfinite:${name}`);
    }
    if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name)) {
      for (const rel of relTargets(xml)) {
        if (!rel.target || /^(https?:|mailto:)/i.test(rel.target)) continue;
        const resolved = resolveRelTarget(name.replace("/_rels/", "/").replace(".rels", ""), rel.target);
        if (!partSet.has(resolved)) throw new Error(`xlsx-orphan-rel:${name}:${rel.target}`);
      }
    }
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      if (!xml.includes("<worksheet") || !xml.includes("</worksheet>")) {
        throw new Error(`xlsx-truncated-sheet:${name}`);
      }
      assertWorksheetChildOrder(name, xml);
      assertSheetPrOrder(name, xml);
      assertMergeOverlap(name, xml);
      const cols = [...xml.matchAll(/<col min="(\d+)" max="(\d+)"/g)];
      for (const col of cols) {
        const min = Number(col[1]);
        const max = Number(col[2]);
        if (!min || !max || min > max || max > 16384) {
          throw new Error(`xlsx-bad-col:${name}:${min}-${max}`);
        }
      }
      for (const formula of xml.matchAll(/<f\b[^>]*>([^<]*)<\/f>/g)) {
        if (formula[1].length > EXCEL_FORMULA_CHAR_LIMIT) {
          throw new Error(`xlsx-formula-overflow:${name}:${formula[1].length}`);
        }
      }
      const relsName = name.replace("xl/worksheets/", "xl/worksheets/_rels/") + ".rels";
      const rels = relTargets((await zip.file(relsName)?.async("string")) ?? "");
      const hasLegacy = /<legacyDrawing\b/.test(xml);
      const hasPicture = /<picture\b/.test(xml);
      const vmlRel = rels.find((rel) => /\/vmlDrawing$/.test(rel.type));
      const commentRel = rels.find((rel) => /\/comments$/.test(rel.type));
      const imageRel = rels.find((rel) => /\/image$/.test(rel.type));
      if (hasLegacy !== Boolean(vmlRel)) throw new Error(`xlsx-legacy-rel:${name}`);
      if (hasPicture !== Boolean(imageRel)) throw new Error(`xlsx-picture-rel:${name}`);
      if (Boolean(vmlRel) !== Boolean(commentRel)) throw new Error(`xlsx-comment-rel:${name}`);
    }
    if (/^xl\/comments\d+\.xml$/.test(name)) {
      commentsByPart[name] = countXmlTags(xml, "comment");
      if (commentsByPart[name] > EXCELJS_VML_IDMAP_CAPACITY) {
        throw new Error(`xlsx-comment-overflow:${name}:${commentsByPart[name]}`);
      }
      const n = name.match(/comments(\d+)\.xml$/)?.[1];
      const vml = n ? `xl/drawings/vmlDrawing${n}.vml` : "";
      if (vml && !partSet.has(vml)) throw new Error(`xlsx-comments-without-vml:${name}`);
    }
    if (/^xl\/drawings\/vmlDrawing\d+\.vml$/.test(name)) {
      const ids = vmlShapeIds(xml);
      vmlShapesByPart[name] = ids.length;
      for (const id of ids) {
        if (id < 1025 || id > 2047) {
          throw new Error(`xlsx-vml-idmap:${name}:s${id}`);
        }
      }
      const n = name.match(/vmlDrawing(\d+)\.vml$/)?.[1];
      const comments = n ? `xl/comments${n}.xml` : "";
      if (comments && !partSet.has(comments)) throw new Error(`xlsx-vml-without-comments:${name}`);
    }
  }

  for (const [commentsPart, count] of Object.entries(commentsByPart)) {
    const n = commentsPart.match(/comments(\d+)\.xml$/)?.[1];
    const vmlPart = n ? `xl/drawings/vmlDrawing${n}.vml` : "";
    if (vmlPart && (vmlShapesByPart[vmlPart] ?? 0) !== count) {
      throw new Error(`xlsx-comment-vml-mismatch:${commentsPart}`);
    }
  }

  const styles = (await zip.file("xl/styles.xml")?.async("string")) ?? "";
  const cellXfs = /<cellXfs\b[^>]*count="(\d+)"/.exec(styles);
  const xfCount = cellXfs ? Number(cellXfs[1]) : countXmlTags(styles, "xf");
  if (xfCount > EXCEL_CELL_XF_LIMIT) {
    throw new Error(`xlsx-style-overflow:${xfCount}`);
  }

  return {
    bytes: bytes.byteLength,
    parts,
    sheets,
    cellXfs: xfCount,
    commentsByPart,
    vmlShapesByPart,
    printAreas,
  };
}

export async function assertOpenableEstimateXlsx(bytes: Uint8Array): Promise<XlsxPackageReport> {
  const report = await inspectEstimateXlsx(bytes);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  if (!wb.worksheets.length) throw new Error("xlsx-empty-workbook");
  const loaded = new Set(wb.worksheets.map((sheet) => sheet.name.toLowerCase()));
  for (const name of report.sheets) {
    if (!loaded.has(name.toLowerCase())) throw new Error(`xlsx-sheet-unreadable:${name}`);
  }
  return report;
}

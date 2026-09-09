/**
 * OOXML / Excel-open sanity for estimate (and other) .xlsx bytes.
 * ExcelJS can load files Excel desktop refuses — this checks the zip,
 * worksheet XML, style count, and the VML comment idmap ExcelJS writes.
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

export type XlsxPackageReport = {
  bytes: number;
  parts: string[];
  sheets: string[];
  cellXfs: number;
  commentsByPart: Record<string, number>;
  vmlShapesByPart: Record<string, number>;
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

  const commentsByPart: Record<string, number> = {};
  const vmlShapesByPart: Record<string, number> = {};
  for (const name of parts) {
    if (!/\.(xml|vml|rels)$/i.test(name)) continue;
    const xml = (await zip.file(name)?.async("string")) ?? "";
    if (!xml) continue;
    if (/<v>NaN<\/v>|<v>-?Infinity<\/v>/i.test(xml)) {
      throw new Error(`xlsx-nonfinite:${name}`);
    }
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      if (!xml.includes("<worksheet") || !xml.includes("</worksheet>")) {
        throw new Error(`xlsx-truncated-sheet:${name}`);
      }
      const cols = [...xml.matchAll(/<col min="(\d+)" max="(\d+)"/g)];
      for (const col of cols) {
        const min = Number(col[1]);
        const max = Number(col[2]);
        if (!min || !max || min > max || max > 16384) {
          throw new Error(`xlsx-bad-col:${name}:${min}-${max}`);
        }
      }
    }
    if (/^xl\/comments\d+\.xml$/.test(name)) {
      commentsByPart[name] = countXmlTags(xml, "comment");
      if (commentsByPart[name] > EXCELJS_VML_IDMAP_CAPACITY) {
        throw new Error(`xlsx-comment-overflow:${name}:${commentsByPart[name]}`);
      }
    }
    if (/^xl\/drawings\/vmlDrawing\d+\.vml$/.test(name)) {
      const ids = vmlShapeIds(xml);
      vmlShapesByPart[name] = ids.length;
      for (const id of ids) {
        if (id < 1025 || id > 2047) {
          throw new Error(`xlsx-vml-idmap:${name}:s${id}`);
        }
      }
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

/**
 * Flexible rate-sheet recognition. Paths are not universal —
 * classify from filename, extracted text, and sheet headers.
 * Human confirm is required before any catalog write. Never writes a rate book.
 */

import { inflateRawSync, inflateSync } from "node:zlib";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  RATE_VAULT_MIME,
  RATE_VAULT_SITES,
  checkRateVaultDropFile,
  isRateVaultSiteId,
  isRateVaultSourceKind,
  looksLikeForeignRateVaultSite,
  rateVaultFileExtension,
  type RateVaultColumnRole,
  type RateVaultConfirmedReview,
  type RateVaultFormat,
  type RateVaultRecognitionReview,
  type RateVaultSheetSniff,
  type RateVaultSiteId,
  type RateVaultSourceKind,
} from "./rate-vault.ts";

export type RecognizeInput = {
  fileName?: string;
  type?: string;
  data?: string;
  driveId?: string;
  sourceId?: string;
  text?: string;
  sheets?: string[];
};

const KIND_PATTERNS: Array<{ kind: RateVaultSourceKind; re: RegExp; weight: number }> = [
  { kind: "gppma", re: /\bgppma\b/i, weight: 0.34 },
  { kind: "rate-builder", re: /rate\s*sheet\s*builder|rate\s*builder/i, weight: 0.32 },
  { kind: "b1-exhibit", re: /\bexhibit\s*b[\s-]*1\b|\bb[\s-]*1\b|exhibit\s*c[\s-]*1/i, weight: 0.3 },
  { kind: "union-terms", re: /union\s+comp\s+terms|exhibit\s*c\b(?![\s-]*1)/i, weight: 0.28 },
  { kind: "local-craft-sheet", re: /wage\s*(rate\s*)?sheet|wage\s+and\s+benefits|wage\s+rates?|schedule\s*a\b/i, weight: 0.28 },
  { kind: "pla", re: /\bpla\b|project\s+labor|site\s+pla|work\s+agreement/i, weight: 0.26 },
  { kind: "comp", re: /\bcomp\b|\bgmta\b|pca0*\d{4,}/i, weight: 0.26 },
  { kind: "cba", re: /\bcba\b|\bmla\b|collective\s+bargaining|master\s+labor/i, weight: 0.24 },
];

const SITE_PATTERNS: Array<{ id: RateVaultSiteId; re: RegExp }> = [
  { id: "wood-river", re: /wood\s*river|\bwrr\b|\bwr\b|roxana|gppma/i },
  { id: "bayway", re: /bayway/i },
  { id: "rodeo", re: /\brodeo\b/i },
  { id: "ferndale", re: /ferndale|\bwashington\s+agc|\blocal\s*302\b/i },
  { id: "billings", re: /billings/i },
  { id: "east-coast", re: /east\s*coast|pca0001103|gmta[\s-]*madison/i },
];

const CRAFT_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Pipefitter", re: /\bpipe\s*fitters?\b|\bpf\b|\bua\b/i },
  { label: "Boilermaker", re: /\bboiler\s*makers?\b|\bbm\b/i },
  { label: "Electrician", re: /\belectricians?\b|\bibe w\b|\blocal\s*164\b/i },
  { label: "Ironworker", re: /\biron\s*workers?\b/i },
  { label: "Insulator", re: /\binsulators?\b/i },
  { label: "Carpenter", re: /\bcarpenters?\b/i },
  { label: "Laborer", re: /\blaborers?\b/i },
  { label: "Operator", re: /\boperators?\b|\biuoe\b/i },
];

const COLUMN_ROLES: Array<{ role: Exclude<RateVaultColumnRole, "unknown">; re: RegExp }> = [
  { role: "craft", re: /\bcraft\b|\btrade\b|\bclass(?:ification)?\b/i },
  { role: "position", re: /\bposition\b|\btitle\b|\bjob\b/i },
  { role: "wage", re: /\bwage\b|\bbase\b|\bbw\b|\bst\b|straight/i },
  { role: "fringe", re: /\bfringe\b|\bbenefit\b|\bh\s*&\s*w\b|\bpension\b|\bannuity\b|\bpd\b/i },
  { role: "burden", re: /\bburden\b|\bmarkup\b|\boh\b|\boverhead\b/i },
  { role: "local", re: /\blocal\b|\bhall\b|\bl\s*#/i },
  { role: "ot", re: /\bot\b|overtime/i },
  { role: "dt", re: /\bdt\b|double/i },
  { role: "bill", re: /\bbill(?:ed|ing)?\b|\bbill\s*rate\b/i },
];

function decodeBase64(data: string) {
  const compact = data.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  return Buffer.from(compact, "base64");
}

export function detectRateVaultFormat(fileName = "", mime = ""): RateVaultFormat {
  const ext = rateVaultFileExtension(fileName);
  if (ext && ext in RATE_VAULT_MIME) return ext as RateVaultFormat;
  const type = mime.split(";")[0].trim().toLowerCase();
  for (const [key, types] of Object.entries(RATE_VAULT_MIME)) {
    if (types.includes(type)) return key as RateVaultFormat;
  }
  return "unknown";
}

export function guessRateVaultKind(hay = ""): { kind: RateVaultSourceKind | "unknown"; score: number } {
  let best: { kind: RateVaultSourceKind | "unknown"; score: number } = { kind: "unknown", score: 0 };
  for (const row of KIND_PATTERNS) {
    if (row.re.test(hay) && row.weight > best.score) best = { kind: row.kind, score: row.weight };
  }
  return best;
}

export function guessRateVaultSite(hay = ""): RateVaultSiteId | null {
  if (looksLikeForeignRateVaultSite(hay)) return null;
  for (const row of SITE_PATTERNS) {
    if (row.re.test(hay)) return row.id;
  }
  return null;
}

export function guessRateVaultCraft(hay = "") {
  for (const row of CRAFT_PATTERNS) {
    if (row.re.test(hay)) return row.label;
  }
  return null;
}

export function guessRateVaultLocal(hay = "") {
  const match = hay.match(/\b(?:local|l)[\s._-]*([0-9]{2,4})\b/i);
  return match?.[1] ?? null;
}

export function guessColumnRole(header: string): RateVaultColumnRole {
  const text = header.trim();
  if (!text) return "unknown";
  for (const row of COLUMN_ROLES) {
    if (row.re.test(text)) return row.role;
  }
  return "unknown";
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "text" in (value as { text?: unknown }) && typeof (value as { text?: unknown }).text === "string") {
    return (value as { text: string }).text;
  }
  if (typeof value === "object" && "richText" in (value as { richText?: Array<{ text?: string }> })) {
    return ((value as { richText?: Array<{ text?: string }> }).richText ?? []).map((part) => part.text || "").join("");
  }
  return "";
}

function rowLooksLikeHeader(cells: string[]) {
  const roles = cells.map(guessColumnRole).filter((role) => role !== "unknown");
  return roles.length >= 2;
}

export function sniffSheetHeaders(sheetName: string, rows: string[][]): RateVaultSheetSniff {
  let headerRow: number | null = null;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const cells = rows[i].map((cell) => cell.trim()).filter(Boolean);
    if (rowLooksLikeHeader(cells)) {
      headerRow = i + 1;
      headers = rows[i].map((cell) => cell.trim());
      break;
    }
  }
  if (!headers.length && rows[0]?.some((cell) => cell.trim())) {
    headers = rows[0].map((cell) => cell.trim());
    headerRow = 1;
  }
  return {
    name: sheetName,
    headerRow,
    headers,
    columns: headers.filter(Boolean).map((header) => ({ header, role: guessColumnRole(header) })),
  };
}

function pdfLiteralStrings(ascii: string) {
  const out: string[] = [];
  const re = /\(((?:\\.|[^\\)]){2,})\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(ascii))) {
    const text = match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\(.)/g, "$1")
      .trim();
    if (text && /[A-Za-z0-9]/.test(text)) out.push(text);
    if (out.length >= 80) break;
  }
  return out;
}

function inflatePdfStream(payload: Buffer) {
  try {
    return inflateSync(payload);
  } catch {
    try {
      return inflateRawSync(payload);
    } catch {
      return null;
    }
  }
}

export function extractPdfText(bytes: Buffer) {
  const ascii = bytes.toString("latin1");
  const parts = pdfLiteralStrings(ascii);
  const streams = ascii.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g);
  let counted = 0;
  for (const stream of streams) {
    if (counted >= 12) break;
    const raw = Buffer.from(stream[1], "latin1");
    const inflated = inflatePdfStream(raw);
    const body = (inflated ?? raw).toString("latin1");
    parts.push(...pdfLiteralStrings(body));
    counted += 1;
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

function decodeXmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function extractDocxText(bytes: Buffer) {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return "";
    return decodeXmlEntities(
      xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br\b[^/]*\/>/g, "\n")
        .replace(/<w:p[ >]/g, "\n")
        .replace(/<[^>]+>/g, ""),
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
  } catch {
    return "";
  }
}

export function extractDocStrings(bytes: Buffer) {
  const ascii = bytes.toString("latin1");
  const hits = ascii.match(/[A-Za-z][A-Za-z0-9 .,&()/_-]{8,120}/g) ?? [];
  return hits.slice(0, 40).join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

export async function sniffExcelWorkbook(bytes: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheets: RateVaultSheetSniff[] = [];
  const names: string[] = [];
  const preview: string[] = [];
  for (const ws of wb.worksheets) {
    names.push(ws.name);
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, index) => {
      if (index > 12) return;
      const values = Array.isArray(row.values) ? row.values.slice(1, 16) : [];
      rows.push(values.map(cellText));
    });
    const sniff = sniffSheetHeaders(ws.name, rows);
    sheets.push(sniff);
    preview.push(`${ws.name}: ${sniff.headers.filter(Boolean).slice(0, 8).join(" | ")}`);
  }
  return { sheets, names, preview: preview.filter((line) => line.trim().length > 3) };
}

function confidenceFromGuesses(kindScore: number, site: string | null, craft: string | null, local: string | null, extracted: boolean) {
  let score = 0.18 + kindScore;
  if (site) score += 0.16;
  if (craft) score += 0.12;
  if (local) score += 0.1;
  if (extracted) score += 0.1;
  return Math.min(0.95, Math.round(score * 100) / 100);
}

function snippetsFrom(text: string, extra: string[] = []) {
  const bits = [...extra, ...text.split(/(?<=[.!?])\s+/)].map((row) => row.trim()).filter((row) => row.length > 8);
  const unique: string[] = [];
  for (const bit of bits) {
    if (!unique.includes(bit)) unique.push(bit.slice(0, 220));
    if (unique.length >= 6) break;
  }
  return unique;
}

export async function recognizeRateVaultSource(input: RecognizeInput): Promise<RateVaultRecognitionReview | { error: string; status: number }> {
  const fileName = (input.fileName || "").trim() || (input.driveId ? `drive:${input.driveId}` : "untitled");
  const mime = (input.type || "").trim();
  if (input.data) {
    const check = checkRateVaultDropFile({ name: fileName, type: mime, data: input.data });
    if (!check.ok) return { error: check.error, status: 400 };
  }
  const format = detectRateVaultFormat(fileName, mime);
  let text = (input.text || "").trim();
  let sheets: RateVaultSheetSniff[] = [];
  let extractNote = "Classified from the file name and path tokens. Layouts are not universal.";
  let extracted = false;

  if (input.data) {
    const bytes = decodeBase64(input.data);
    if (format === "pdf") {
      text = [text, extractPdfText(bytes)].filter(Boolean).join(" ");
      extracted = Boolean(text);
      extractNote = extracted
        ? "Extracted PDF text where streams were readable."
        : "PDF text was thin — filename path still drives the guess.";
    } else if (format === "docx") {
      text = [text, await extractDocxText(bytes)].filter(Boolean).join(" ");
      extracted = Boolean(text);
      extractNote = extracted ? "Extracted Word document text." : "Word text was thin — filename path still drives the guess.";
    } else if (format === "doc") {
      text = [text, extractDocStrings(bytes)].filter(Boolean).join(" ");
      extracted = Boolean(text);
      extractNote = "Legacy Word (.doc) — readable strings only. Open the Drive file for the full book.";
    } else if (format === "xlsx" || format === "xlsm") {
      try {
        const excel = await sniffExcelWorkbook(bytes);
        sheets = excel.sheets;
        text = [text, excel.names.join(" "), excel.preview.join(" ")].filter(Boolean).join(" ");
        extracted = true;
        extractNote = "Listed Excel sheets and sniffed header rows. Column order is not assumed.";
      } catch {
        extractNote = "Excel open failed. Filename path still drives the guess — confirm before mapping.";
      }
    } else if (format === "xls" || format === "xlsb") {
      text = [text, extractDocStrings(bytes)].filter(Boolean).join(" ");
      extractNote =
        format === "xlsb"
          ? "Binary Excel (.xlsb) is not a universal layout. Confirm from the filename / Drive file before mapping."
          : "Legacy Excel (.xls) is path-sniffed only. Confirm before mapping.";
    }
  } else {
    extractNote = "Linked Drive id — no binary pulled into the desk. Guessed from title / path only.";
  }

  const hay = [fileName, text, ...(input.sheets ?? [])].join(" ");
  const kindGuess = guessRateVaultKind(hay);
  const site = guessRateVaultSite(hay);
  const craft = guessRateVaultCraft(hay);
  const local = guessRateVaultLocal(hay);
  const snippets = snippetsFrom(text, [fileName, ...sheets.map((sheet) => sheet.name)]);

  return {
    sourceId:
      (typeof input.sourceId === "string" && input.sourceId.trim()) ||
      (typeof input.driveId === "string" && input.driveId.trim()) ||
      `upload:${fileName}`,
    fileName,
    mime: mime || (format !== "unknown" ? RATE_VAULT_MIME[format][0] : "application/octet-stream"),
    extension: rateVaultFileExtension(fileName),
    format,
    guessedKind: kindGuess.kind,
    guessedSiteId: site,
    guessedCraft: craft,
    guessedLocal: local,
    confidence: confidenceFromGuesses(kindGuess.score, site, craft, local, extracted),
    sheets,
    snippets,
    needsConfirm: true,
    writesRateBook: false,
    extractNote,
  };
}

export function parseConfirmReview(raw: unknown, review: RateVaultRecognitionReview): RateVaultConfirmedReview | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Confirm the review card first." };
  const row = raw as Record<string, unknown>;
  const sourceId =
    (typeof row.sourceId === "string" && row.sourceId.trim()) ||
    review.sourceId ||
    "";
  if (!sourceId) return { error: "Confirm needs a source id or Drive id." };
  const kind = isRateVaultSourceKind(row.kind) ? row.kind : review.guessedKind;
  if (!isRateVaultSourceKind(kind)) return { error: "Pick a document kind before confirm." };
  const siteId = isRateVaultSiteId(row.siteId) ? row.siteId : review.guessedSiteId;
  const craft =
    typeof row.craft === "string" && row.craft.trim()
      ? row.craft.trim()
      : review.guessedCraft;
  const local =
    typeof row.local === "string" && row.local.trim()
      ? String(row.local).replace(/^l(?:ocal)?[\s-]*/i, "").trim()
      : review.guessedLocal;
  return {
    sourceId,
    kind,
    siteId,
    craft,
    local,
    confirmedAt: new Date().toISOString(),
    writesRateBook: false,
  };
}

export function reviewDoesNotWriteRateBook(review: { writesRateBook?: boolean } | null | undefined) {
  return review?.writesRateBook === false;
}

export { RATE_VAULT_SITES };
